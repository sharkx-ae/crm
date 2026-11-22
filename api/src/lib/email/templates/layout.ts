// Shared frame for every email. SHARKX brand: red #e70101 and black #1c0f0f on a light canvas, card radius 16,
// button radius 12, no gradients, no emoji (skills/sharkx-brand-guidelines). Email clients ignore external CSS, so inline.
const RED = '#e70101';
const BLACK = '#1c0f0f';

export const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export type Rendered = { subject: string; text: string; html: string };

type Block = {
  paragraphs: string[];
  button?: { label: string; url: string };
  code?: string;
  note?: string;
};

/** Builds the text and HTML parts from the same blocks, so they can never disagree. */
export function frame(subject: string, heading: string, block: Block): Rendered {
  const text = [
    heading,
    '',
    ...block.paragraphs,
    ...(block.code ? ['', block.code] : []),
    ...(block.button ? ['', `${block.button.label}: ${block.button.url}`] : []),
    ...(block.note ? ['', block.note] : []),
    '',
    '-- SharkX',
  ].join('\n');

  const p = (s: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${BLACK}">${escapeHtml(s)}</p>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:'Sharp Sans',Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px">
<tr><td style="padding:20px 32px;background:${RED};border-radius:16px 16px 0 0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px">SHARKX</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;color:${BLACK}">${escapeHtml(heading)}</h1>
${block.paragraphs.map(p).join('\n')}
${block.code ? `<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:8px;color:${BLACK}">${escapeHtml(block.code)}</p>` : ''}
${block.button ? `<p style="margin:0 0 24px"><a href="${escapeHtml(block.button.url)}" style="display:inline-block;padding:14px 24px;background:${RED};color:#ffffff;border-radius:12px;font-weight:700;text-decoration:none">${escapeHtml(block.button.label)}</a></p>` : ''}
${block.note ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#5c5656">${escapeHtml(block.note)}</p>` : ''}
</td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
