#!/usr/bin/env python3
"""Load SHARKX office colors from assets/office-theme.json.

Usage (from skill root Sharkx/):
  python scripts/office_colors.py
  python scripts/office_colors.py --format docx
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
OFFICE_THEME = SKILL_ROOT / "assets" / "office-theme.json"


def load_theme() -> dict:
    with OFFICE_THEME.open(encoding="utf-8") as f:
        return json.load(f)


def rgb(name: str, theme: dict | None = None) -> tuple[int, int, int]:
    theme = theme or load_theme()
    return tuple(theme["rgb"][name])


def hex_no_hash(name: str, theme: dict | None = None) -> str:
    theme = theme or load_theme()
    return theme["hex"][name]


def docx_rgb(name: str):
    from docx.shared import RGBColor

    r, g, b = rgb(name)
    return RGBColor(r, g, b)


def pptx_rgb(name: str):
    from pptx.dml.color import RGBColor

    r, g, b = rgb(name)
    return RGBColor(r, g, b)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--format", choices=("docx", "pptx", "xlsx", "json"), default="json")
    args = parser.parse_args()
    theme = load_theme()
    if args.format == "json":
        print(json.dumps(theme["rgb"], indent=2))
        return
    for name, triple in theme["rgb"].items():
        print(f"{name}: {triple}")


if __name__ == "__main__":
    main()
