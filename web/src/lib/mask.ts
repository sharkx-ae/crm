/** `o•••@sharkx.ae`: the full address never reaches the browser on the code screen. Same rule as the api's. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
