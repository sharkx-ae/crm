// UI strings live in messages/<locale>/<module>.json. This finds the ones that do not:
// JSX text and string-literal values of user-visible attributes. A line (or the line above)
// that carries `i18n-ignore` is skipped: `// i18n-ignore` after an attribute, `{/* i18n-ignore */}` before JSX text.
import ts from 'typescript';

const ATTRS = new Set(['aria-label', 'alt', 'title', 'placeholder', 'aria-description', 'label']);
const HAS_LETTER = /\p{L}/u;

const literalText = (node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;

/** Hard-coded UI strings in one .tsx source: `[{ line, text, kind }]`, line is 1-based. */
export function findHardcoded(source, fileName = 'file.tsx') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split('\n');
  const ignored = (line) =>
    lines[line - 1]?.includes('i18n-ignore') || lines[line - 2]?.includes('i18n-ignore');
  const hits = [];
  const report = (pos, text, kind) => {
    const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
    if (!ignored(line)) hits.push({ line, text: text.trim().replace(/\s+/g, ' '), kind });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (HAS_LETTER.test(node.text)) report(node.pos + node.text.search(/\S/), node.text, 'text');
    } else if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      const text =
        literalText(init) ??
        (ts.isJsxExpression(init) && init.expression ? literalText(init.expression) : null);
      if (text !== null && HAS_LETTER.test(text)) report(init.getStart(sf), text, 'attribute');
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      // {'Hello'} as a child is the same as JSX text
      const text = literalText(node.expression);
      if (text !== null && HAS_LETTER.test(text)) report(node.getStart(sf), text, 'text');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}
