/* ═══════════════════════════════════════════════════════════════════════════
   FableCut reference analyzer — zero-dependency Node.js (needs ffmpeg on PATH)

   Turns a reference video into an "edit blueprint": shot boundaries (cuts),
   music beats + BPM, an audio-energy curve, the drop, and the extracted music
   track — everything an agent needs to rebuild the same edit with new footage.

   Use as a module:   const { analyze } = require("./analyze");
   Use from the CLI:  node analyze.js media/ref.mp4 [--threshold=0.3] [--no-music]
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const SR = 22050;      // analysis sample rate
const HOP = 512;       // onset-envelope hop size (~23 ms)
const WIN = 1024;      // energy window

function run(cmd, args, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    const out = [], err = [];
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => resolve({
      code,
      stdout: binary ? Buffer.concat(out) : Buffer.concat(out).toString("utf8"),
      stderr: Buffer.concat(err).toString("utf8"),
    }));
  });
}

/* ── ffprobe: container + stream facts ── */
async function probe(file) {
  const r = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  if (r.code !== 0) throw new Error("ffprobe failed: " + r.stderr.slice(-400));
  const info = JSON.parse(r.stdout);
  const v = (info.streams || []).find((s) => s.codec_type === "video");
  const a = (info.streams || []).find((s) => s.codec_type === "audio");
  const dur = parseFloat(info.format?.duration || v?.duration || a?.duration || 0);
  let fps = 0;
  if (v?.avg_frame_rate && v.avg_frame_rate !== "0/0") {
    const [n, d] = v.avg_frame_rate.split("/").map(Number);
    if (d) fps = n / d;
  }
  return {
    duration: Math.round(dur * 1000) / 1000,
    fps: Math.round(fps * 100) / 100,
    width: v?.width || 0, height: v?.height || 0,
    hasVideo: !!v, hasAudio: !!a,
  };
}

/* ── Shot boundaries via ffmpeg scene-change scores ── */
async function detectCuts(file, threshold) {
  const r = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", file,
    "-vf", `select='gt(scene,${threshold})',metadata=print:file=-`,
    "-an", "-f", "null", "-",
  ]);
  // stdout pairs: "frame:0 pts:… pts_time:4.100" then "lavfi.scene_score=0.482"
  const cuts = [];
  let t = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const mT = /pts_time:([\d.]+)/.exec(line);
    if (mT) { t = parseFloat(mT[1]); continue; }
    const mS = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (mS && t !== null) {
      cuts.push({ t: Math.round(t * 1000) / 1000, score: Math.round(parseFloat(mS[1]) * 1000) / 1000 });
      t = null;
    }
  }
  return cuts;
}

/* ── Audio: decode → onset envelope → beats + BPM + energy curve ── */
async function decodePCM(file) {
  const r = await run("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { binary: true });
  if (r.code !== 0 || r.stdout.length < WIN * 2) return null;
  const buf = r.stdout;
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
}

function analyzeAudio(pcm) {
  const nFrames = Math.max(0, Math.floor((pcm.length - WIN) / HOP));
  if (nFrames < 20) return { beats: [], bpm: null, energy: { step: 0.5, values: [] }, drop: null };

  // frame energies
  const E = new Float64Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    const o = i * HOP;
    for (let j = 0; j < WIN; j++) { const x = pcm[o + j] / 32768; s += x * x; }
    E[i] = s / WIN;
  }

  // onset envelope: energy rise vs. trailing average
  const O = new Float64Array(nFrames);
  for (let i = 1; i < nFrames; i++) {
    let m = 0, k = 0;
    for (let j = Math.max(0, i - 8); j < i; j++) { m += E[j]; k++; }
    O[i] = Math.max(0, E[i] - m / k);
  }
  let oMax = 0;
  for (let i = 0; i < nFrames; i++) if (O[i] > oMax) oMax = O[i];
  if (oMax > 0) for (let i = 0; i < nFrames; i++) O[i] /= oMax;

  // peak-pick beats: local max, above an adaptive floor, min 0.25 s apart
  const frameT = (i) => Math.round(((i * HOP + WIN / 2) / SR) * 1000) / 1000;
  const minGap = Math.round(0.25 * SR / HOP);
  const halfWin = Math.round(1.0 * SR / HOP);
  const beats = [];
  let last = -minGap;
  for (let i = 3; i < nFrames - 3; i++) {
    if (O[i] < 0.05) continue;
    let isMax = true;
    for (let j = -3; j <= 3; j++) if (O[i + j] > O[i]) { isMax = false; break; }
    if (!isMax) continue;
    let m = 0, k = 0;
    for (let j = Math.max(0, i - halfWin); j < Math.min(nFrames, i + halfWin); j++) { m += O[j]; k++; }
    if (O[i] < (m / k) * 1.5) continue;
    if (i - last < minGap) continue;
    beats.push(frameT(i));
    last = i;
  }

  // BPM: autocorrelation of the onset envelope over 60–200 BPM lags,
  // with a mild prior toward ~120; fold octaves into 70–180.
  let bpm = null;
  const lagMin = Math.round(60 / 200 * SR / HOP), lagMax = Math.round(60 / 60 * SR / HOP);
  let best = 0, bestLag = 0;
  for (let lag = lagMin; lag <= Math.min(lagMax, nFrames - 1); lag++) {
    let s = 0;
    for (let i = 0; i + lag < nFrames; i++) s += O[i] * O[i + lag];
    const cand = 60 / (lag * HOP / SR);
    const w = Math.exp(-0.5 * Math.pow(Math.log2(cand / 120) / 1.0, 2));
    if (s * w > best) { best = s * w; bestLag = lag; }
  }
  if (bestLag) {
    bpm = 60 / (bestLag * HOP / SR);
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    // refine: if the picked beats are regular, the median inter-beat interval
    // is a much finer tempo estimate than the autocorrelation lag grid
    if (beats.length >= 6) {
      const gaps = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b);
      const med = gaps[Math.floor(gaps.length / 2)];
      const spread = gaps[Math.floor(gaps.length * 0.85)] - gaps[Math.floor(gaps.length * 0.15)];
      if (med > 0 && spread < med * 0.15) {
        // full span / count averages out the hop-grid quantization of each beat
        let refined = 60 / ((beats[beats.length - 1] - beats[0]) / (beats.length - 1));
        while (refined < 70) refined *= 2;
        while (refined > 180) refined /= 2;
        if (Math.abs(refined - bpm) / bpm < 0.15) bpm = refined;
      }
    }
    bpm = Math.round(bpm * 10) / 10;
  }

  // loudness curve, one value per 0.5 s, normalized 0–100
  const step = 0.5;
  const perStep = Math.round(step * SR / HOP);
  const values = [];
  for (let i = 0; i < nFrames; i += perStep) {
    let s = 0, k = 0;
    for (let j = i; j < Math.min(nFrames, i + perStep); j++) { s += Math.sqrt(E[j]); k++; }
    values.push(k ? s / k : 0);
  }
  const vMax = Math.max(...values, 1e-9);
  const energy = values.map((v) => Math.round(v / vMax * 100));

  // the drop: biggest sustained energy rise (skip the very start)
  let drop = null, bestRise = 0;
  for (let i = 2; i < energy.length - 1; i++) {
    const before = (energy[i - 2] + energy[i - 1]) / 2;
    const after = (energy[i] + energy[Math.min(i + 1, energy.length - 1)]) / 2;
    if (after - before > bestRise && after > 55) { bestRise = after - before; drop = Math.round(i * step * 10) / 10; }
  }

  return { beats, bpm, energy: { step, values: energy }, drop };
}

/* ── Extract the reference's music track into its own audio file ── */
async function extractMusic(file, outDir) {
  const stem = path.basename(file, path.extname(file)).replace(/[^\w.\- ()\[\]]+/g, "_");
  let out = path.join(outDir, stem + "-music.m4a");
  let i = 1;
  while (fs.existsSync(out)) out = path.join(outDir, `${stem}-music_${i++}.m4a`);
  const r = await run("ffmpeg", ["-y", "-i", file, "-vn", "-c:a", "aac", "-b:a", "192k", out]);
  if (r.code !== 0) { try { fs.rmSync(out); } catch {} return null; }
  return out;
}

/* ── Main entry ──
   opts: threshold  — scene-cut sensitivity (default: adaptive 0.30→0.20→0.12)
         music      — extract the audio track (default true)
         musicDir   — where the extracted music file goes (default: next to file)
         srcUrl     — how `source`/`music` are reported (e.g. "/media/ref.mp4") */
async function analyze(file, opts = {}) {
  if (!fs.existsSync(file)) throw new Error("File not found: " + file);
  const info = await probe(file);

  // shots — adaptive threshold: relax until the cut density looks like an edit
  let cuts = [], threshold = null;
  if (info.hasVideo) {
    const tries = opts.threshold ? [opts.threshold] : [0.30, 0.20, 0.12];
    for (const t of tries) {
      threshold = t;
      cuts = await detectCuts(file, t);
      if (cuts.length >= Math.max(1, info.duration / 12)) break;
    }
    // drop first-frame artifacts and duplicate detections closer than 0.15 s
    cuts = cuts.filter((c) => c.t > 0.3);
    cuts = cuts.filter((c, i) => i === 0 || c.t - cuts[i - 1].t > 0.15);
  }

  // audio
  let audio = { beats: [], bpm: null, energy: { step: 0.5, values: [] }, drop: null };
  if (info.hasAudio) {
    const pcm = await decodePCM(file);
    if (pcm) audio = analyzeAudio(pcm);
  }

  // shot list with per-shot audio energy (intensity hint for footage mapping)
  const bounds = [0, ...cuts.map((c) => c.t), info.duration];
  const shots = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const start = bounds[i], end = bounds[i + 1];
    if (end - start < 0.05) continue;
    const { step, values } = audio.energy;
    let e = null;
    if (values.length) {
      let s = 0, k = 0;
      for (let j = Math.floor(start / step); j < Math.min(values.length, Math.max(Math.floor(start / step) + 1, Math.ceil(end / step))); j++) { s += values[j]; k++; }
      e = k ? Math.round(s / k) : null;
    }
    shots.push({
      index: shots.length,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      duration: Math.round((end - start) * 1000) / 1000,
      energy: e,
    });
  }

  // music extraction
  let music = null;
  if (info.hasAudio && opts.music !== false) {
    const dir = opts.musicDir || path.dirname(file);
    const out = await extractMusic(file, dir);
    if (out) music = { file: out, name: path.basename(out) };
  }

  const avgShotLen = shots.length ? Math.round(shots.reduce((s, x) => s + x.duration, 0) / shots.length * 100) / 100 : null;
  return {
    source: opts.srcUrl || file,
    analyzedAt: new Date().toISOString(),
    duration: info.duration, fps: info.fps, width: info.width, height: info.height,
    hasAudio: info.hasAudio,
    sceneThreshold: threshold,
    cuts: cuts.map((c) => c.t),
    cutScores: cuts.map((c) => c.score),
    shots,
    avgShotLen,
    cutsPerSecond: info.duration ? Math.round(cuts.length / info.duration * 100) / 100 : 0,
    bpm: audio.bpm,
    beats: audio.beats,
    energy: audio.energy,
    drop: audio.drop,
    music: music ? { name: music.name, file: music.file } : null,
  };
}

module.exports = { analyze };

/* ── CLI ── */
if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("Usage: node analyze.js <video> [--threshold=0.3] [--no-music]"); process.exit(1); }
  const tArg = args.find((a) => a.startsWith("--threshold="));
  analyze(path.resolve(file), {
    threshold: tArg ? parseFloat(tArg.split("=")[1]) : undefined,
    music: !args.includes("--no-music"),
  }).then((bp) => console.log(JSON.stringify(bp, null, 2)))
    .catch((e) => { console.error("analyze failed: " + e.message); process.exit(1); });
}
