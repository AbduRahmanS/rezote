// Promise-based dialogs, so app code can write `if (await confirmAction(...))`
// instead of the browser's blocking confirm() and prompt().

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@rezote/ui/components/alert-dialog";
import { Button } from "@rezote/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rezote/ui/components/dialog";
import { Textarea } from "@rezote/ui/components/textarea";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useState } from "react";

type Request =
  | { kind: "confirm"; title: string; description?: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void }
  | { kind: "reason"; title: string; description?: string; resolve: (reason: string | null) => void };

const dialogStore = new Store<Request | null>(null);

function open(request: Request) {
  // A new dialog replaces any open one; the previous caller gets "cancel".
  const prev = dialogStore.get();
  if (prev?.kind === "confirm") prev.resolve(false);
  if (prev?.kind === "reason") prev.resolve(null);
  dialogStore.setState(() => request);
}

function close() {
  dialogStore.setState(() => null);
}

export function confirmAction(options: { title: string; description?: string; confirmLabel?: string; destructive?: boolean }): Promise<boolean> {
  return new Promise((resolve) =>
    open({ kind: "confirm", title: options.title, description: options.description, confirmLabel: options.confirmLabel ?? "Confirmer", destructive: options.destructive ?? false, resolve }),
  );
}

/** Asks for a cancellation reason (required). Resolves to null if the user gave up. */
export function askReason(title = "Pourquoi annuler ?", description = "La raison reste dans l'historique. Rien n'est effacé."): Promise<string | null> {
  return new Promise((resolve) => open({ kind: "reason", title, description, resolve }));
}

function ReasonDialog({ request }: { request: Extract<Request, { kind: "reason" }> }) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const finish = (value: string | null) => {
    request.resolve(value);
    close();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && finish(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) finish(trimmed.slice(0, 200));
          }}
        >
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
            {request.description && <DialogDescription>{request.description}</DialogDescription>}
          </DialogHeader>
          <Textarea
            autoFocus
            name="reason"
            aria-label="Raison"
            placeholder="Par exemple : erreur de saisie, bâche pesée deux fois"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Garder
            </Button>
            <Button type="submit" variant="destructive" disabled={!trimmed}>
              Annuler l'élément
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Renders the current dialog. Mounted once by AppShell. */
export function DialogHost() {
  const request = useSelector(dialogStore);
  if (!request) return null;
  if (request.kind === "reason") return <ReasonDialog key={request.title} request={request} />;
  const finish = (ok: boolean) => {
    request.resolve(ok);
    close();
  };
  return (
    <AlertDialog open onOpenChange={(o) => !o && finish(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          {request.description && <AlertDialogDescription>{request.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>Retour</AlertDialogCancel>
          <AlertDialogAction
            className={request.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={() => finish(true)}
          >
            {request.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
