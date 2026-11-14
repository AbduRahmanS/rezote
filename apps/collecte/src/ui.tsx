import { navigate, route } from "@rezote/core";
import { AppShell } from "@rezote/core/ui";
import { app, role } from "./runtime.ts";
import { CollectorHome } from "./screens/collector.tsx";
import { AddFarmer, FarmerDetail, FarmerList } from "./screens/farmers.tsx";
import { CreateCampaign, RolePicker, Waiting, Welcome } from "./screens/setup.tsx";
import { Collectors, Dashboard, Export, Flags, Loads } from "./screens/treasurer.tsx";
import { ReceiptScreen, StartWeighing, WeighingScreen } from "./screens/weighing.tsx";

function Screen() {
  const [page, id] = route.value;
  const view = app.view.value;
  const r = role.value;

  if (page === "new" || !app.currentId.value) return page === "new" ? <CreateCampaign /> : <Welcome />;
  if (!view?.campaign) return <Waiting />;
  if (page === "role" || !r) return <RolePicker />;

  switch (page) {
    case "pick":
      return <FarmerList pick />;
    case "farmers":
      if (id === "new") return <AddFarmer />;
      return id ? <FarmerDetail id={id} /> : <FarmerList />;
    case "weigh":
      return <StartWeighing farmerId={id!} />;
    case "weighing":
      return <WeighingScreen id={id!} />;
    case "receipt":
      return <ReceiptScreen id={id!} />;
    case "collectors":
      return <Collectors />;
    case "loads":
      return <Loads />;
    case "flags":
      return <Flags />;
    case "export":
      return <Export />;
    default:
      return r.kind === "collector" ? <CollectorHome collectorId={r.collectorId} /> : <Dashboard />;
  }
}

export function App() {
  if (!app.ready.value) return null;
  return (
    <AppShell app={app} appName="Collecte" onNew={() => navigate("new")}>
      <Screen />
    </AppShell>
  );
}
