/* Generates demo/demo-project.json — the timeline the hosted WebMCP demo opens
   with.                                            [new work — WebMCP Challenge]

   Built only from assets that ship with FableCut under MIT (library/svg/*.svg,
   authored for this project) plus text and adjustment layers, which need no
   media at all. Nothing here is client work or third-party audio, so the demo
   is safe to publish under the repository's licence.

   Run:  node demo/make-demo-project.js
*/
"use strict";
const fs = require("fs");
const path = require("path");

/* Mirrors DEFAULT_PROPS in app.js. Every clip carries the full prop set. */
const BASE = {
  x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, volume: 1, speed: 1,
  brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0,
  grayscale: 0, sepia: 0, invert: 0, temperature: 0, tint: 0, vignette: 0,
  filterPreset: "none", fit: "contain", cropL: 0, cropT: 0, cropR: 0, cropB: 0,
  flipH: false, flipV: false, cornerRadius: 0, blend: "normal",
  chromaKey: "", chromaTolerance: 26, chromaSoftness: 12, bgRemove: false,
  shake: 0, shakeSpeed: 8, rgbSplit: 0, grain: 0,
  text: "Title", fontSize: 72, color: "#ffffff", color2: "", font: "Inter",
  bold: true, italic: false, weight: 0, align: "center", letterSpacing: 0,
  lineHeight: 1.2, uppercase: false, textShadow: 12, glow: 0, glowColor: "",
  textAnim: "none", wordRate: 0.15, direction: "auto",
  strokeWidth: 0, strokeColor: "#000000", bgColor: "#000000", bgOpacity: 0,
  boxW: 0, boxH: 0, boxFit: false, vAlign: "middle",
};
const props = (o) => Object.assign({}, BASE, o);

/* Four vector shots on V1, from the MIT-licensed library that ships with the
   editor. Each one is a visually distinct beat so a split or a trim is
   obvious on screen when an agent performs it. */
const SHOTS = [
  { file: "glow-orbs.svg", name: "shot 1 - orbs", start: 0.0, dur: 3.4 },
  { file: "radial-pulse.svg", name: "shot 2 - pulse", start: 3.4, dur: 3.2 },
  { file: "burst-lines.svg", name: "shot 3 - burst", start: 6.6, dur: 3.4 },
  { file: "sparkles.svg", name: "shot 4 - sparkles", start: 10.0, dur: 3.6 },
];

const TITLES = [
  {
    id: "c_title_hook", name: "hook", start: 0.4, dur: 3.0,
    text: "EDIT IT\nTOGETHER", fontSize: 132, font: "Anton",
    color: "#ffffff", color2: "#7b6cff", letterSpacing: 4, uppercase: true,
    textShadow: 20, y: -40, transitionIn: { type: "zoom", duration: 0.6 },
  },
  {
    id: "c_title_mid", name: "point", start: 4.0, dur: 2.6,
    text: "your selection\nis the prompt", fontSize: 84, font: "DM Sans",
    color: "#ffffff", color2: "", letterSpacing: 1, uppercase: false,
    textShadow: 16, y: 300, transitionIn: { type: "fade", duration: 0.5 },
  },
  {
    id: "c_title_end", name: "sign off", start: 10.6, dur: 2.8,
    text: "FableCut", fontSize: 120, font: "Bebas Neue",
    color: "#ffffff", color2: "#4f8cff", letterSpacing: 8, uppercase: true,
    textShadow: 18, y: 0, transitionIn: { type: "fade", duration: 0.6 },
  },
];

const media = SHOTS.map((s, i) => ({
  id: "m_shot" + (i + 1),
  name: s.file,
  kind: "svg",
  src: "/library/svg/" + s.file,
  width: 1920,
  height: 1080,
  folderId: null,
}));

const clips = [];

SHOTS.forEach((s, i) => {
  clips.push({
    id: "c_shot" + (i + 1), mediaId: "m_shot" + (i + 1), kind: "svg", track: "V1",
    start: s.start, in: 0, duration: s.dur, name: s.name,
    props: props({ fit: "cover", scale: 1.04 }),
  });
});

TITLES.forEach((t) => {
  const c = {
    id: t.id, mediaId: null, kind: "text", track: "V2",
    start: t.start, in: 0, duration: t.dur, name: t.name,
    props: props({
      text: t.text, fontSize: t.fontSize, font: t.font, color: t.color,
      color2: t.color2, letterSpacing: t.letterSpacing, uppercase: t.uppercase,
      textShadow: t.textShadow, y: t.y, align: "center",
    }),
  };
  if (t.transitionIn) c.transitionIn = t.transitionIn;
  clips.push(c);
});

/* One grade across the whole piece, on the track above. Gives an agent
   something non-trivial to reason about in get_frame_context. */
clips.push({
  id: "c_grade", mediaId: null, kind: "adjust", track: "V3",
  start: 0, in: 0, duration: 13.6, name: "grade",
  props: props({ filterPreset: "cinematic", vignette: 18, grain: 6, saturation: 108 }),
});

const project = {
  name: "WebMCP demo reel",
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#07070b",
  revision: 1,
  folders: [],
  markers: [{ t: 3.4 }, { t: 6.6 }, { t: 10.0, label: "sign off" }],
  inPoint: null,
  outPoint: null,
  disabledTracks: [],
  media,
  clips,
};

const out = path.join(__dirname, "demo-project.json");
fs.writeFileSync(out, JSON.stringify(project, null, 2));
console.log("wrote " + out);
console.log("  " + clips.length + " clips, " + media.length + " media, " +
  clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0).toFixed(1) + "s");
