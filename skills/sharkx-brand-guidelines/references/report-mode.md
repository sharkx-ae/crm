# Report mode — docx / PDF

Performance reports, audits, strategic briefs, client memos. **White background**, left-aligned, data-forward.

## Page & spacing

- Margins ~1" (`office-theme.json` → `docx.marginsInches`).
- Line spacing 1.15 body; space after headings 12–16pt.
- Section rule: 0.5pt `#e8e7e7` or black at 15% opacity.

## Type hierarchy

| Element | Font | Weight | Size | Color |
|---------|------|--------|------|-------|
| Title | Sharp Sans | Bold | 28pt | Black `#1c0f0f` |
| H2 | Sharp Sans | Medium | 20pt | Black |
| H3 | Sharp Sans | Medium | 14pt | Black |
| Body | Sharp Sans | Light/Regular | 11pt | Black |
| Captions | Sharp Sans | Regular | 9pt | Muted `#5c5656` |
| Footer | Sharp Sans | Regular | 8pt | Muted |

Optional: one title word in **red** — no gradient text in Word.

**Metrics in prose:** bold value + `#fde6e6` highlight for key numbers.

## Trust block (required for data reports)

Under title: period, sources, currency, generated date (9–10pt muted).

## Tables

- Header: white on red `#e70101` (or black header for appendix).
- Zebra: white / 4% black tint.
- Numbers right-aligned; tabular figures.

## Charts

Embed flat charts — palette `chart-theme.json`. Caption: source + date below (9pt muted).

## Cover & logo

- Cover: `logo-red-on-white.png` or red band + white logo asset when available.
- Footer every page: small red/black logo, page number, `SharkX · Confidential`.

## python-docx

```python
from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor
import json

ROOT = Path("Sharkx")
theme = json.loads((ROOT / "assets/office-theme.json").read_text())
BLACK = RGBColor(*theme["rgb"]["black"])
RED = RGBColor(*theme["rgb"]["red"])
WHITE = RGBColor(255, 255, 255)

doc = Document()
normal = doc.styles["Normal"]
normal.font.name = "Sharp Sans"
normal.font.size = Pt(theme["docx"]["sizesPt"]["body"])
normal.font.color.rgb = BLACK

p = doc.add_paragraph()
run = p.add_run("Client — Performance Report")
run.bold = True
run.font.size = Pt(theme["docx"]["sizesPt"]["title"])

doc.add_paragraph("Period: YYYY-MM-DD – YYYY-MM-DD · Source: Google Ads, GA4", style="Normal")

logo = ROOT / theme["docx"]["logoPath"]
if logo.exists():
    doc.add_picture(str(logo), width=Inches(theme["docx"]["logoWidthInches"]))

doc.save("Client-SharkX-Report-2026-10-01.docx")
```

Map sections from `SKILL.md` archetypes to Heading 1/2.

## Flow

Artifact approval → promote sections 1:1 (`office-workflow.md`). QA: `qa-checklist.md`.
