/**
 * Normalise a phone number into WhatsApp's format: digits only, with the
 * country code, without "+" (e.g. "923001234567").
 *
 * Handles common local formats:
 *   "0300-1234567"   -> "923001234567"  (leading trunk 0 replaced by country code)
 *   "+92 300 1234567" -> "923001234567"
 *   "0092300..."      -> "92300..."     (international 00 prefix)
 *   "3001234567"      -> "923001234567" (bare national number)
 *
 * Returns null when the result cannot be a valid phone number.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode: string,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  const cc = defaultCountryCode.replace(/\D/g, "");

  if (!hasPlus) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
      digits = cc + digits.replace(/^0+/, "");
    } else if (cc && !digits.startsWith(cc)) {
      digits = cc + digits;
    } else if (cc && digits.startsWith(cc) && digits.length <= 10) {
      // Number like "3001234567" that happens to start with the country
      // code digits but is too short to already include it.
      digits = cc + digits;
    }
  }

  // E.164 allows at most 15 digits; anything under 8 is not a real mobile.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
