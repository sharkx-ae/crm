// RFC 4180 CSV for the leads export (F4b S4). Cells that a spreadsheet would treat as a formula get a leading quote.

const FORMULA = /^[=+\-@\t]/;

/** One cell: spreadsheet-injection guard, then RFC 4180 quoting. */
export function csvField(value: string): string {
  const guarded = FORMULA.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
  return guarded;
}

/** Rows joined with CRLF, including the trailing break RFC 4180 files carry. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

/** "Lumière Aesthetics" → "Lumi-re-Aesthetics": the client piece of the download name. */
export function clientSlug(name: string): string {
  const slug = name.replace(/\W+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'client';
}

export type LeadCsvLabels = {
  name: string;
  phone: string;
  email: string;
  source: string;
  campaign: string;
  status: string;
  reason: string;
  owner: string;
  received: string;
};

export type LeadCsvRow = {
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  campaign: string | null;
  status: string;
  reason: string | null;
  receivedAt: string;
  ownerName?: string | null;
};

const cell = (value: string | null | undefined): string => value ?? '';

/** Received is always UTC, whatever offset the api sent. An unreadable stamp is left as it arrived. */
export function receivedIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Header `Name, Phone, Email, Source, Campaign, Status, Reason, [Owner,] Received`.
 * A client export has no Owner column. Labels come from `leads.export.columns`.
 */
export function leadsCsv(
  labels: LeadCsvLabels,
  rows: readonly LeadCsvRow[],
  staff: boolean,
): string {
  const header = [
    labels.name,
    labels.phone,
    labels.email,
    labels.source,
    labels.campaign,
    labels.status,
    labels.reason,
    ...(staff ? [labels.owner] : []),
    labels.received,
  ];
  const body = rows.map((row) => [
    cell(row.name),
    cell(row.phone),
    cell(row.email),
    row.source,
    cell(row.campaign),
    row.status,
    cell(row.reason),
    ...(staff ? [cell(row.ownerName)] : []),
    receivedIso(row.receivedAt),
  ]);
  return toCsv([header, ...body]);
}

/** The short text a failed export shows. `too_many` is the "narrow the filter" line; other codes use `errors.<code>`. */
export function exportFailureMessage(
  code: string,
  details: { reason?: unknown } | undefined,
  copy: { tooLarge: string; failed: string; byCode: Readonly<Record<string, string>> },
): string {
  if (code === 'VALIDATION' && details?.reason === 'too_many') return copy.tooLarge;
  return copy.byCode[code] ?? copy.failed;
}
