/* ═══════════════════════════════════════════════════════════════════════════
   FableCut · WebMCP layer                          [new work — WebMCP Challenge]

   Exposes the LIVE editor session as WebMCP tools, so an agent running in the
   browser tab edits the same timeline the human is looking at.

   This is deliberately not a re-skin of the existing MCP server. That server
   speaks to project.json on disk — a file. These tools speak to the running
   editor: the playhead, the current selection, what is actually on screen at
   this instant. An agent and a human share one cursor, one selection, one
   undo stack.

   Every mutating tool calls pushUndo() first, so Ctrl+Z reverses the agent's
   edit exactly like it reverses a human one. That is the whole point.

   Spec: https://webmachinelearning.github.io/webmcp/
   Chrome 149+ · chrome://flags/#enable-webmcp-testing
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
(function () {
  const LOG = "[FableCut/WebMCP]";

  /* ── Binding resolution ───────────────────────────────────────────────────
     app.js is a classic script, so its top-level `const`s live in the global
     lexical scope — reachable from here, but NOT as window properties. A bare
     identifier lookup is the only way to reach them, hence the eval. Wrapped
     so a rename in app.js surfaces as a clear diagnostic instead of a blank
     page. */
  function bind(name) {
    try { return (0, eval)(name); } catch { return undefined; }
  }
  const need = ["project", "state", "runtime", "scheduleSave", "pushUndo", "undo",
    "redo", "setTime", "selectClip", "drawFrame", "splitAtPlayhead",
    "renderInspector", "renderBin", "clipEnd"];
  const missing = need.filter((n) => bind(n) === undefined);
  if (missing.length) {
    console.error(LOG, "app.js bindings not found:", missing.join(", "),
      "— WebMCP tools not registered.");
    return;
  }

  const P = () => bind("project");
  const S = () => bind("state");
  const call = (fn, ...a) => bind(fn)(...a);
  const clipEndOf = (c) => bind("clipEnd")(c);

  /* ── Small helpers ──────────────────────────────────────────────────────── */
  const fps = () => P().fps || 30;
  const tc = (t) => {
    const F = fps();
    const f = Math.round(t * F);
    const s = Math.floor(f / F), m = Math.floor(s / 60);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" +
      String(m % 60).padStart(2, "0") + ":" +
      String(s % 60).padStart(2, "0") + ":" +
      String(f % F).padStart(2, "0");
  };
  const duration = () => P().clips.reduce((m, c) => Math.max(m, clipEndOf(c)), 0);
  /* Tracks are string ids ("V1".."V4", "A1".."A4"), not indices. For video,
     the higher number sits on top of the stack. */
  const isVideoTrack = (id) => /^V\d+$/.test(String(id || ""));
  const layer = (id) => parseInt(String(id).slice(1), 10) || 0;
  const knownTracks = () => {
    const ids = new Set(["V1", "V2", "V3", "A1", "A2", "A3", "A4"]);
    P().clips.forEach((c) => ids.add(c.track));
    return [...ids].sort();
  };
  const findClip = (id) => P().clips.find((c) => c.id === id);
  const clipView = (c) => ({
    id: c.id, name: c.name || c.mediaId || c.kind || "clip", kind: c.kind || "video",
    track: c.track, start: +c.start.toFixed(3), duration: +c.duration.toFixed(3),
    end: +clipEndOf(c).toFixed(3), selected: S().selIds.has(c.id),
  });

  /* Repaint everything the human can see. Mutating project.* alone updates no
     pixels — the timeline redraws off state.dirtyTimeline, which scheduleSave
     sets, but the monitor and inspector need an explicit nudge. */
  const refresh = () => {
    call("scheduleSave");
    try { call("drawFrame", S().time); } catch (e) { }
    try { call("renderInspector"); } catch (e) { }
  };
  const ok = (msg, extra) => extra ? msg + "\n" + JSON.stringify(extra, null, 2) : msg;

  /* ── Tools ────────────────────────────────────────────────────────────────
     Read tools describe the live session. Write tools go through the same
     undo stack and save path the UI uses. */
  const TOOLS = [
    {
      name: "get_timeline",
      description:
        "Read the current state of the open FableCut timeline: playhead position, " +
        "duration, frame rate, canvas size, and every clip with its track, start " +
        "and duration. Call this before editing so you know what is actually there.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => ok("Timeline state:", {
        name: P().name, fps: fps(),
        canvas: { width: P().width, height: P().height },
        playhead: { seconds: +S().time.toFixed(3), timecode: tc(S().time) },
        duration: { seconds: +duration().toFixed(3), timecode: tc(duration()) },
        clipCount: P().clips.length,
        clips: P().clips.slice().sort((a, b) => a.start - b.start).map(clipView),
      }),
    },
    {
      name: "get_selection",
      description:
        "Read what the human currently has selected in the editor and where their " +
        "playhead is. Use this to act on 'this clip' or 'here' without asking them " +
        "to name anything — they point with the mouse, you read the selection.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const sel = P().clips.filter((c) => S().selIds.has(c.id));
        return ok(sel.length ? sel.length + " clip(s) selected." : "Nothing is selected.", {
          playhead: { seconds: +S().time.toFixed(3), timecode: tc(S().time) },
          primary: S().selId, selected: sel.map(clipView),
        });
      },
    },
    {
      name: "get_frame_context",
      description:
        "Describe what is visible on the program monitor at a given time (default: " +
        "the current playhead) — which clips are stacked there and their opacity, " +
        "scale and position. Use it to reason about what the viewer actually sees.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: { at: { type: "number", description: "Time in seconds. Defaults to the playhead." } },
      },
      execute: async (args) => {
        const t = (args && args.at != null) ? +args.at : S().time;
        const live = P().clips.filter((c) => t >= c.start && t < clipEndOf(c));
        const vis = live.filter((c) => isVideoTrack(c.track))
          .sort((a, b) => layer(b.track) - layer(a.track))
          .map((c) => Object.assign(clipView(c), { props: c.props || {} }));
        const aud = live.filter((c) => !isVideoTrack(c.track)).map(clipView);
        return ok("At " + tc(t) + " — " + vis.length + " visible clip(s) (topmost first), " +
          aud.length + " audible.", { visible: vis, audio: aud });
      },
    },
    {
      name: "set_playhead",
      description:
        "Move the playhead to a time in seconds. The monitor and timeline follow, " +
        "so the human sees exactly the moment you are talking about.",
      inputSchema: {
        type: "object",
        properties: { seconds: { type: "number", description: "Target time in seconds." } },
        required: ["seconds"],
      },
      execute: async ({ seconds }) => {
        const t = Math.max(0, +seconds || 0);
        call("setTime", t);
        try { call("drawFrame", t); } catch (e) { }
        return "Playhead moved to " + tc(t) + " (" + t.toFixed(3) + "s).";
      },
    },
    {
      name: "select_clips",
      description:
        "Select one or more clips by id, highlighting them in the timeline and " +
        "inspector. Use this to show the human which clips you mean before you " +
        "change anything.",
      inputSchema: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" }, description: "Clip ids to select." } },
        required: ["ids"],
      },
      execute: async ({ ids }) => {
        const found = (ids || []).filter(findClip);
        if (!found.length) return "No clips matched those ids — call get_timeline for valid ids.";
        call("selectClip", found[0]);
        S().selIds.clear();
        found.forEach((id) => S().selIds.add(id));
        S().selId = found[0];
        refresh();
        return ok("Selected " + found.length + " clip(s).", found.map((id) => clipView(findClip(id))));
      },
    },
    {
      name: "split_at_playhead",
      description:
        "Cut the selected clips (or every clip, if nothing is selected) at the " +
        "current playhead — the same edit as pressing S. Undoable with Ctrl+Z.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const before = P().clips.length;
        call("splitAtPlayhead");
        const made = P().clips.length - before;
        refresh();
        return made
          ? "Split at " + tc(S().time) + " — " + made + " new clip(s). Ctrl+Z undoes this."
          : "Nothing to split at " + tc(S().time) + " (the playhead must fall inside a clip).";
      },
    },
    {
      name: "move_clip",
      description:
        "Move a clip along the timeline and/or to a different track. Times are in " +
        "seconds from the start of the timeline.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Clip id (see get_timeline)." },
          start: { type: "number", description: "New start time in seconds." },
          track: {
            type: "string",
            description: "New track id: V1-V3 for video (higher sits on top), A1-A4 for audio.",
          },
        },
        required: ["id"],
      },
      execute: async ({ id, start, track }) => {
        const c = findClip(id);
        if (!c) return "No clip with id " + id + " — call get_timeline for valid ids.";
        if (track != null && !knownTracks().includes(track))
          return "Unknown track '" + track + "'. Valid tracks: " + knownTracks().join(", ") + ".";
        if (track != null && isVideoTrack(track) !== isVideoTrack(c.track))
          return "Cannot move a " + (isVideoTrack(c.track) ? "video" : "audio") +
            " clip to track " + track + " — video clips belong on V tracks, audio on A tracks.";
        call("pushUndo");
        if (start != null) c.start = Math.max(0, +start);
        if (track != null) c.track = track;
        refresh();
        return ok("Moved. Ctrl+Z undoes this.", clipView(c));
      },
    },
    {
      name: "trim_clip",
      description:
        "Change how long a clip plays for by setting its duration in seconds. " +
        "Trims from the out point; the clip's start stays put.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Clip id (see get_timeline)." },
          duration: { type: "number", description: "New duration in seconds." },
        },
        required: ["id", "duration"],
      },
      execute: async ({ id, duration: d }) => {
        const c = findClip(id);
        if (!c) return "No clip with id " + id + " — call get_timeline for valid ids.";
        const nd = Math.max(0.04, +d);
        call("pushUndo");
        c.duration = nd;
        refresh();
        return ok("Trimmed to " + nd.toFixed(3) + "s. Ctrl+Z undoes this.", clipView(c));
      },
    },
    {
      name: "delete_clips",
      description: "Remove clips from the timeline by id. Undoable with Ctrl+Z.",
      inputSchema: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" }, description: "Clip ids to remove." } },
        required: ["ids"],
      },
      execute: async ({ ids }) => {
        const kill = new Set((ids || []).filter(findClip));
        if (!kill.size) return "No clips matched those ids.";
        call("pushUndo");
        P().clips = P().clips.filter((c) => !kill.has(c.id));
        kill.forEach((id) => S().selIds.delete(id));
        if (kill.has(S().selId)) S().selId = null;
        try { call("renderBin"); } catch (e) { }
        refresh();
        return "Removed " + kill.size + " clip(s). Ctrl+Z undoes this.";
      },
    },
    {
      name: "undo_edit",
      description:
        "Undo the last timeline change — yours or the human's. One shared undo " +
        "stack, so this is the same Ctrl+Z they would press.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        if (!bind("runtime").undo.length) return "Nothing to undo.";
        call("undo");
        try { call("drawFrame", S().time); } catch (e) { }
        return "Undone.";
      },
    },
    {
      name: "redo_edit",
      description: "Redo the last undone timeline change.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        if (!bind("runtime").redo.length) return "Nothing to redo.";
        call("redo");
        try { call("drawFrame", S().time); } catch (e) { }
        return "Redone.";
      },
    },
  ];

  /* ── Registration ─────────────────────────────────────────────────────────
     The spec and Chrome 149 both put this on document.modelContext. Earlier
     drafts (and most tutorials still in circulation) used navigator.model-
     Context with a provideContext({tools}) batch call. Support both, because
     which one a judge's browser ships is not something we control. */
  function host() {
    if (typeof document !== "undefined" && document.modelContext)
      return { mc: document.modelContext, where: "document.modelContext" };
    if (typeof navigator !== "undefined" && navigator.modelContext)
      return { mc: navigator.modelContext, where: "navigator.modelContext" };
    return null;
  }

  async function register() {
    const h = host();
    if (!h) {
      console.warn(LOG, "WebMCP unavailable in this browser. Needs Chrome 149+ with " +
        "chrome://flags/#enable-webmcp-testing, or ChatGPT's in-app browser.");
      window.FableCutWebMCP = { available: false, tools: TOOLS, names: TOOLS.map((t) => t.name) };
      return;
    }
    const mc = h.mc, where = h.where;
    const controller = new AbortController();
    let n = 0;
    try {
      if (typeof mc.registerTool === "function") {
        for (const t of TOOLS) { await mc.registerTool(t, { signal: controller.signal }); n++; }
      } else if (typeof mc.provideContext === "function") {
        await mc.provideContext({ tools: TOOLS });   // legacy batch shape
        n = TOOLS.length;
      } else {
        console.warn(LOG, where + " exists but exposes neither registerTool nor provideContext.");
        return;
      }
    } catch (e) {
      console.error(LOG, "registration failed:", e);
      return;
    }
    console.log(LOG, "registered " + n + " tools via " + where);
    window.FableCutWebMCP = {
      available: true, via: where, tools: TOOLS,
      names: TOOLS.map((t) => t.name),
      unregister: () => controller.abort(),
    };
    window.dispatchEvent(new CustomEvent("fablecut:webmcp-ready", { detail: { count: n, via: where } }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", register);
  else register();
})();
