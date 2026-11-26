import { describe, expect, it } from 'vitest';
import leads from '../../messages/en/leads.json';
import {
  clientSlug,
  csvField,
  exportFailureMessage,
  type LeadCsvLabels,
  leadsCsv,
  toCsv,
} from './csv.ts';

const labels: LeadCsvLabels = leads.export.columns;
const at = '2026-11-25T04:00:00.000+04:00';
const utc = '2026-11-25T00:00:00.000Z';

const row = {
  name: 'Sara Noor',
  phone: '+971501112233',
  email: 'sara@example.com',
  source: 'meta',
  campaign: 'Spring',
  status: 'mql',
  reason: null,
  receivedAt: at,
  ownerName: 'Aisha Rahman',
};

describe('csvField', () => {
  it('quotes commas, quotes and line breaks, and doubles an embedded quote', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('Doe, Jane')).toBe('"Doe, Jane"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('prefixes a leading = + - @ or tab so a spreadsheet does not run it', () => {
    expect(csvField('=cmd')).toBe("'=cmd");
    // a real phone number is not a formula: no apostrophe in the Phone column
    expect(csvField('+971501112233')).toBe('+971501112233');
    expect(csvField('+971 50 1112233')).toBe("'+971 50 1112233");
    expect(csvField('+1+1')).toBe("'+1+1");
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('@sum')).toBe("'@sum");
    expect(csvField('\thidden')).toBe("'\thidden");
    expect(csvField('=1,2')).toBe(`"'=1,2"`);
  });
});

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF, including a trailing break', () => {
    expect(
      toCsv([
        ['A', 'B'],
        ['1', '2'],
      ]),
    ).toBe('A,B\r\n1,2\r\n');
  });
});

describe('leadsCsv', () => {
  it('uses the catalog headers, and a client file has no Owner column', () => {
    const csv = leadsCsv(labels, [row], false);
    const [header, body] = csv.trimEnd().split('\r\n');
    expect(header).toBe('Name,Phone,Email,Source,Campaign,Status,Reason,Received');
    expect(header).not.toContain('Owner');
    expect(body).toBe(`Sara Noor,+971501112233,sara@example.com,meta,Spring,mql,,${utc}`);
  });

  it('staff file adds Owner before Received, and Received is ISO UTC', () => {
    const csv = leadsCsv(labels, [{ ...row, receivedAt: utc }], true);
    const [header, body] = csv.trimEnd().split('\r\n');
    expect(header).toBe('Name,Phone,Email,Source,Campaign,Status,Reason,Owner,Received');
    expect(body?.endsWith(`,Aisha Rahman,${utc}`)).toBe(true);
    expect(body).toContain(utc);
  });
});

describe('clientSlug', () => {
  it('keeps letters and digits and turns the rest into single hyphens', () => {
    expect(clientSlug('Lumière Aesthetics')).toBe('Lumi-re-Aesthetics');
    expect(clientSlug('---')).toBe('client');
  });
});

describe('exportFailureMessage', () => {
  const copy = {
    tooLarge: leads.export.tooLarge,
    failed: leads.export.failed,
    byCode: { VALIDATION: 'Check the highlighted fields and try again.' },
  };

  it('too_many uses the narrow-the-filter line; anything else uses the error catalog', () => {
    expect(exportFailureMessage('VALIDATION', { reason: 'too_many' }, copy)).toBe(copy.tooLarge);
    expect(exportFailureMessage('VALIDATION', undefined, copy)).toBe(copy.byCode.VALIDATION);
    expect(exportFailureMessage('NOPE', undefined, copy)).toBe(copy.failed);
  });
});
