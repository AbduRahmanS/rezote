// Allocates the next receipt number on this phone, then opens the weighing screen.
import { Empty, PageHeader } from "@rezote/core/react";
import { Button } from "@rezote/ui/components/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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
        <PageHeader title="Seul un collecteur peut peser" back={{ to: "/" }} description="Choisissez votre nom de collecteur sur ce téléphone." />
        <Button asChild>
          <Link to="/role">Choisir mon rôle</Link>
        </Button>
      </div>
    );
  if (collector.duplicateCode)
    return <Empty>Votre code {collector.code} est en double. Demandez au trésorier de vous en donner un autre.</Empty>;
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      {error || (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden /> Ouverture de la pesée…
        </>
      )}
    </div>
  );
}
