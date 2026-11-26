import type { MappingTarget } from '../../contracts/leads.ts';

// Per-form field mapping (F4a S2). A form's answers arrive as {question: answer}; the mapping says where each question
// goes. Questions without a mapping stay in the lead's answers (as custom fields), so nothing is lost silently.

export type MappedAnswers = {
  name?: string;
  phone?: string;
  email?: string;
  /** What stays on the lead as custom answers. */
  custom: Record<string, string>;
  /** "Question: answer" lines that become one internal note. */
  notes: string[];
};

export function applyMapping(
  answers: Record<string, string>,
  mapping: Record<string, MappingTarget | string> | null | undefined,
): MappedAnswers {
  const out: MappedAnswers = { custom: {}, notes: [] };
  for (const [question, raw] of Object.entries(answers)) {
    const answer = raw.trim();
    if (!answer) continue;
    switch (mapping?.[question]) {
      case 'name':
        out.name ??= answer;
        break;
      case 'phone':
        out.phone ??= answer;
        break;
      case 'email':
        out.email ??= answer;
        break;
      case 'notes':
        out.notes.push(`${question}: ${answer}`);
        break;
      case 'ignore':
        break;
      default:
        out.custom[question] = answer;
    }
  }
  return out;
}
