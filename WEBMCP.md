# FableCut × WebMCP — what is new work

This repository is an entry to [The WebMCP Challenge](https://webmcp.devpost.com/).
The challenge rules require that a pre-existing project "must have been meaningfully
extended using WebMCP after the Submission Period start date," with "clear
documentation distinguishing prior work from new work." This file is that
documentation.

## Prior work

FableCut is a pre-existing open-source project (MIT), public since before this
hackathon: <https://github.com/ronak-create/FableCut>.

The entire pre-existing codebase enters this repository as **a single commit**:

> `Vendor FableCut @ 4f555d1 as pre-hackathon baseline`

That commit is an unmodified export of the tracked tree of `ronak-create/FableCut`
at commit `4f555d1` (2026-08-28). It contains **no WebMCP code**. Everything in it
— the editor (`app.js`), the server (`server.js`), the stdio MCP server
(`mcp-server.js`), the docs — is prior work and should not be credited to this
hackathon.

To see only the new work:

```sh
git log --reverse --oneline          # first commit is the baseline; all others are new
git diff c8b528d --stat              # every change made for the challenge
```

## New work

Everything after the baseline commit. In summary:

| File | Status | What it is |
| --- | --- | --- |
| `webmcp.js` | **new** | The WebMCP layer — registers the live editor session as agent tools |
| `index.html` | 1-line change | Loads `webmcp.js` after `app.js` |
| `WEBMCP.md` | **new** | This file |

## Why this is not a wrapper around the existing MCP server

FableCut already shipped an MCP server (`mcp-server.js`) before the hackathon. It
would have been easy — and hollow — to re-expose its seven tools through WebMCP
and call it an entry. That server talks to `project.json` **on disk**: it reads a
file, writes a file, and the browser reloads. The agent is editing a document.

The WebMCP layer talks to the **running editor**. Its tools read and write state
that only exists in the live tab and has no representation in the project file:

- `get_selection` — what the human has selected *right now*, and where their
  playhead is. There is no on-disk equivalent; selection is session state. This is
  what lets a person point at something with the mouse and say "tighten this,"
  with no ids, no filenames, no describing.
- `get_frame_context` — which clips are actually stacked and visible at a given
  instant, topmost first, with their transforms. Answers "what does the viewer
  see here," which is a composite question the flat clip list cannot answer.
- `set_playhead` / `select_clips` — the agent moving *the human's* cursor and
  selection, so it can show what it means before changing anything.

And the property that makes the two-way version work at all:

> **Every mutating tool calls `pushUndo()` first.** The agent's edits land on the
> same undo stack as the human's. Ctrl+Z reverses the agent exactly like it
> reverses you. There is no separate "AI changes" mode to accept or reject —
> there is one timeline, one history, two people editing it.

## Registered tools

| Tool | Read-only | What it does |
| --- | :---: | --- |
| `get_timeline` | ✓ | Playhead, duration, fps, canvas, every clip with track/start/duration |
| `get_selection` | ✓ | The human's current selection and playhead |
| `get_frame_context` | ✓ | What is visible/audible at a given time, topmost first |
| `set_playhead` | | Seek; monitor and timeline follow |
| `select_clips` | | Highlight clips in the timeline and inspector |
| `split_at_playhead` | | Cut at the playhead (same edit as pressing `S`) |
| `move_clip` | | Move along the timeline and/or between tracks |
| `trim_clip` | | Set a clip's duration |
| `delete_clips` | | Remove clips |
| `undo_edit` / `redo_edit` | | Walk the shared undo stack |

## API shape

The layer registers via **`document.modelContext.registerTool()`**, which is what
both the [specification](https://webmachinelearning.github.io/webmcp/) and
[Chrome's documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
define.

A large amount of material still in circulation shows `navigator.modelContext`
with a batch `provideContext({ tools })` call — an earlier draft shape.
`webmcp.js` feature-detects and supports both, preferring the spec form, because
which one a given browser build ships is not something an entrant controls.

## Running it

```sh
node server.js          # http://localhost:7777
```

Open in **Chrome 149+** with `chrome://flags/#enable-webmcp-testing` set to
Enabled, or in **ChatGPT's in-app browser**, which supports WebMCP out of the box.

Without WebMCP available, the editor works normally and the layer logs a warning
instead of registering. The tool set is still inspectable for debugging:

```js
window.FableCutWebMCP            // { available, via, names, tools, unregister }
await window.FableCutWebMCP.tools
  .find(t => t.name === "get_selection").execute({})
```

## Licence

MIT, inherited from FableCut. See `LICENSE`.

## The hosted demo

`build-demo.js` produces `dist/`, a static build with no server behind it.
`static-mode.js` serves the API surface app.js expects from static files and
localStorage, so every visitor gets a private copy of the demo timeline. There
is no shared `project.json` for two judges to collide over, no cold start, and
nothing to run.

The demo timeline (`demo/make-demo-project.js`) is built only from assets that
ship with FableCut under MIT, plus text and adjustment layers, which need no
media. Nothing here redistributes client work or third-party audio.

```sh
node build-demo.js && npx serve dist     # add ?reset to discard local edits
```
