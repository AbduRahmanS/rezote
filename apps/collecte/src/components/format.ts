/** "+1,2 %", "-0,9 %", or "–" when there is no value. */
export const pct = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`);
