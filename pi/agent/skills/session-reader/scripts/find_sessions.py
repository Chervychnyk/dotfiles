#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Find likely Pi session files by project path, filename, text, and date."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

SESSIONS_DIR = Path.home() / ".pi" / "agent" / "sessions"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Find Pi session files")
    parser.add_argument("--project", help="Filter by cwd/project path substring")
    parser.add_argument("--text", help="Search user/assistant text content")
    parser.add_argument("--name", help="Filter by filename substring")
    parser.add_argument("--since", help="Only include sessions since duration/date (e.g. 7d, 36h, 2026-04-01)")
    parser.add_argument("--until", help="Only include sessions before duration/date")
    parser.add_argument("--limit", type=int, default=10, help="Max results to print")
    return parser.parse_args()


def parse_time_filter(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    rel = re.fullmatch(r"(\d+)([dhw])", value)
    if rel:
        amount = int(rel.group(1))
        unit = rel.group(2)
        delta = {
            "h": timedelta(hours=amount),
            "d": timedelta(days=amount),
            "w": timedelta(weeks=amount),
        }[unit]
        return datetime.now(timezone.utc) - delta

    try:
        if len(value) == 10:
            return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise SystemExit(f"Invalid time filter: {value}")


def iter_session_files() -> Iterable[Path]:
    if not SESSIONS_DIR.exists():
        return []
    return sorted(SESSIONS_DIR.glob("**/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)


def load_header_and_text(path: Path) -> tuple[dict, str]:
    header = {}
    snippets: list[str] = []
    try:
        with path.open() as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if i == 0 and obj.get("type") == "session":
                    header = obj
                    continue
                if obj.get("type") != "message":
                    continue
                msg = obj.get("message", {})
                role = msg.get("role")
                if role not in {"user", "assistant"}:
                    continue
                content = msg.get("content", [])
                if isinstance(content, str):
                    snippets.append(content)
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            snippets.append(block.get("text", ""))
                if len("\n".join(snippets)) > 8000:
                    break
    except Exception:
        pass
    return header, "\n".join(snippets)


def session_started_at(header: dict) -> datetime | None:
    value = header.get("timestamp")
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def matches(path: Path, header: dict, text: str, args: argparse.Namespace, since: datetime | None, until: datetime | None) -> bool:
    if args.name and args.name.lower() not in path.name.lower():
        return False
    cwd = str(header.get("cwd", ""))
    if args.project and args.project.lower() not in cwd.lower() and args.project.lower() not in str(path).lower():
        return False
    if args.text and args.text.lower() not in text.lower():
        return False
    started = session_started_at(header)
    if since and started and started < since:
        return False
    if until and started and started > until:
        return False
    return True


def main() -> None:
    args = parse_args()
    since = parse_time_filter(args.since)
    until = parse_time_filter(args.until)
    count = 0
    for path in iter_session_files():
        header, text = load_header_and_text(path)
        if not matches(path, header, text, args, since, until):
            continue
        count += 1
        preview = " ".join(text.split())[:120]
        print(path)
        print(f"  cwd: {header.get('cwd', '?')}")
        print(f"  started: {header.get('timestamp', '?')}")
        if preview:
            print(f"  preview: {preview}")
        print()
        if count >= args.limit:
            break

    if count == 0:
        print("No matching sessions found.")


if __name__ == "__main__":
    main()
