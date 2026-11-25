import { type NextRequest, NextResponse } from 'next/server';
import errors from '../../../../../messages/en/errors.json';
import leads from '../../../../../messages/en/leads.json';
import { leadExportRequest, leadExportRows } from '../../../../contracts/leads.ts';
import { apiCall } from '../../../../lib/api/client.ts';
import { ApiError } from '../../../../lib/api/error.ts';
import { clientSlug, exportFailureMessage, leadsCsv } from '../../../../lib/csv.ts';
import { getProject } from '../../../../lib/data/projects.ts';
import { assertSameOrigin } from '../../../../lib/security.ts';
import { getSession } from '../../../../lib/session.ts';

// CSV download (F4b S4, D1). The only kind today is `leads`; the browser never calls the api itself.
// Tell Alex: the spec named him for this shell. English catalogs until the D18 locale batch.
export const dynamic = 'force-dynamic';

const copy = {
  tooLarge: leads.export.tooLarge,
  failed: leads.export.failed,
  byCode: errors,
};

function text(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function failure(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return text(err.status, exportFailureMessage(err.code, err.details, copy));
  }
  return text(500, errors.INTERNAL);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
): Promise<NextResponse> {
  const { kind } = await context.params;
  if (kind !== 'leads') return text(404, errors.NOT_FOUND);

  try {
    assertSameOrigin(request);
    const me = await getSession();
    if (me?.stage !== 'active') return text(401, errors.UNAUTHENTICATED);

    const parsed = leadExportRequest.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return text(422, errors.VALIDATION);

    const data = await apiCall(leadExportRows, '/leads/export', {
      method: 'POST',
      body: parsed.data,
    });
    let name = 'client';
    try {
      name = (await getProject(parsed.data.projectId))?.name ?? name;
    } catch {
      // The rows are already audited. A missing name must not turn a good export into an error.
    }
    const day = new Date().toISOString().slice(0, 10);
    const filename = `SharkX-Leads-${clientSlug(name)}-${day}.csv`;
    const csv = leadsCsv(leads.export.columns, data.rows, data.view === 'staff');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return failure(err);
  }
}
