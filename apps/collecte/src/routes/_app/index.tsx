import { formatDate, formatFCFA, formatKg, formatTime, formatTonnes } from "@rezote/core";
import { Empty, GhostMark, List, ListItem, PageHeader, Section, Stat, StatGrid, useGhosts } from "@rezote/core/react";
import { Alert, AlertDescription, AlertTitle } from "@rezote/ui/components/alert";
import { Badge } from "@rezote/ui/components/badge";
import { Button } from "@rezote/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rezote/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, ReceiptText, Scale, TriangleAlert } from "lucide-react";
import { pct, plural } from "../../components/format.ts";
import { app, useRole, useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const role = useRole();
  return role?.kind === "collector" ? <CollectorHome collectorId={role.collectorId} /> : <Dashboard />;
}

function Dashboard() {
  const view = useView();
  const { totals, campaign } = view;
  return (
    <div>
      <PageHeader title={campaign!.name} description={`${campaign!.cooperative} · ${campaign!.product}`} />
      <div className="-mt-2 mb-4 flex flex-wrap gap-1.5">
        {campaign!.grades.map((g) => (
          <Badge key={g.code} variant="outline" className="font-normal tabular-nums">
            {g.label} · {g.pricePerKg} F/kg
          </Badge>
        ))}
      </div>

      {view.flags.length > 0 && (
        <Alert className="mb-4 border-warning/60 bg-warning-soft text-warning-foreground">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            {view.flags.length} alerte{view.flags.length > 1 ? "s" : ""} à vérifier
          </AlertTitle>
          <AlertDescription className="text-warning-foreground/90">
            <Link to="/flags" className="font-medium underline underline-offset-4">
              Voir les alertes
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <StatGrid>
        <Stat label="Pesé au village" value={formatTonnes(totals.weighedG)} hint={plural(totals.bundles, "bâche")} />
        <Stat label="Reste au magasin" value={formatTonnes(totals.inStoreG)} tone={totals.inStoreG < 0 ? "bad" : undefined} />
        <Stat label="Montant brut" value={formatFCFA(totals.gross)} />
        <Stat label="Reste à payer" value={formatFCFA(totals.balance)} tone={totals.balance > 0 ? "warn" : "ok"} hint={`Payé ${formatFCFA(totals.paid)}`} />
        <Stat
          label="Écart à l'usine"
          value={totals.gapPct === null ? "–" : pct(totals.gapPct)}
          hint={totals.gapPct === null ? "Aucun chargement pesé" : formatKg(totals.gapG)}
          tone={totals.gapPct !== null && totals.gapPct < -1 ? "bad" : undefined}
        />
        <Stat label="Producteurs" value={view.farmers.length} hint={`${view.byVillage.length} village${view.byVillage.length > 1 ? "s" : ""}`} />
      </StatGrid>

      <Section title="Par village">
        {view.byVillage.length === 0 ? (
          <Empty>Aucun producteur pour le moment.</Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Village</TableHead>
                  <TableHead className="text-right">Poids</TableHead>
                  <TableHead className="text-right">Reste à payer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.byVillage.map((v) => (
                  <TableRow key={v.village}>
                    <TableCell>
                      <div className="font-medium">{v.village}</div>
                      <div className="text-xs text-muted-foreground">{plural(v.farmers, "producteur")}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatKg(v.totalG)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatFCFA(v.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Par collecteur">
        {view.byCollector.length === 0 ? (
          <Empty>
            Aucun collecteur. <Link to="/collectors" className="font-medium text-foreground underline underline-offset-4">Ajouter</Link>
          </Empty>
        ) : (
          <List>
            {view.byCollector.map((c) => (
              <li key={c.collector.id}>
                <ListItem
                  title={c.collector.name}
                  subtitle={`${c.collector.code} · ${plural(c.weighings, "reçu")} · ${plural(c.bundles, "bâche")}`}
                  end={<span className="font-medium">{formatKg(c.totalG)}</span>}
                />
              </li>
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function CollectorHome({ collectorId }: { collectorId: string }) {
  const view = useView();
  const ghosts = useGhosts(app);
  const me = view.collectorById.get(collectorId);
  const mine = [...view.weighingById.values()].filter((w) => w.collectorId === collectorId).sort((a, b) => b.at - a.at);
  const today = mine.filter((w) => w.at >= startOfDay() && !w.cancelled);
  const open = mine.filter((w) => !w.closedAt && !w.cancelled);
  const pending = mine.filter((w) => [w.eventId, ...w.bundles.map((b) => b.eventId)].some((id) => ghosts.has(id))).length;

  if (!me) return <Empty>Collecteur introuvable. Choisissez votre nom dans Plus → Changer de rôle.</Empty>;
  return (
    <div>
      <PageHeader title={`Bonjour ${me.name.split(" ")[0]}`} description={`Code ${me.code} · ${view.campaign!.name}`} />

      <Button asChild size="lg" className="h-12 w-full text-base">
        <Link to="/farmers" search={{ pick: true }}>
          <Scale aria-hidden />
          Nouvelle pesée
        </Link>
      </Button>

      <StatGrid className="mt-4">
        <Stat label="Pesé aujourd'hui" value={formatKg(today.reduce((s, w) => s + w.totalG, 0))} />
        <Stat label="Reçus aujourd'hui" value={today.length} hint={plural(today.reduce((s, w) => s + w.bundleCount, 0), "bâche")} />
      </StatGrid>
      {pending > 0 && (
        <p className="mt-2 text-sm text-warning-foreground">
          {pending} reçu{pending > 1 ? "s" : ""} pas encore envoyé{pending > 1 ? "s" : ""} au trésorier. Ils partiront dès qu'il y aura du réseau.
        </p>
      )}

      {open.length > 0 && (
        <Section title="Pesées en cours">
          <List>
            {open.map((w) => (
              <li key={w.id}>
                <Link to="/weighings/$weighingId" params={{ weighingId: w.id }} className="block hover:bg-accent">
                  <ListItem
                    icon={Scale}
                    title={view.farmerById.get(w.farmerId)?.name ?? "?"}
                    subtitle={`${w.receipt} · ${plural(w.bundleCount, "bâche")}`}
                    end={<span className="font-medium">{formatKg(w.totalG)}</span>}
                    chevron
                  />
                </Link>
              </li>
            ))}
          </List>
        </Section>
      )}

      <Section title="Mes reçus">
        {mine.length === 0 ? (
          <Empty icon={ReceiptText}>Aucune pesée pour le moment.</Empty>
        ) : (
          <List>
            {mine.slice(0, 30).map((w) => (
              <li key={w.id}>
                <Link to="/receipts/$weighingId" params={{ weighingId: w.id }} className="block hover:bg-accent">
                  <ListItem
                    className={w.cancelled ? "opacity-50 line-through" : ""}
                    title={
                      <>
                        <span className="truncate">{view.farmerById.get(w.farmerId)?.name ?? "?"}</span>
                        <GhostMark app={app} id={[w.eventId, ...w.bundles.map((b) => b.eventId)]} compact />
                      </>
                    }
                    subtitle={`${w.receipt} · ${formatDate(w.at)} ${formatTime(w.at)}`}
                    end={<span className="font-medium">{formatKg(w.totalG)}</span>}
                  />
                </Link>
              </li>
            ))}
          </List>
        )}
      </Section>
      <p className="mt-6 text-center">
        <Link to="/farmers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Tous les producteurs <ChevronRight className="size-4" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
