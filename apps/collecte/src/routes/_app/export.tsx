import { formatKg } from "@rezote/core";
import { downloadFile, List, ListItem, PageHeader, Section, toCsv } from "@rezote/core/react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet } from "lucide-react";
import { balancesCsv, bundlesCsv, gradeLabel } from "../../domain/text.ts";
import { useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/export")({ component: Export });

function Export() {
  const view = useView();
  const slug = (view.campaign?.name ?? "campagne").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const files = [
    { label: "Toutes les pesées", hint: "Bâche par bâche, avec reçu et collecteur", rows: () => bundlesCsv(view), name: `${slug}-pesees.csv` },
    { label: "Soldes des producteurs", hint: "Poids par qualité, brut, retenues, payé, solde", rows: () => balancesCsv(view), name: `${slug}-soldes.csv` },
  ];
  return (
    <div>
      <PageHeader title="Export" back={{ to: "/more" }} description="Fichiers CSV (séparateur point-virgule) pour Excel ou LibreOffice." />
      <List>
        {files.map((f) => (
          <li key={f.name}>
            <button type="button" className="w-full text-left hover:bg-accent" onClick={() => downloadFile(f.name, toCsv(f.rows()))}>
              <ListItem icon={FileSpreadsheet} title={f.label} subtitle={f.hint} end={<Download className="size-4 text-muted-foreground" />} />
            </button>
          </li>
        ))}
      </List>
      <Section title="Poids par qualité">
        <List>
          {[...view.grades.values()].map((g) => (
            <li key={g.code}>
              <ListItem title={gradeLabel(view, g.code)} end={<span className="font-medium">{formatKg(view.totals.weightByGrade[g.code] ?? 0)}</span>} />
            </li>
          ))}
        </List>
      </Section>
    </div>
  );
}
