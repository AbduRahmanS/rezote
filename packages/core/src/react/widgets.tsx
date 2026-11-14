import { useState, type ReactNode } from "react";
import { useGhosts, type AnyApp } from "./hooks.ts";

/** Shown next to any record whose event has not reached the server yet. */
export function GhostMark({ app, id }: { app: AnyApp; id: string | (string | null | undefined)[] }) {
  const ghosts = useGhosts(app);
  const ids = Array.isArray(id) ? id : [id];
  if (!ids.some((x) => x && ghosts.has(x))) return null;
  return (
    <span className="ghost" title="Pas encore envoyé : visible seulement sur ce téléphone">
      👻
    </span>
  );
}

/** "is-ghost" class for a card or row whose event is still in the outbox. */
export function useGhostClass(app: AnyApp, ...ids: (string | null | undefined)[]): string {
  const ghosts = useGhosts(app);
  return ids.some((x) => x && ghosts.has(x)) ? "is-ghost" : "";
}

export async function shareText(text: string, title?: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share) {
      await navigator.share(title ? { title, text } : { text });
      return "shared";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    window.prompt("Copiez ce texte :", text);
    return "copied";
  }
}

export function ShareButton({
  text,
  title,
  label = "Partager",
  className = "btn",
}: {
  text: string | (() => string);
  title?: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState("");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const result = await shareText(typeof text === "function" ? text() : text, title);
        if (result === "copied") {
          setDone("Copié ✓");
          setTimeout(() => setDone(""), 2000);
        }
      }}
    >
      {done || label}
    </button>
  );
}

/** Large keypad for typing weights and amounts with one hand, outdoors. */
export function NumberPad({
  value,
  onInput,
  decimal = true,
  maxLength = 9,
}: {
  value: string;
  onInput: (v: string) => void;
  decimal?: boolean;
  maxLength?: number;
}) {
  const press = (key: string) => {
    if (key === "⌫") return onInput(value.slice(0, -1));
    if (key === ",") {
      if (!decimal || value.includes(",") || value === "") return;
      return onInput(value + ",");
    }
    if (value.includes(",") && value.split(",")[1]!.length >= 1) return;
    if (value.length >= maxLength) return;
    if (value === "0") return onInput(key);
    onInput(value + key);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "," : "", "0", "⌫"];
  return (
    <div className="pad">
      {keys.map((k, i) =>
        k ? (
          <button type="button" key={k} className="pad-key" onClick={() => press(k)} aria-label={k === "⌫" ? "Effacer" : k}>
            {k}
          </button>
        ) : (
          <span key={`blank-${i}`} />
        ),
      )}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "ok" | "bad" | undefined }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label + control + hint + validation errors (TanStack Form field errors). */
export function Field({ label, children, hint, errors }: { label: string; children: ReactNode; hint?: string; errors?: unknown[] }) {
  const messages = (errors ?? [])
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : ""))
    .filter(Boolean);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {messages.length > 0 && <span className="field-error">{messages.join(" · ")}</span>}
    </label>
  );
}

/** Asks for a cancellation reason. Returns null if the user gave up. */
export function askReason(question = "Raison de l'annulation ?"): string | null {
  const reason = window.prompt(question);
  if (reason === null) return null;
  const trimmed = reason.trim();
  if (!trimmed) {
    window.alert("Une raison est obligatoire.");
    return null;
  }
  return trimmed.slice(0, 200);
}

export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  // The BOM makes Excel open UTF-8 CSV files with the right accents.
  const blob = new Blob(["\ufeff" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Quotes a CSV cell (semicolon-separated, as Excel expects in French locales). */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

/** Runs an action and shows errors in plain French instead of failing silently. */
export async function act(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
    return false;
  }
}
