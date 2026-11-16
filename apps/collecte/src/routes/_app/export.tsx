import { formatKg } from "@rezote/core";
import { BackLink, downloadFile, Section, toCsv } from "@rezote/core/react";
import { createFileRoute } from "@tanstack/react-router";
import { balancesCsv, bundlesCsv, gradeLabel } from "../../domain/text.ts";
import { useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/export")({ component: Export });

function Export() {
  const view = useView();
  const slug = (view.campaign?.name ?? "campagne").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <BackLink />
      <h1>Export</h1>
      <p className="muted">Fichiers CSV (séparateur point-virgule) pour Excel ou LibreOffice.</p>
      <button type="button" className="btn block" onClick={() => downloadFile(`${slug}-pesees.csv`, toCsv(bundlesCsv(view)))}>
        Toutes les pesées (bâche par bâche)
      </button>
      <button type="button" className="btn block" onClick={() => downloadFile(`${slug}-soldes.csv`, toCsv(balancesCsv(view)))}>
        Soldes des producteurs
      </button>
      <Section title="Qualités">
        <ul>
          {[...view.grades.values()].map((g) => (
            <li key={g.code}>
              {gradeLabel(view, g.code)} : {formatKg(view.totals.weightByGrade[g.code] ?? 0)}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
