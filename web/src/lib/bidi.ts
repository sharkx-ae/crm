// A phone number used as plain text (a drawer title, a sentence) must keep its digit order inside Arabic text. In JSX use
// <Phone>; where only a string fits, wrap it in left-to-right isolate marks.
export const ltrIsolate = (text: string): string => `⁦${text}⁩`;
