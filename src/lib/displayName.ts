// Pages are PDFs by default, so ".pdf" is noise on a card. Other extensions (an imported .jpg or .png) stay as a hint.
export function displayName(name: string): string {
  return name.replace(/\.pdf$/i, '') || name
}
