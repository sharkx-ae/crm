export function findHardcoded(
  source: string,
  fileName?: string,
): { line: number; text: string; kind: 'text' | 'attribute' }[];
