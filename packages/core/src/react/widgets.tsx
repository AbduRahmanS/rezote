import { Button } from "@rezote/ui/components/button";
import { cn } from "@rezote/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Delete, Ghost, Share2, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";
import { useGhosts, type AnyApp } from "./hooks.ts";

/** Small "not sent" badge next to a record whose event is still in the outbox. */
export function GhostMark({ app, id, compact = false }: { app: AnyApp; id: string | (string | null | undefined)[]; compact?: boolean }) {
  const ghosts = useGhosts(app);
  const ids = Array.isArray(id) ? id : [id];
  if (!ids.some((x) => x && ghosts.has(x))) return null;
  return (
    <span
      className="ghost inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 align-middle text-[11px] font-medium leading-none text-warning-foreground"
      title="Pas encore envoyé : visible seulement sur ce téléphone"
    >
      <Ghost className="size-3" aria-hidden />
      {compact ? <span className="sr-only">non envoyé</span> : "non envoyé"}
    </span>
  );
}

/** "pending" class for a row or card whose event is still in the outbox. */
export function usePendingClass(app: AnyApp, ...ids: (string | null | undefined)[]): string {
  const ghosts = useGhosts(app);
  return ids.some((x) => x && ghosts.has(x)) ? "pending" : "";
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
    toast.success("Copié", { description: "Collez le texte dans WhatsApp ou un SMS." });
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
  variant = "outline",
  className,
}: {
  text: string | (() => string);
  title?: string;
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  return (
    <Button type="button" variant={variant} className={className} onClick={() => void shareText(typeof text === "function" ? text() : text, title)}>
      <Share2 aria-hidden />
      {label}
    </Button>
  );
}

/** Large keypad for typing weights and amounts with one hand, outdoors. */
export function NumberPad({ value, onInput, decimal = true, maxLength = 9 }: { value: string; onInput: (v: string) => void; decimal?: boolean; maxLength?: number }) {
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
    <div className="pad grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k ? (
          <Button
            type="button"
            key={k}
            variant="outline"
            className="h-14 text-xl font-semibold tabular-nums active:bg-accent"
            onClick={() => press(k)}
            aria-label={k === "⌫" ? "Effacer" : k}
          >
            {k === "⌫" ? <Delete className="size-5" aria-hidden /> : k}
          </Button>
        ) : (
          <span key={`blank-${i}`} />
        ),
      )}
    </div>
  );
}

type Tone = "warn" | "ok" | "bad" | undefined;
const toneClass: Record<NonNullable<Tone>, string> = {
  warn: "text-warning-foreground",
  ok: "text-success-foreground",
  bad: "text-destructive",
};

export function Stat({ label, value, tone, hint, className }: { label: string; value: ReactNode; tone?: Tone; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("stat rounded-lg border bg-card px-3 py-2.5", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("stat-value mt-0.5 text-lg font-semibold tabular-nums leading-tight", tone && toneClass[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-2", className)}>{children}</div>;
}

export function Empty({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="empty flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="size-5" aria-hidden />}
      {children}
    </div>
  );
}

export function Section({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("mt-6", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Title block at the top of a page, with an optional back link and actions. */
export function PageHeader({
  title,
  description,
  back,
  actions,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { to: string; params?: Record<string, string>; search?: Record<string, unknown>; label?: string };
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-4">
      {back && (
        <Link
          to={back.to}
          params={back.params}
          search={back.search}
          className="-ml-1 mb-2 inline-flex items-center gap-0.5 rounded-md py-1 pr-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label ?? "Retour"}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight">
            {title}
            {badge}
          </h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A list in one bordered box, rows separated by lines. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y overflow-hidden rounded-lg border bg-card", className)}>{children}</ul>;
}

export function ListItem({
  title,
  subtitle,
  end,
  icon: Icon,
  className,
  chevron = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  end?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  chevron?: boolean;
}) {
  return (
    <div className={cn("row flex min-h-14 items-center gap-3 px-3 py-2.5", className)}>
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-[0.9375rem] font-medium">{title}</div>
        {subtitle && <div className="truncate text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {end && <div className="shrink-0 text-right text-sm tabular-nums">{end}</div>}
      {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );
}

/** Label + control + hint + validation errors (TanStack Form field errors). */
export function Field({ label, children, hint, errors, className }: { label: string; children: ReactNode; hint?: string; errors?: unknown[]; className?: string }) {
  const messages = (errors ?? [])
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : ""))
    .filter(Boolean);
  return (
    <label className={cn("field grid gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && messages.length === 0 && <span className="text-xs text-muted-foreground">{hint}</span>}
      {messages.length > 0 && <span className="field-error text-xs font-medium text-destructive">{messages.join(" · ")}</span>}
    </label>
  );
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
export async function act(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn();
    if (success) toast.success(success);
    return true;
  } catch (e) {
    toast.error("Action impossible", { description: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
