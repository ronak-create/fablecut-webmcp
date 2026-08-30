# Auto-captions example

This example converts word-timestamped speech-to-text output into FableCut `kind:"text"` clips with the built-in `karaoke` animation. It does not change the editor or require a specific speech-to-text engine.

## 1. Produce word timestamps

Provide a JSON file containing either a top-level `words` array or a bare array:

```json
{
  "words": [
    {"word": "Welcome", "start": 0.00, "end": 0.42},
    {"word": "to", "start": 0.43, "end": 0.58},
    {"word": "FableCut", "start": 0.60, "end": 1.20}
  ]
}
```

The format can be produced by faster-whisper, whisper.cpp adapters, or another STT engine. The script accepts `start` and `end` in seconds.

## 2. Generate caption clips

```bash
python examples/auto-captions/auto_captions.py \
  --transcript transcript.json \
  --output captions.json
```

The output contains a `clips` array. Add those clips to an existing `project.json` with the MCP `fablecut_patch_project` tool, or merge them into the project document before using `PUT /api/project`.

```json
{"ops":[{"op":"addClip","clip":{"kind":"text","track":"V3","start":0,"duration":1.2,"props":{"text":"Welcome to FableCut","textAnim":"karaoke","wordRate":0.2}}}]}
```

The generated clips default to `V3`, use four words per line, cap a line at about 1.8 seconds, and derive `wordRate` from the observed word durations. Tune the grouping with `--max-words` and `--max-seconds`.

## Optional local transcription

Install faster-whisper separately, then let the script transcribe an audio or video file:

```bash
pip install faster-whisper
python examples/auto-captions/auto_captions.py \
  --audio media/talk.mp4 \
  --model base \
  --output captions.json
```

The generated JSON is deliberately separate from `project.json`, so a user can review or transform the captions before applying them to a live editor.
