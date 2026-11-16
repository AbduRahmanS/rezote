import { formatDateTime, formatTime } from "@rezote/core";
import { act, askReason, Empty, PageHeader, ShareButton, useCanWrite, useGhosts } from "@rezote/core/react";
import { Alert, AlertDescription } from "@rezote/ui/components/alert";
import { Button } from "@rezote/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ghost, MessageSquareText, Scale } from "lucide-react";
import { receiptText } from "../../../domain/text.ts";
import { app, useRole, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/receipts/$weighingId")({ component: ReceiptScreen });

function ReceiptScreen() {
  const { weighingId } = Route.useParams();
  const view = useView();
  const ghosts = useGhosts(app);
  const writable = useCanWrite(app);
  const role = useRole();
  const w = view.weighingById.get(weighingId);
  if (!w) return <Empty>Reçu introuvable.</Empty>;
  const farmer = view.farmerById.get(w.farmerId);
  const text = receiptText(view, w);
  const pending = [w.eventId, ...w.bundles.map((b) => b.eventId)].some((x) => ghosts.has(x));
  const canCancel = writable && !w.cancelled && (role?.kind === "treasurer" || (role?.kind === "collector" && role.collectorId === w.collectorId));
  return (
    <div>
      <PageHeader
        title={`Reçu ${w.receipt}`}
        description={`Commencé le ${formatDateTime(w.at)}${w.closedAt ? `, terminé à ${formatTime(w.closedAt)}` : ""}`}
        back={{ to: "/farmers/$farmerId", params: { farmerId: w.farmerId }, label: farmer?.name ?? "Producteur" }}
      />

      {pending && (
        <Alert className="mb-3 border-warning/60 bg-warning-soft text-warning-foreground">
          <Ghost aria-hidden />
          <AlertDescription className="text-warning-foreground">
            Ce reçu n'est pas encore arrivé chez le trésorier. Il partira dès qu'il y aura du réseau.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquareText className="size-3.5" aria-hidden />
          Message envoyé au producteur
        </div>
        <p className="receipt whitespace-pre-wrap rounded-md bg-muted px-3 py-2.5 text-sm leading-relaxed">{text}</p>
      </div>

      <div className="mt-3 grid gap-2">
        <ShareButton variant="default" className="h-11" label="Envoyer au producteur" text={text} title={`Reçu ${w.receipt}`} />
        {!w.closedAt && !w.cancelled && writable && (
          <Button asChild variant="outline">
            <Link to="/weighings/$weighingId" params={{ weighingId: w.id }}>
              <Scale aria-hidden />
              Continuer la pesée
            </Link>
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              const reason = await askReason("Annuler toute cette pesée ?", "Toutes les bâches de ce reçu seront retirées des totaux. L'historique est gardé.");
              if (reason) await act(() => app.emit("collecte/item.cancelled", { itemId: w.id, reason }), "Pesée annulée");
            }}
          >
            Annuler toute la pesée
          </Button>
        )}
      </div>
    </div>
  );
}
