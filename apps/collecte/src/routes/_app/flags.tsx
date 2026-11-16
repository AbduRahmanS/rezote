import { Empty, List, ListItem, PageHeader } from "@rezote/core/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, CopyX, ReceiptText, TriangleAlert, Wallet } from "lucide-react";
import type { Flag } from "../../domain/project.ts";
import { useView } from "../../runtime.ts";

export const Route = createFileRoute("/_app/flags")({ component: Flags });

const icon = (k: Flag["kind"]) => (k === "receipt-collision" ? ReceiptText : k === "double-entry" ? CopyX : k === "negative-balance" ? Wallet : TriangleAlert);

function FlagRow({ f }: { f: Flag }) {
  const item = <ListItem icon={icon(f.kind)} title={<span className="whitespace-normal">{f.message}</span>} chevron={!!(f.weighingId || f.farmerId)} className="flag" />;
  if (f.weighingId)
    return (
      <Link className="block hover:bg-accent" to="/receipts/$weighingId" params={{ weighingId: f.weighingId }}>
        {item}
      </Link>
    );
  if (f.farmerId)
    return (
      <Link className="block hover:bg-accent" to="/farmers/$farmerId" params={{ farmerId: f.farmerId }}>
        {item}
      </Link>
    );
  return item;
}

function Flags() {
  const view = useView();
  return (
    <div>
      <PageHeader title="Alertes" back={{ to: "/" }} description="Ce que le trésorier doit vérifier avant de payer." />
      {view.flags.length === 0 ? (
        <Empty icon={CircleCheck}>Aucune alerte.</Empty>
      ) : (
        <List>
          {view.flags.map((f, i) => (
            <li key={i}>
              <FlagRow f={f} />
            </li>
          ))}
        </List>
      )}
    </div>
  );
}
