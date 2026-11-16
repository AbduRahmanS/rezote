import { formatFCFA, formatKg } from "@rezote/core";
import { BackLink, Empty, GhostMark, useCanWrite, useGhostClass } from "@rezote/core/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import type { Farmer } from "../../../domain/project.ts";
import { app, useView } from "../../../runtime.ts";

const search = z.object({
  /** Choosing a farmer to weigh, instead of browsing. */
  pick: z.boolean().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_app/farmers/")({ validateSearch: search, component: FarmerList });

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function FarmerRow({ f, pick }: { f: Farmer; pick: boolean }) {
  const ghost = useGhostClass(app, f.eventId);
  const body = (
    <>
      <span className="row-main">
        <span className="row-title">
          {f.name}
          <GhostMark app={app} id={f.eventId} />
        </span>
        <span className="row-sub">
          {f.village} · {formatKg(f.totalG)}
        </span>
      </span>
      {!pick && <span className={`row-end ${f.balance < 0 ? "bad" : ""}`}>{formatFCFA(f.balance)}</span>}
    </>
  );
  return pick ? (
    <Link className={`row ${ghost}`} to="/weigh/$farmerId" params={{ farmerId: f.id }}>
      {body}
    </Link>
  ) : (
    <Link className={`row ${ghost}`} to="/farmers/$farmerId" params={{ farmerId: f.id }}>
      {body}
    </Link>
  );
}

function FarmerList() {
  const view = useView();
  const { pick = false, q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const canAdd = useCanWrite(app);
  const needle = normalize(q.trim());
  const list = needle ? view.farmers.filter((f) => normalize(`${f.name} ${f.village}`).includes(needle)) : view.farmers;
  return (
    <div>
      <BackLink />
      <h1>{pick ? "Peser pour quel producteur ?" : "Producteurs"}</h1>
      <input
        type="search"
        placeholder="Rechercher un nom ou un village"
        value={q}
        onChange={(e) => void navigate({ search: (prev) => ({ ...prev, q: e.target.value || undefined }), replace: true })}
      />
      {canAdd && (
        <Link className="btn block" to="/farmers/new" search={{ pick: pick || undefined }}>
          + Nouveau producteur
        </Link>
      )}
      <ul className="list" style={{ marginTop: ".8rem" }}>
        {list.map((f) => (
          <li key={f.id}>
            <FarmerRow f={f} pick={pick} />
          </li>
        ))}
      </ul>
      {list.length === 0 && <Empty>{q ? "Aucun producteur trouvé." : "Aucun producteur enregistré."}</Empty>}
    </div>
  );
}
