<div align="center">

# FableCut × WebMCP

**A browser video editor that you and your agent edit at the same time.**

Entry to [The WebMCP Challenge](https://webmcp.devpost.com/)

</div>

---

FableCut is a Premiere-style non-linear video editor that runs entirely in the
browser. This repository adds a **WebMCP layer** on top of it, so an AI agent
running in the browser tab can drive the editor directly: read your selection,
move your playhead, cut your timeline, and land every change on the same undo
stack you use.

There is one timeline, one history, and two people editing it.

## What is new here

FableCut already existed before this hackathon, and it already had an MCP
server. That server edits `project.json`, a file on disk. An agent using it is
editing a document, and has to be told what everything is called.

The WebMCP layer edits the **running session**. Three of its tools read state
that has no on-disk representation at all:

| Tool | Why it needs to be in the page |
| --- | --- |
| `get_selection` | What you have selected *right now*, and where your playhead is. Selection is session state. You point at a clip with the mouse and say "tighten this". No ids, no filenames, no describing. |
| `get_frame_context` | Which clips are actually stacked and visible at a given instant, topmost first, with their transforms. The flat clip list cannot answer "what does the viewer see here". |
| `set_playhead` / `select_clips` | The agent moving *your* cursor and *your* selection, so it can show you what it means before changing anything. |

And the property that makes two-way editing usable rather than alarming:

> **Every mutating tool calls `pushUndo()` first.** The agent's edits go onto the
> same undo stack as yours. Ctrl+Z reverses the agent exactly the way it reverses
> you. There is no separate "review the AI's changes" panel, because there is
> nothing separate to review.

Full tool list and the prior-work / new-work split: **[WEBMCP.md](WEBMCP.md)**.

## Try it

**Live demo: <https://ronak-create.github.io/fablecut-webmcp/>**

Open it in **Chrome 149+** with `chrome://flags/#enable-webmcp-testing`
set to Enabled, or in **ChatGPT's in-app browser**, which supports WebMCP out of
the box. Then ask your agent things like:

- "What is on this timeline?"
- "Move to 4.5 seconds and split whatever is under the playhead."
- "What is visible at the 8 second mark?"
- *(select a clip yourself)* "Make this one a second shorter."
- "Actually, undo that."

Without WebMCP the editor still works normally, and the layer logs a warning
instead of registering.

## Run it locally

Two ways, both with zero dependencies and no build step.

**Full editor** (import your own media, ffmpeg export, the stdio MCP server):

```sh
node server.js          # http://localhost:7777
```

**Static demo** (what gets deployed, no server at all):

```sh
node build-demo.js      # produces dist/
npx serve dist
```

The static build is not a cut-down copy of the app. It is the same `app.js`,
with `static-mode.js` serving the API surface from static files and
localStorage. A hosted demo cannot share one `project.json` across visitors,
because two judges opening the URL would be dragging each other's clips around.
Removing the server entirely means every visitor gets a private copy of the
demo timeline, with no shared state, no cold start, and nothing to run.

Add `?reset` to the URL to throw away your edits and reload the pristine demo.

## Layout

| Path | |
| --- | --- |
| `webmcp.js` | **New.** The WebMCP layer. 11 tools over the live editor session. |
| `static-mode.js` | **New.** Serves the API from static files + localStorage. |
| `build-demo.js` | **New.** Builds `dist/`. |
| `demo/make-demo-project.js` | **New.** Generates the demo timeline. |
| `WEBMCP.md` | **New.** Prior-work / new-work documentation. |
| `app.js`, `server.js`, `mcp-server.js`, … | Prior work. See below. |

## Provenance

The first commit in this repository is an unmodified export of
[ronak-create/FableCut](https://github.com/ronak-create/FableCut) at commit
`4f555d1`, containing no WebMCP code. Every commit after it is work done for
this challenge, so:

```sh
git log --reverse --oneline    # the first entry is the baseline
git diff <baseline> --stat     # everything built for the challenge
```

The demo timeline is built only from assets that ship with FableCut under MIT
(the vector animations in `library/svg/`) plus text and adjustment layers, which
need no media at all. No client work and no third-party audio are redistributed
here.

## Licence

MIT. See [LICENSE](LICENSE).
