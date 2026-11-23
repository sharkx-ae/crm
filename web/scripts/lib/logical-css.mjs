// Physical-direction CSS breaks Arabic RTL. Use ms-/me-/ps-/pe-/start-/end-/text-start, inline-start/end.
// A line that carries `logical-ignore` is skipped (e.g. an LTR-only chart plot).
const SIDE = '(?:left|right)';

const PATTERNS = [
  {
    // Tailwind classes: ml-2, -mr-1, pl-[3px], left-0, border-l, rounded-tr-lg, text-left, float-right …
    re: /(?<![\w-])-?(?:(?:m[lr]|p[lr]|left|right|scroll-[mp][lr])-[\w[\].%/-]+|(?:border-[lr]|rounded-(?:[lr]|[tb][lr]))(?:-[\w[\].%/-]+)?(?![\w-]))|(?<![\w-])(?:text|float|clear)-(?:left|right)(?![\w-])/g,
    why: 'physical Tailwind class',
  },
  {
    // CSS properties: margin-left, padding-right, border-left-color, border-top-left-radius, scroll-margin-right
    re: new RegExp(
      `(?<![\\w-])(?:(?:margin|padding|scroll-margin|scroll-padding)-${SIDE}|border-${SIDE}(?:-(?:width|style|color))?|border-(?:top|bottom)-${SIDE}-radius)\\s*:`,
      'g',
    ),
    why: 'physical CSS property',
  },
  {
    // CSS declarations: `left: 0`, `right: 0` (start of a declaration; `{ left: x }` in TSX is the style-object rule below)
    re: new RegExp(`(?:^|;)\\s*${SIDE}\\s*:`, 'g'),
    why: 'physical CSS offset',
    cssOnly: true,
  },
  {
    // text-align / float / clear with a physical value
    re: new RegExp(`(?<![\\w-])(?:text-align|float|clear)\\s*:\\s*${SIDE}\\b`, 'g'),
    why: 'physical CSS value',
  },
  {
    // style objects: marginLeft, paddingRight, borderLeftWidth, borderTopLeftRadius, scrollMarginRight
    re: /(?<![\w$])(?:(?:margin|padding|scrollMargin|scrollPadding)(?:Left|Right)|border(?:Left|Right)(?:Width|Style|Color)?|border(?:Top|Bottom)(?:Left|Right)Radius)(?![\w$])/g,
    why: 'physical style property',
    tsxOnly: true,
  },
  {
    // style objects: `{ left: 0 }`, `, right: '4px'`, `left: \`${x}%\``, `left: var(--x)`
    re: new RegExp(`(?:^|[{,])\\s*${SIDE}\\s*:\\s*(?:['"\`\\d.-]|var\\()`, 'g'),
    why: 'physical style offset',
    tsxOnly: true,
  },
  {
    // style objects: textAlign: 'left', float: "right"
    re: new RegExp(`(?<![\\w$])(?:textAlign|float|clear)\\s*:\\s*['"\`]${SIDE}['"\`]`, 'g'),
    why: 'physical style value',
    tsxOnly: true,
  },
];

// A translate-x utility only mirrors correctly when the line also carries its rtl: partner.
const TRANSLATE_X = /(?<![\w-])-?translate-x-[\w[\].%/-]+/g;

/**
 * Physical-direction hits on one source line: `[{ match, why }]`.
 * `kind` is the file type: a bare `left: 0` declaration only counts in `css`; in `tsx` it
 * could be a type member or an ICU parameter, so only value-shaped style objects count.
 */
export function findPhysical(line, kind = 'tsx') {
  if (line.includes('logical-ignore')) return [];
  const hits = [];
  for (const { re, why, cssOnly, tsxOnly } of PATTERNS) {
    if ((cssOnly && kind !== 'css') || (tsxOnly && kind === 'css')) continue;
    for (const m of line.matchAll(re)) hits.push({ match: m[0].trim(), why });
  }
  if (!/(?<![\w-])rtl:/.test(line)) {
    for (const m of line.matchAll(TRANSLATE_X)) {
      hits.push({ match: m[0], why: 'translate-x without an rtl: partner' });
    }
  }
  return hits;
}
