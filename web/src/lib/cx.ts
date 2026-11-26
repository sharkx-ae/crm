export type ClassValue = string | false | null | undefined;

// Joins class names, dropping the falsy ones. Components keep their variants in separate strings
// instead of overriding each other, so no merge library is needed.
export const cx = (...parts: ClassValue[]): string => parts.filter(Boolean).join(' ');
