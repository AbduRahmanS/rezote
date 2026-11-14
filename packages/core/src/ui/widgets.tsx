import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { RezoteApp } from "../app.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyApp = RezoteApp<any, any>;

/** Shown next to any record whose event has not reached the server yet. */
export function GhostMark({ app, id }: { app: AnyApp; id: string | string[] }) {
  const ids = Array.isArray(id) ? id : [id];
  const pending = ids.some((x) => app.ghosts.value.has(x));
  if (!pending) return null;
  return (
    <span class="ghost" title="Pas encore synchronisé : visible seulement sur ce téléphone">
      👻
    </span>
  );
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
  class: cls = "btn",
}: {
  text: string | (() => string);
  title?: string;
  label?: string;
  class?: string;
}) {
  const [done, setDone] = useState("");
  return (
    <button
      type="button"
      class={cls}
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
    <div class="pad">
      {keys.map((k) =>
        k ? (
          <button type="button" key={k} class="pad-key" onClick={() => press(k)} aria-label={k === "⌫" ? "Effacer" : k}>
            {k}
          </button>
        ) : (
          <span key="blank" />
        ),
      )}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ComponentChildren; tone?: "warn" | "ok" | "bad" }) {
  return (
    <div class={`stat ${tone ?? ""}`}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty">{children}</p>;
}

export function Section({ title, children, action }: { title: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <section class="section">
      <div class="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
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
