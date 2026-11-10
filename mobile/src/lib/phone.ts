/**
 * Phone numbers for WhatsApp links: digits only, with country code.
 * Indian numbers saved without a code (98765 43210, 098765 43210) get 91.
 */
export function waNumber(raw: string | undefined, defaultCountry = '91'): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith('+');
  let d = raw.replace(/\D/g, '');
  if (hasPlus) return d.length >= 8 ? d : null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = defaultCountry + d.slice(1);
  else if (d.length === 10) d = defaultCountry + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export function displayPhone(raw: string | undefined): string {
  return raw?.trim() ?? '';
}
