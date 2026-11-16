// Allocates the next receipt number on this phone, then opens the weighing screen.
import { BackLink, Empty } from "@rezote/core/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { app, newId, useRole, useView } from "../../../runtime.ts";

export const Route = createFileRoute("/_app/weigh/$farmerId")({ component: StartWeighing });

function StartWeighing() {
  const { farmerId } = Route.useParams();
  const view = useView();
  const role = useRole();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState("");
  const collector = role?.kind === "collector" ? view.collectorById.get(role.collectorId) : undefined;
  const farmer = view.farmerById.get(farmerId);

  useEffect(() => {
    if (started.current || !collector || collector.duplicateCode || !farmer) return;
    started.current = true;
    (async () => {
      const n = await app.nextCounter(`receipt:${app.state.currentId}:${collector.id}`);
      const weighingId = newId();
      await app.emit("collecte/weighing.started", {
        weighingId,
        receipt: `${collector.code}-${String(n).padStart(4, "0")}`,
        farmerId,
        collectorId: collector.id,
        at: Date.now(),
      });
      await navigate({ to: "/weighings/$weighingId", params: { weighingId }, replace: true });
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [collector, farmer, farmerId, navigate]);

  if (!farmer) return <Empty>Producteur introuvable.</Empty>;
  if (!collector)
    return (
      <div>
        <BackLink />
        <p>Seul un collecteur peut peser. Choisissez votre nom dans « Rôle ».</p>
        <Link className="btn" to="/role">
          Choisir mon rôle
        </Link>
      </div>
    );
  if (collector.duplicateCode) return <p className="bad">Votre code {collector.code} est en double. Demandez au trésorier de vous en donner un autre.</p>;
  return <p className="muted">{error || "Ouverture de la pesée…"}</p>;
}
