import { formatDateTime, formatTime } from "@rezote/core";
import { act, askReason, BackLink, Empty, ShareButton, useCanWrite, useGhosts } from "@rezote/core/react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  const text = receiptText(view, w);
  const pending = [w.eventId, ...w.bundles.map((b) => b.eventId)].some((x) => ghosts.has(x));
  const canCancel =
    writable && !w.cancelled && (role?.kind === "treasurer" || (role?.kind === "collector" && role.collectorId === w.collectorId));
  return (
    <div>
      <BackLink to="/farmers/$farmerId" params={{ farmerId: w.farmerId }} />
      <h1>Reçu {w.receipt}</h1>
      {pending && <p className="ghost-note">👻 Ce reçu n'est pas encore arrivé chez le trésorier. Il partira dès qu'il y aura du réseau.</p>}
      <div className="receipt">{text}</div>
      <div className="btn-row">
        <ShareButton className="btn primary" label="Envoyer au producteur" text={text} title={`Reçu ${w.receipt}`} />
        {!w.closedAt && !w.cancelled && writable && (
          <Link className="btn" to="/weighings/$weighingId" params={{ weighingId: w.id }}>
            Continuer la pesée
          </Link>
        )}
      </div>
      <p className="muted small">
        Pesée commencée le {formatDateTime(w.at)}
        {w.closedAt ? `, terminée à ${formatTime(w.closedAt)}` : ""}.
      </p>
      {canCancel && (
        <button
          type="button"
          className="btn danger block"
          onClick={() => {
            const reason = askReason("Pourquoi annuler toute cette pesée ?");
            if (reason) void act(() => app.emit("collecte/item.cancelled", { itemId: w.id, reason }));
          }}
        >
          Annuler toute la pesée
        </button>
      )}
      <p>
        <Link to="/">Accueil</Link>
      </p>
    </div>
  );
}
