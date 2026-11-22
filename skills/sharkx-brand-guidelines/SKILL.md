---
name: sharkx-brand-guidelines
description: SHARKX brand, company facts, data-analysis presentation rules, and UI/layout for Excel, Word, PowerPoint, and Claude HTML/React artifacts. Design tokens, python-docx/pptx/openpyxl themes, charts, KPI dashboards, QA. Red/black Brand Book 2026. Use for marketing analytics reports, media dashboards, client decks, audits, and self-contained HTML deliverables.
license: Proprietary — SHARKX
metadata:
  author: SHARKX
  version: "2.0.0"
  primary-formats: xlsx, docx, pptx, artifact-html
  heading-font: Sharp Sans
  body-font: Sharp Sans
  arabic-font: GE Flow
  primary-color: "#e70101"
  secondary-color: "#1c0f0f"
  tagline: Marketing Built to Dominate
---

# SHARKX Brand System 2.0

One skill for **brand + company facts + data presentation + layout/UX + Office/artifacts**. Colors, typography, analytics patterns, and design rules are **in this file** — apply on every deliverable. Format deep-dives: `references/*`.

Sources: `references/brand-book-sharkx-2026.pdf` · `assets/company.json` · [sharkx.ae](https://www.sharkx.ae)

---

## Golden rules

1. **Brand colors:** **SHARKX Red `#e70101`** · **SHARKX Black `#1c0f0f`**. Red = impact (cover, headers, primary CTA, chart series 1). Black = structure, body, series 2.
2. **Light data canvases:** `#FFFFFF`, page `#fafafa`, shell `#f5f5f5` for xlsx/docx/artifacts — readable tables first. **Red full-bleed** only on **title/cover** slides or hero bands, not every data sheet.
3. **Primary lockup:** white **SHARKX** on red — covers, heroes (`assets/logos/logo-primary-red-bg.png` when available).
4. **Logo on light:** red (primary) or black (corporate). **On dark:** white only — no gradients on static Office/print.
5. **Typography:** **Sharp Sans** — Bold H1, Medium H2, Light/Regular body. **Arabic:** **GE Flow** — logo stays Latin **SHARKX**.
6. **Naming:** **SHARKX** headlines · **SharkX** body · **sharkx** lowercase **only** for URL (`sharkx.ae`).
7. **Numbers. Not narratives.** Lead with KPIs, deltas, and sourced metrics — then sharp commentary (SharkX voice).
8. Load hex/RGB from `assets/tokens.json` + `assets/office-theme.json` — never invent palette colors.

---

## What to do (single flow)

1. **Classify** → read `references/data-analysis-mode.md` if the task is metrics, exports, or dashboards.
2. **Pick format** → `excel-mode` | `report-mode` | `presentation-mode` | `artifacts-mode`.
3. **Apply design & layout** (below) — same section order across artifact → Office when promoting.
4. **Build** with `office-theme.json`, `chart-theme.json`, `brand.css` / `artifact-starter.html`, logos in `assets/logos/`.
5. **QA** → `references/qa-checklist.md` → filename `Client-SharkX-Topic-YYYY-MM-DD.{ext}`.

**Default:** artifact or xlsx for data-heavy review → docx/pptx for client send.

---

## Data presentation (always for analytics work)

Apply with `references/data-analysis-mode.md`:

- **Trust block:** date range, timezone, data source (GA4, GSC, Google/Meta Ads, CRM, sheets), last refresh, currency (AED/USD).
- **KPI strip:** 3–6 metrics max above fold; each = label (muted) + value (bold black) + Δ (black on `#fde6e6` or red dot for down).
- **Tables:** sort by impact (spend, conversions, revenue) unless time series; right-align numbers; `%` one decimal unless user says otherwise.
- **Charts:** ≤5 series, `chart-theme.json`, direct labels where possible; white plot; no 3D/gradient fills.
- **Insights:** 1 headline per section + max **3** numbered actions (Action — outcome — owner/time).
- **Regulated clients:** compliance-aware wording (SharkX differentiator) — no unverified claims.

---

## Design & layout (always apply)

### Visual system

| Layer | Rule |
|--------|------|
| **Pattern** | Cover/hero → KPI strip → findings table/chart → insights → max 3 actions → footer |
| **Style** | Bold minimal: white cards, soft gray page, red accents, black type, shadow `0 1px 3px rgba(28,15,15,.08)` |
| **Width** | Max **72rem**; 8pt grid (`tokens.json` → `space`) |
| **Radius** | Cards 16px; buttons 12px |
| **CTA** | One primary red button; one secondary black outline max |
| **Charts** | Flat, labeled, palette from `chart-theme.json` |
| **Gradients** | Icon/motion only — not docx/xlsx/static pptx |

### Document archetypes

| Type | Section order | Best as |
|------|----------------|---------|
| Executive snapshot | Hero → 3–4 KPIs → 1 chart → 3 actions | artifact → pptx/docx |
| Paid media / channel report | Summary → platform tabs → MoM chart → budget table | xlsx + pptx |
| SEO / organic audit | Crawl summary → issues table → priority matrix | docx + xlsx |
| QBR / pitch | Problem → numbers → insight → SharkX method → next steps | pptx |
| Live dashboard preview | KPI grid + 2 charts + filter chips | artifact HTML |
| Bilingual | Sharp Sans EN + GE Flow AR blocks; Latin logo | docx / artifact |

**Findings matrix:** Impact × effort; quick wins = red **dot** + black text.

### Per-format layout

| Format | Rules |
|--------|--------|
| **HTML/React artifact** | Self-contained CSS; `.sx-*` / `brand.css`; 375/768/1024px; print CSS; Chart.js/Recharts with brand colors |
| **docx** | 28pt title, 20pt H2, 11pt body; red table headers; python-docx + theme JSON |
| **pptx** | 16:9; red **title** slide OK; content slides light; one chart per data slide |
| **xlsx** | **Summary** first; red header row; freeze + filters; Notes = methodology |

### UX & data UX

- Body on white = black or muted ≥14px; focus ring 3px red.
- SVG icons only — no emoji UI icons.
- HTML: `cursor:pointer`, `:focus-visible`, `prefers-reduced-motion`.
- No color-only meaning in charts; tabular nums for all metrics.
- Max **6** KPI tiles above fold; one message per slide/section.
- Footer: `SharkX · {date} · Confidential · sharkx.ae` (unless user opts out).

### Never do

- Unsourced metrics, vanity-only KPIs without outcome context, rainbow Excel, 6+ chart colors, logo misuse, generic agency fluff, AI purple/neon palettes, dark full-bleed **data** sheets.

---

## Mode router

| User need | Read first | Output |
|-----------|------------|--------|
| Spreadsheet, model, export | `excel-mode.md` | xlsx |
| Written report, audit PDF | `report-mode.md` | docx |
| Deck, QBR | `presentation-mode.md` | pptx |
| Interactive preview, dashboard HTML | `artifacts-mode.md` | HTML/React |
| Analytics structure, KPIs, sources | `data-analysis-mode.md` | any |
| Workflow artifact → Office | `office-workflow.md` | — |
| Pre-ship | `qa-checklist.md` | — |

---

## Voice (copy alongside data)

Confident, operator-led: short sentences, active voice, outcomes before adjectives. Tagline on cover only: *Marketing Built to Dominate.*

---

## Assets

| File | Use |
|------|-----|
| `assets/tokens.json` | Colors, type, spacing |
| `assets/office-theme.json` | RGB, Excel/docx/pptx sizes, formats |
| `assets/chart-theme.json` | Chart palettes |
| `assets/brand.css` / `artifact-starter.html` | HTML artifacts |
| `assets/company.json` | Company, method, sectors |
| `assets/logos/*` | Lockups |
| `scripts/office_colors.py` | Python RGB helper |

---

## Reference index

| Topic | File |
|-------|------|
| Analytics & KPI structure | `references/data-analysis-mode.md` |
| Brand book summary | `references/brand-book-summary.md` |
| Company | `references/company-knowledge.md` |
| Workflow | `references/office-workflow.md` |
| xlsx | `references/excel-mode.md` |
| docx | `references/report-mode.md` |
| pptx | `references/presentation-mode.md` |
| Artifacts | `references/artifacts-mode.md` |
| Logo/color/type | `references/logo-color-type.md` |
| a11y | `references/accessibility.md` |
| Web | `references/web-mode.md` |
| QA | `references/qa-checklist.md` |

---

## Governance

v2.0.0 — Brand + **data presentation** + Office/artifact parity with production skill standards. Sync `company.json` from sharkx.ae when marketing changes. Logos installed under `assets/logos/` (see `assets/logos/README.md`).
