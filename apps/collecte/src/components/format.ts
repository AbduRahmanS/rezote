/** "+1,2 %", "-0,9 %", or "–" when there is no value. */
export const pct = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`);

/** "1 bâche", "5 bâches", "0 bâche" (French: 0 and 1 are singular). */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${Math.abs(n) <= 1 ? word : many}`;
