# Excel mode — xlsx

KPI workbooks, media plans, SEO crawls, exports, and models. **Light sheets** — white data areas; red **header row** only (not full dark sheets).

## Workbook structure

| Sheet | Purpose |
|-------|---------|
| **Summary** | Title, trust line (period, sources), 3–6 KPIs, takeaway sentence, optional logo |
| **Data** | Cleaned tables — filters on header row |
| **Charts** | Linked charts — `chart-theme.json` |
| **Notes** | Definitions, methodology, caveats (10pt muted) |

Rename tabs for the job (`Google Ads`, `Meta`, `GSC`) but keep **Summary** first unless user forbids.

## Visual rules

- **Gridlines:** hide on Summary; optional on Data.
- **Header row:** red `#e70101` fill, white bold 11pt Sharp Sans; wrap text; center vertical.
- **Alt header:** black `#1c0f0f` for secondary tables on same sheet.
- **Zebra:** `#FFFFFF` / `#fafafa` or 4% black tint.
- **Borders:** bottom only `#e8e7e7` on data rows.
- **Numbers:** right-aligned; formats from `office-theme.json` → `excel.numberFormats` (AED, USD, %, dates).
- **Freeze:** below header on Data (`A2` or `A3` if trust row above table).
- **Hyperlinks:** black or red underline for URLs.

## KPI block (Summary)

```text
Row 1: Report title (14pt bold black)     [logo optional top-right]
Row 2: Period · Sources · Currency (10pt muted)
Row 4+: KPI label (muted) | Value (22pt bold) | Δ (positive style or red for negative)
Row 8: One-sentence insight (11pt black)
```

Positive Δ: black on `#fde6e6`. Negative Δ: `#b91c1c` text, no red fill paragraphs.

## Charts in Excel

- Series: `#e70101`, `#1c0f0f`, `#a49f9f`, `#f59999`, `#776f6f`.
- White plot; grid `rgba(28,15,15,0.12)`; no 3D.
- Title 12pt bold black; legend bottom.

## openpyxl (styled deliverables)

```python
from pathlib import Path
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

ROOT = Path("path/to/Sharkx")
theme = json.loads((ROOT / "assets/office-theme.json").read_text())
RGB = theme["rgb"]

def hex_rgb(name):
    r, g, b = RGB[name]
    return f"{r:02X}{g:02X}{b:02X}"

header_fill = PatternFill("solid", fgColor=hex_rgb("red"))
header_font = Font(name="Sharp Sans", bold=True, color=hex_rgb("white"), size=11)
body_font = Font(name="Sharp Sans", size=11, color=hex_rgb("black"))
thin = Side(style="thin", color=hex_rgb("border"))

wb = Workbook()
ws = wb.active
ws.title = "Summary"
ws.append(["Metric", "Current", "Prior", "Δ"])
for cell in ws[1]:
    cell.fill = header_fill
    cell.font = header_font
ws.column_dimensions["A"].width = 28
ws.column_dimensions["B"].width = 14
wb.save("Client-SharkX-Performance-2026-10-01.xlsx")
```

Use `scripts/office_colors.py` for RGB tuples in larger scripts.

## xlsxwriter (large datasets)

Same hex without `#`: header `bg_color: "E70101"`, `font_color: "FFFFFF"`, `font_name: "Sharp Sans"`.

## Tables & formulas

- Prefer Excel Tables for Data sheets charts reference.
- Document assumptions on **Notes**; show audit formulas there unless client wants inline.
- Conditional formatting sparingly: top 10 red left border only — avoid rainbow scales.

## Deliverable

Run `qa-checklist.md`. Set print area on Summary (+ key Data). Filename: `Client-SharkX-Topic-YYYY-MM-DD.xlsx`.
