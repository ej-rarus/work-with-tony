"""Group Whisper's timed Korean words into readable, sentence-first captions."""

import re
from pathlib import Path
from typing import NamedTuple


class TimedWord(NamedTuple):
    text: str
    start: int
    end: int


TIMECODE = r"\d{2,}:\d{2}:\d{2},\d{3}"
CUE_TIMING = re.compile(rf"({TIMECODE}) --> ({TIMECODE})")
SENTENCE_END = re.compile(r"[.!?…。！？]+[\"'”’」』)\]】]*$")
PUNCTUATION_ONLY = re.compile(r"[.!?…。！？,，、:：;；]+[\"'”’」』)\]】]*$")
MAX_CAPTION_LENGTH = 17
PAUSE_MS = 700


def _parse_timestamp(value: str) -> int:
    hours, minutes, seconds, millis = map(int, re.split("[:,]", value))
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis


def _timestamp(milliseconds: int) -> str:
    seconds, millis = divmod(milliseconds, 1000)
    minutes, second = divmod(seconds, 60)
    hours, minute = divmod(minutes, 60)
    return f"{hours:02}:{minute:02}:{second:02},{millis:03}"


def _timed_words(transcript: Path) -> list[TimedWord]:
    words = []
    for block in re.split(r"\n\s*\n", transcript.read_text(encoding="utf-8-sig").strip()):
        lines = block.splitlines()
        if not lines:
            continue
        match = CUE_TIMING.fullmatch(lines[1].strip()) if len(lines) >= 2 else None
        if not match or not lines[0].strip().isdigit():
            raise ValueError("Whisper produced a malformed SRT cue.")
        start, end = map(_parse_timestamp, match.groups())
        if end < start:
            raise ValueError("Whisper produced an SRT cue with an invalid time range.")
        cue_words = " ".join(lines[2:]).split()
        characters = sum(map(len, cue_words))
        consumed = 0
        for word in cue_words:
            # The normal cue is one word. If Whisper groups words, apportion
            # only this cue's duration so sentence boundaries can still split it.
            word_start = start + (end - start) * consumed // characters
            consumed += len(word)
            word_end = start + (end - start) * consumed // characters
            if words and PUNCTUATION_ONLY.fullmatch(word) and word_start - words[-1].end < PAUSE_MS:
                previous = words[-1]
                words[-1] = TimedWord(previous.text + word, previous.start, max(previous.end, word_end))
            else:
                words.append(TimedWord(word, word_start, word_end))
    return words


def _caption_groups(words: list[TimedWord]):
    group = []
    length = 0
    for word in words:
        if group and (length + 1 + len(word.text) > MAX_CAPTION_LENGTH or word.start - group[-1].end >= PAUSE_MS):
            yield group
            group = []
            length = 0
        length += len(word.text) + bool(group)
        group.append(word)
        if SENTENCE_END.search(word.text):
            yield group
            group = []
            length = 0
    if group:
        yield group


def write_captions(transcript: Path, output: Path, *, speech_offset: int, first_speech: int, speech_end: int) -> None:
    """Offset and clamp the grouped cues to the narration's rendered timeline."""
    captions = []
    last_end = first_speech
    for group in _caption_groups(_timed_words(transcript)):
        start = max(last_end, speech_offset + group[0].start)
        end = min(speech_end, speech_offset + group[-1].end)
        if end <= start:
            continue
        text = " ".join(word.text for word in group)
        captions.append(f"{len(captions) + 1}\n{_timestamp(start)} --> {_timestamp(end)}\n{text}\n\n")
        last_end = end
    if not captions:
        raise ValueError("No captionable speech was detected. Check the narration file or the selected talk audio.")
    output.write_text("".join(captions), encoding="utf-8")
