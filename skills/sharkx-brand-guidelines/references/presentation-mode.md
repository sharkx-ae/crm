# Presentation mode — pptx

QBRs, pitch decks, performance readouts. **16:9.**

## Slide layouts

1. **Title (red)** — bg `#e70101`, white logo/wordmark, H1 white 28–40pt, tagline once, client + date.
2. **Title (light)** — white bg, red or black logo, black H1.
3. **Trust / agenda** — period, sources, 3–4 agenda bullets (16pt).
4. **Section** — shell `#f5f5f5`, black H1, red accent rule 4px.
5. **Content** — H2 20pt; body 16–18pt; max 5 bullets.
6. **Data** — **one chart** + one KPI callout (big number + Δ); source 10pt muted bottom.
7. **Actions** — max 3 numbered outcomes.
8. **Closing** — logo, hello@sharkx.ae, +971 50 176 7100, sharkx.ae.

Content slides stay **light** — avoid red full-bleed except title/section accents.

## Type

Display 40 · H1 28 · H2 20 · Body 16–18 · Caption 10–11.

## KPI tile

40pt black value · 12pt muted label · Δ chip black on `#fde6e6` or red arrow icon.

## Charts

`chart-theme.json`; white plot; flat; no 3D. One message per data slide.

## python-pptx

```python
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import json

ROOT = Path("Sharkx")
theme = json.loads((ROOT / "assets/office-theme.json").read_text())
RED = RGBColor(*theme["rgb"]["red"])
BLACK = RGBColor(*theme["rgb"]["black"])
WHITE = RGBColor(255, 255, 255)

prs = Presentation()
prs.slide_width = Inches(theme["page"]["pptx"]["widthInches"])
prs.slide_height = Inches(theme["page"]["pptx"]["heightInches"])

# Title slide (red)
slide = prs.slides.add_slide(prs.slide_layouts[6])
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = RED
box = slide.shapes.add_textbox(Inches(0.5), Inches(2.5), Inches(12), Inches(1.5))
tf = box.text_frame
tf.text = "QBR — Client Name"
p = tf.paragraphs[0]
p.font.name = "Sharp Sans"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = WHITE

prs.save("Client-SharkX-QBR-2026-10-01.pptx")
```

Logo: `pptx.logoPath` (light slides), `logoPathOnRed` on red title.

## QA

`qa-checklist.md` — logo on title + closing; no paragraphs >4 lines.
