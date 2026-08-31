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
Enabled. WebMCP is also supported by the built-in browser in the **ChatGPT
desktop app** (added late August 2026). ChatGPT Atlas, which earlier versions of
this document pointed at, was discontinued by OpenAI on 9 August 2026 and its
browser-agent work folded back into the ChatGPT desktop app.

Without WebMCP available, the editor works normally and the layer logs a warning
instead of registering. The tool set is still inspectable for debugging:

```js
window.FableCutWebMCP            // { available, via, names, tools, unregister }
await window.FableCutWebMCP.tools
  .find(t => t.name === "get_selection").execute({})
```

## Tested with

Verified **2026-08-31**, Chrome **151.0.7922.174** on Windows 11, with
`chrome://flags/#enable-webmcp-testing` set to Enabled — against both the hosted
demo and a local `node server.js` instance.

Chrome 151 exposes `document.modelContext` as a `ModelContext` with
`registerTool` / `getTools` / `executeTool` / `ontoolchange`, and aliases
`navigator.modelContext` to the same object, so the dual-shape feature detection
above resolves to the spec form.

**Registration.** `document.modelContext.getTools()` returns all **11** tools,
each attributed to the page origin, with its `inputSchema` intact.

**Execution.** All 11 tools were invoked through
`document.modelContext.executeTool()` — the host API itself, not the page's own
`window.FableCutWebMCP.tools` array. Read tools returned correct state;
`set_playhead` and `select_clips` visibly moved the human's playhead and
selection (the timeline highlighted the clip and the inspector loaded it);
`split_at_playhead`, `move_clip`, `trim_clip` and `delete_clips` all edited the
timeline as specified. The same pass was repeated against `node server.js`, so
the layer behaves identically whether `scheduleSave` writes `project.json` over
HTTP or the static-mode localStorage shim.

**The shared undo stack.** Four edits were made through WebMCP (trim, move,
delete, split), then four ordinary <kbd>Ctrl</kbd>+<kbd>Z</kbd> keystrokes were
sent to the page — *not* the `undo_edit` tool. Each keystroke reversed one
agent edit, in order, restoring the timeline to its exact starting state. The
claim above is tested, not assumed.

### Driven by an agent, not just by the host API

Everything above exercises the transport with hand-picked calls. The tools were
then handed to an independent agent — the **in-app browser of OpenAI's Codex
desktop app on Windows** (the ChatGPT desktop app family, which gained WebMCP
support in late August 2026), running its `5.6 Terra Medium` model. No ids, no
tool names and no schema hints were supplied by the human; the whole instruction
was *"move to 4.5 seconds and split what's under the playhead."*

The agent asked for permission before using the page's tools, then:

1. called `set_playhead`, reporting back `00:00:04:15`,
2. called `get_frame_context` and described what it found in plain language —
   the grade adjustment layer, the title clip reading "your selection is the
   prompt", and `shot 2 - pulse`,
3. hit the fact that `split_at_playhead` is selection-scoped, called
   `select_clips` on those three clips itself to satisfy it, and
4. called `split_at_playhead`, taking the timeline from 8 clips to 11.

The editor UI followed along the whole way: the playhead sat at `00:04:15`, the
inspector read *"3 clips selected"*, and the three split boundaries were visible
on V1, V2 and V3. The tool selection, and the recovery in step 3, were the
agent's own — it was given a sentence, not a plan.

### Notes for anyone implementing against Chrome 151

Two details that are easy to get wrong and are not obvious from the spec text:

- `RegisteredTool.inputSchema` comes back from `getTools()` as a **JSON string**,
  not an object. `tool.inputSchema.properties` is `undefined`; you must
  `JSON.parse` it first.
- `executeTool(tool, args)` takes the `RegisteredTool` object (not its name) and
  wants `args` as a **JSON string**. Passing a plain object fails with
  `UnknownError: Failed to parse input arguments`.

### Reproducing it

```sh
node server.js
```

Then open <http://127.0.0.1:7777/> — use the IPv4 literal, not `localhost`:
`server.js` binds IPv4 only, and Chrome resolves `localhost` to `::1` first,
which fails to connect. Or just use the hosted demo, which needs nothing running.

```js
const mc = document.modelContext;
const tools = await mc.getTools();                       // 11
const run = async (n, a = {}) =>
  String(await mc.executeTool(tools.find(t => t.name === n), JSON.stringify(a)));

await run("get_timeline");
await run("select_clips", { ids: ["c_shot1"] });
await run("trim_clip", { id: "c_shot1", duration: 2 });
// now press Ctrl+Z in the page — the trim reverses.
```

Note that `split_at_playhead` is selection-scoped, exactly like pressing `S` in
the UI: with a selection whose range does not contain the playhead it correctly
reports that there is nothing to split.

## Licence

MIT, inherited from FableCut. See `LICENSE`.

## The hosted demo

Live at <https://ronak-create.github.io/fablecut-webmcp/>, built and deployed
from `main` by `.github/workflows/pages.yml`.

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
