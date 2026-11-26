/** Reads every page of a paged list (100 rows at a time) and returns the first page with all the rows joined. */
export async function allPages<P extends { rows: unknown[]; total: number }>(
  fetchPage: (page: number) => Promise<P>,
): Promise<P> {
  const first = await fetchPage(1);
  const rows = [...first.rows];
  for (let page = 2; rows.length < first.total; page += 1) {
    const next = await fetchPage(page);
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
  }
  return { ...first, rows };
}
