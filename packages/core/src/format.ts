// French formats used in Mali. These do not depend on Intl locale data, so the
// output is identical on every phone and browser.
//
// Money is integer FCFA (XOF has no subunits). Weights are integer grams.

/** Non-breaking space, so "10 000 FCFA" never wraps across lines. */
export const NBSP = "\u00a0";

function groupThousands(n: number): string {
  const digits = Math.abs(Math.trunc(n)).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += NBSP;
    out += digits[i];
  }
  return (n < 0 ? "-" : "") + out;
}

/** 25350 → "25 350" */
export function formatNumber(n: number): string {
  return groupThousands(n);
}

/** 25350 → "25 350 FCFA" */
export function formatFCFA(amount: number): string {
  return `${groupThousands(amount)}${NBSP}FCFA`;
}

/** Parses "25 350", "25350 FCFA", or "25.350" to 25350. Returns null if not a whole amount. */
export function parseFCFA(text: string): number | null {
  const cleaned = text.replace(/fcfa|f\s*cfa|f$/i, "").replace(/[\s\u00a0\u202f.]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/** 84500 g → "84,5 kg"; 84000 g → "84 kg"; 1250000 g → "1 250 kg" (one decimal at most, rounded to 100 g). */
export function formatKg(grams: number): string {
  const tenths = Math.round(grams / 100);
  const negative = tenths < 0;
  const abs = Math.abs(tenths);
  const whole = Math.floor(abs / 10);
  const decimal = abs % 10;
  const text = groupThousands(whole) + (decimal ? `,${decimal}` : "");
  return `${negative ? "-" : ""}${text}${NBSP}kg`;
}

/** Formats a weight in tonnes with one decimal for large totals: 12_345_000 g → "12,3 t". */
export function formatTonnes(grams: number): string {
  const tenths = Math.round(grams / 100_000);
  const whole = Math.trunc(tenths / 10);
  const decimal = Math.abs(tenths % 10);
  return `${groupThousands(whole)}${decimal ? `,${decimal}` : ""}${NBSP}t`;
}

/**
 * Parses a weight typed by the user, in kg, with a comma or a dot and at most one
 * decimal: "84,5", "84.5", "84" → grams. Returns null if invalid or not positive.
 */
export function parseKg(text: string): number | null {
  const cleaned = text.trim().replace(/\s*kg$/i, "").replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(\.\d)?$/.test(cleaned)) return null;
  const [whole, decimal = "0"] = cleaned.split(".");
  const grams = Number(whole) * 1000 + Number(decimal) * 100;
  return grams > 0 && Number.isSafeInteger(grams) ? grams : null;
}

/** Parses liters with at most one decimal → centiliters. */
export function parseLiters(text: string): number | null {
  const cleaned = text.trim().replace(/\s*l$/i, "").replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, decimal = "0"] = cleaned.split(".");
  const cl = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return cl > 0 && Number.isSafeInteger(cl) ? cl : null;
}

/** 12345 cl → "123,45 L"; 12300 → "123 L" */
export function formatLiters(cl: number): string {
  const whole = Math.trunc(cl / 100);
  const rest = Math.abs(cl % 100);
  const decimals = rest === 0 ? "" : rest % 10 === 0 ? `,${rest / 10}` : `,${String(rest).padStart(2, "0")}`;
  return `${groupThousands(whole)}${decimals}${NBSP}L`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14/11/2026" in the phone's local time zone (Mali uses GMT all year). */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "14/11" */
export function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "17:45" */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "14/11/2026 17:45" */
export function formatDateTime(ms: number): string {
  return `${formatDate(ms)} ${formatTime(ms)}`;
}

/** 135 min → "2 h 15"; 4 days 10 h 40 → "4 j 10 h 40"; 50 s → "0 min" */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} j ${hours} h ${pad(minutes)}`;
  if (hours > 0) return `${hours} h ${pad(minutes)}`;
  return `${minutes} min`;
}

/** "il y a 5 min", "il y a 3 h", "il y a 2 j" */
export function formatAgo(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInput(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
