# QA checklist — before you publish

Every docx, pptx, xlsx, PDF, or artifact.

## Brand

- [ ] Red `#e70101` and black `#1c0f0f` from `tokens.json` — no random palettes
- [ ] Sharp Sans (or Segoe UI fallback noted)
- [ ] **SHARKX** / **SharkX** / URL naming rules
- [ ] Logo variant correct; min size; not stretched
- [ ] Footer date + confidentiality
- [ ] Tagline only on cover/hero

## Data & analytics

- [ ] Date range + timezone stated
- [ ] Data sources named (platforms, accounts)
- [ ] Currency and KPI definitions clear
- [ ] KPI count ≤6 above fold; tables sorted sensibly
- [ ] Deltas formatted consistently (+0.0% / currency)
- [ ] No `#REF!` / `#DIV/0!` in xlsx
- [ ] Insights → max **3** actions with outcomes
- [ ] Regulated copy compliant (no unverified claims)
- [ ] **Numbers. Not narratives.** — data before fluff

## docx

- [ ] Title 28pt, H2 20pt, body 11pt
- [ ] Table headers white on red
- [ ] Margins ~1"; charts flat branded

## pptx

- [ ] 16:9; body ≥16pt; one idea per slide
- [ ] One chart per data slide; palette from `chart-theme.json`
- [ ] Title + closing logo

## xlsx

- [ ] Summary first; period + sources
- [ ] Header frozen; filters on Data
- [ ] Number formats (%, AED/USD, dates)
- [ ] Notes sheet for methodology
- [ ] Print area if user prints

## Artifacts

- [ ] No broken local `assets/` paths — embedded CSS / base64 / public URLs
- [ ] 375 / 768 / 1024px — no horizontal scroll
- [ ] Print CSS for PDF export
- [ ] Charts labeled; not color-only meaning
- [ ] No emoji UI icons; focus + pointer on clickables
- [ ] `prefers-reduced-motion` respected

## Accessibility

- [ ] No faint `#a49f9f` body text on white
- [ ] Success green not small text alone
- [ ] Chart title + legend or direct labels

## Handoff

- [ ] `Client-SharkX-Topic-YYYY-MM-DD.{ext}`
- [ ] Short summary: what built, assumptions, next step
