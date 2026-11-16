// Layout for every screen that needs a campaign: shows the welcome screen, the
// waiting screen, or the role picker until the phone is ready, then the page.
import { useRuntime } from "@rezote/core/react";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { RolePicker, Waiting, Welcome } from "../components/setup.tsx";
import { app, roleStore, useView } from "../runtime.ts";

export const Route = createFileRoute("/_app")({ component: Gate });

function Gate() {
  const currentId = useRuntime(app, (s) => s.currentId);
  if (!currentId) return <Welcome />;
  return <CampaignGate />;
}

function CampaignGate() {
  const view = useView();
  const { role, loaded, space } = useSelector(roleStore, (s) => s);
  const currentId = useRuntime(app, (s) => s.currentId);
  const pathname = useLocation({ select: (l) => l.pathname });
  if (!view?.campaign) return <Waiting />;
  if (!loaded || space !== currentId) return null;
  if (!role && pathname !== "/role") return <RolePicker />;
  return <Outlet />;
}
