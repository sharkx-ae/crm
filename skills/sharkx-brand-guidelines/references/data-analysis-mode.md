# Data analysis & presentation mode

Use for **any** task involving metrics, exports, dashboards, or “make sense of this data” — before picking xlsx/docx/pptx/artifact.

SharkX principle: **Numbers. Not narratives.** Commentary is sharp and short after the data.

---

## 1. Clarify (if not provided — state assumptions in deliverable)

- **Client / brand** and reporting period (inclusive dates + timezone)
- **Sources:** GA4, GSC, Google Ads, Meta Ads, LinkedIn, CRM, Shopify, custom CSV, etc.
- **Currency** (AED, USD) and **primary KPI** (ROAS, CPA, leads, bookings, revenue)
- **Audience:** executive vs operator (sets depth of tables)

---

## 2. Standard report structure

```text
1. Trust line     — sources, date range, refresh time, filters applied
2. Executive KPIs — 3–6 tiles (current vs prior period)
3. Trend          — one primary chart (time series or ranked bars)
4. Breakdown      — table by channel/campaign/landing page (top 10–20 rows)
5. Diagnostics    — what changed (drivers, not fluff)
6. Actions        — max 3 numbered recommendations with owner/time
7. Appendix       — raw tables or methodology (xlsx Notes / docx end)
```

---

## 3. KPI definitions (be explicit once)

| KPI | Typical definition | Format |
|-----|-------------------|--------|
| Spend | Platform-reported cost | Currency, 0 decimals |
| Impressions / Clicks | Platform metrics | Integer |
| CTR | clicks/impressions | 0.0% |
| Conversions | User-defined event | Integer |
| CPA / CPL | spend/conversions | Currency |
| ROAS | revenue/spend | 0.00x or % per client norm |
| MoM / YoY Δ | (current−prior)/prior | +0.0%; red flag if down |

Document definitions on **Notes** sheet or docx caption when ambiguous.

---

## 4. Analysis patterns

**Paid media:** Spend → impressions → clicks → conversions → CPA/ROAS by campaign; flag budget pacing.

**SEO/GSC:** Clicks, impressions, CTR, position by query/page; highlight strikers (high impressions, low CTR).

**Funnel:** Step counts + step conversion rates; biggest drop-off step first.

**Multi-touch:** If data incomplete, say so — do not invent attribution.

**Regulated (FX, healthcare, finance):** No guaranteed returns; use compliant language; cite platform data only.

---

## 5. Visual encoding (brand)

- **Up vs down:** Prefer **black text** + `#fde6e6` fill for positive; **destructive `#b91c1c`** only for negative numbers (not whole paragraphs).
- **Chart order:** `#e70101`, `#1c0f0f`, then tints from `chart-theme.json`.
- **Rank bars:** descending by value; time series chronological left→right.

---

## 6. Cross-format mapping

| Analysis block | xlsx | docx | pptx | Artifact |
|----------------|------|------|------|----------|
| Trust line | Summary A2 | subtitle | slide 2 footer | `.sx-meta` |
| KPIs | Summary tiles | table or callout | KPI slide | `.kpi-grid` |
| Trend | Charts sheet | embedded chart | one chart slide | `<canvas>` Chart.js |
| Detail table | Data sheet | table | table slide | `.sx-table` |
| Actions | Summary or Notes | numbered list | closing slide | `<ol>` max 3 |

Promote artifact → Office using **same section order** (`office-workflow.md`).

---

## 7. Python / Excel hygiene

- No `#REF!`, `#DIV/0!` — use `IFERROR`.
- Separate **raw** (Data) from **presentation** (Summary).
- Prefer Excel Tables or named ranges for charts that update.
- Large exports: **xlsxwriter**; styled client books: **openpyxl** (`excel-mode.md`).

---

## 8. Handoff text (Claude)

After delivery, summarize in 3 lines: what file(s), date range, assumptions/limitations, suggested next step (e.g. “schedule weekly refresh”).
