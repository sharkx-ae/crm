# Office & artifacts workflow (Claude-first)

Use **every time** you generate docx, pptx, xlsx, or HTML/React artifacts.

## 0. Context

- **Brand / voice:** `SKILL.md`
- **Company copy:** `company-knowledge.md`, `assets/company.json`
- **Analytics structure:** `data-analysis-mode.md` when data is involved

## 1. Classify

| User asks for… | Mode | Stack |
|----------------|------|-------|
| Workbook, export, model | `excel-mode.md` | openpyxl / xlsxwriter |
| Report, memo, audit | `report-mode.md` | python-docx |
| Deck, QBR | `presentation-mode.md` | python-pptx |
| Dashboard preview | `artifacts-mode.md` | HTML/React + Chart.js |
| Any | `qa-checklist.md` | — |

**Default:** data-heavy → **xlsx** or **artifact** first; narrative send → **docx** or **pptx**.

## 2. Load tokens (never hardcode hex)

1. `assets/tokens.json`
2. `assets/office-theme.json`
3. `assets/chart-theme.json`
4. Logos: `assets/logos/` — embed in Office; base64 in artifacts

`python scripts/office_colors.py` from skill root (`Sharkx/`).

## 3. Build order

### A. Artifact first (recommended for client review)

1. Build from `artifact-starter.html` + `brand.css` patterns.
2. User approves KPIs, tables, copy.
3. **Promote** to docx/pptx/xlsx — same section order and numbers.

### B. Office-first

1. Branded Summary/cover + trust line.
2. Apply theme styles.
3. QA before handoff.

## 4. Python execution

```text
pip install python-docx python-pptx openpyxl
Absolute paths to Sharkx/assets/...
Font: Sharp Sans → fallback Segoe UI (note in footer if fallback)
Deliver + 3-line summary (files, period, limitations)
```

## 5. Cross-format consistency

| Element | docx | pptx | xlsx | Artifact |
|---------|------|------|------|----------|
| Title | 28pt bold black | 28–40pt | Summary row 1 | H1 hero |
| Trust line | subtitle | slide 2 | Summary row 2 | under hero |
| Table header | red + white | red bar | row 1 styles | `.sx-table thead` |
| KPI | highlight fill | tile slide | Summary block | `.kpi-grid` |
| Positive Δ | `#fde6e6` | chip | positive style | `.sx-delta-up` |
| Logo | footer / cover | title + close | Summary corner | hero img |

## 6. Content vs brand

Use this skill for **all styling and layout**. Separate prompts/skills may hold SEO or Ads **methodology** — output still passes through SHARKX tokens here.

## 7. Footer

`SharkX · {date} · Confidential` + optional `sharkx.ae`. Tagline **cover only**.
