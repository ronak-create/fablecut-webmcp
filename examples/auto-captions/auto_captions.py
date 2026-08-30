#!/usr/bin/env python3
"""Create FableCut karaoke text clips from word-timestamped transcription JSON.

The input format is intentionally engine-agnostic: either a JSON file containing
{"words": [{"word": "hello", "start": 0.0, "end": 0.4}, ...]} or a list of
those word objects. Use --transcript to provide an existing transcript, or
--audio with faster-whisper installed to transcribe locally.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any


def load_words(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    words = data.get("words", data) if isinstance(data, dict) else data
    if not isinstance(words, list):
        raise ValueError("transcript must be a list or an object containing a 'words' list")
    clean = []
    for item in words:
        if not isinstance(item, dict) or not item.get("word"):
            continue
        start, end = float(item["start"]), float(item["end"])
        if end <= start:
            raise ValueError(f"word has invalid interval: {item!r}")
        clean.append({"word": str(item["word"]).strip(), "start": start, "end": end})
    return sorted(clean, key=lambda item: item["start"])


def transcribe(audio: Path, model_name: str) -> list[dict[str, Any]]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit("--audio requires faster-whisper; install it with: pip install faster-whisper") from exc
    model = WhisperModel(model_name)
    segments, _ = model.transcribe(str(audio), word_timestamps=True)
    return [
        {"word": word.word.strip(), "start": word.start, "end": word.end}
        for segment in segments
        for word in (segment.words or [])
        if word.word.strip()
    ]


def group_words(words: list[dict[str, Any]], max_words: int, max_seconds: float) -> list[dict[str, Any]]:
    lines = []
    current: list[dict[str, Any]] = []
    for word in words:
        too_many = len(current) >= max_words
        too_long = current and word["end"] - current[0]["start"] > max_seconds
        if current and (too_many or too_long):
            lines.append(current)
            current = []
        current.append(word)
    if current:
        lines.append(current)
    return [
        {
            "text": " ".join(word["word"] for word in line),
            "start": line[0]["start"],
            "duration": max(line[-1]["end"] - line[0]["start"], 0.01),
            "wordRate": max((word["end"] - word["start"] for word in line), default=0.15),
        }
        for line in lines
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--transcript", type=Path, help="word-timestamp JSON file")
    source.add_argument("--audio", type=Path, help="audio/video file; requires faster-whisper")
    parser.add_argument("--model", default="base", help="faster-whisper model for --audio")
    parser.add_argument("--output", type=Path, default=Path("project.captions.json"))
    parser.add_argument("--max-words", type=int, default=4)
    parser.add_argument("--max-seconds", type=float, default=1.8)
    args = parser.parse_args()
    words = load_words(args.transcript) if args.transcript else transcribe(args.audio, args.model)
    clips = []
    for index, line in enumerate(group_words(words, args.max_words, args.max_seconds), 1):
        clips.append({
            "id": f"caption_{index:04d}",
            "kind": "text",
            "track": "V3",
            "start": line["start"],
            "duration": line["duration"],
            "props": {
                "text": line["text"],
                "textAnim": "karaoke",
                "wordRate": line["wordRate"],
                "fontSize": 72,
                "bold": True,
                "color": "#ffffff",
                "textShadow": 12,
            },
        })
    args.output.write_text(json.dumps({"clips": clips}, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(clips)} caption clips to {args.output}")


if __name__ == "__main__":
    main()
