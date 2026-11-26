// Client colours are brand tokens only (tokens.json: red, black, blackTint60, redTint60, blackTint40; web plan §2.5).
export const PROJECT_COLORS = ['#e70101', '#1c0f0f', '#776f6f', '#f16767', '#a49f9f'] as const;

/**
 * The stored colour, or a stable token picked from the project id when none is stored. Derived from the id (not a
 * row position) because row-level security shows each viewer a different set of rows.
 */
export function colorFor(projectId: string, stored: string | null): string {
  if (stored) return stored;
  let sum = 0;
  for (const ch of projectId.replaceAll('-', '')) sum += Number.parseInt(ch, 16);
  return PROJECT_COLORS[sum % PROJECT_COLORS.length] as string;
}
