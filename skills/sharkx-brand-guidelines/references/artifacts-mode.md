# Artifacts mode — Claude (HTML / React)

Dashboards, report previews, KPI one-pagers, HTML slide storyboards before docx/pptx/xlsx.

Apply **SKILL.md** design + **data-analysis-mode.md** structure.

## Constraints

- **Self-contained:** inline `<style>` or paste `brand.css` — no dependency on skill folder paths in the artifact.
- **Images:** base64 PNG or HTTPS (e.g. sharkx.ae assets) — `onerror` hide if missing.
- **Fonts:** `"Sharp Sans", "Segoe UI", sans-serif` — GE Flow for `[lang="ar"]`.
- **Light page** `#fafafa`; red hero band OK for header only.
- **Print:** `@media print` white bg; `print-color-adjust: exact` on red hero.

## Starter

Clone `assets/artifact-starter.html` — hero, KPI grid, table, optional chart canvas.

## Artifact type picker

| Need | Build | Then export |
|------|-------|-------------|
| Report review | Single-page HTML sections | docx |
| Dashboard | KPI grid + 2 charts + filters (static) | xlsx + pptx |
| Deck storyboard | `<section class="slide">` full viewport | pptx |
| Table-heavy | sortable-looking table (CSS) | xlsx Data sheet |

## HTML quality bar

1. `<title>` + visible H1 with client name.
2. Trust meta line under hero (period, sources).
3. `.kpi-grid` max 6 tiles — label, value, Δ.
4. `.sx-table` red thead; `.num` right-aligned tabular nums.
5. Chart: Chart.js CDN — colors from `chart-theme.json` categorical array.
6. Insights: `<ol>` max 3 actions.
7. Footer: `SharkX · date · Confidential · sharkx.ae`.
8. Responsive: `max-width: 72rem`; no horizontal scroll at 375px.
9. Interactives: `cursor:pointer`, `:focus-visible`, `prefers-reduced-motion`.

## React artifacts

Root: `fontFamily: '"Sharp Sans", "Segoe UI", sans-serif'`, `color: '#1c0f0f'`.

Pass chart colors: `['#e70101','#1c0f0f','#a49f9f','#f59999','#776f6f']`.

No dark-mode toggle unless requested.

## CDN (online artifacts)

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

Configure Chart.js defaults: white background, black axis, red first series.

## Promote → Office

1. Each `<section>` → docx H1 or pptx slide.
2. `<table>` → docx table or CSV → xlsx Data.
3. Re-embed logo from binary assets — do not screenshot artifact.

After approval: ask which format to generate.

## Publishing checklist

See `qa-checklist.md` artifacts section.
