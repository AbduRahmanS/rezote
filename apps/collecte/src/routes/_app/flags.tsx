import { BackLink, Empty } from "@rezote/core/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { Flag } from "../../domain/project.ts";
import { useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/flags")({ component: Flags });

function FlagLink({ f }: { f: Flag }) {
  const cls = `row flag ${f.kind === "receipt-collision" || f.kind === "negative-balance" ? "bad" : ""}`;
  const body = (
    <>
      <span>{f.message}</span>
      <span className="muted">›</span>
    </>
  );
  if (f.weighingId)
    return (
      <Link className={cls} to="/receipts/$weighingId" params={{ weighingId: f.weighingId }}>
        {body}
      </Link>
    );
  if (f.farmerId)
    return (
      <Link className={cls} to="/farmers/$farmerId" params={{ farmerId: f.farmerId }}>
        {body}
      </Link>
    );
  return <div className={cls}>{body}</div>;
}

function Flags() {
  const view = useView();
  return (
    <div>
      <BackLink />
      <h1>Alertes</h1>
      {view.flags.length === 0 && <Empty>Aucune alerte. ✓</Empty>}
      <ul className="list">
        {view.flags.map((f, i) => (
          <li key={i}>
            <FlagLink f={f} />
          </li>
        ))}
      </ul>
    </div>
  );
}
