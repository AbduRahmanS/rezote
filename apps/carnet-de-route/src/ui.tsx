import { navigate, route } from "@rezote/core";
import { AppShell } from "@rezote/core/ui";
import { app, role } from "./runtime.ts";
import { DriverHome, EndTrip, EntryForm } from "./screens/driver.tsx";
import { AdvanceForm, OwnerHome, StartTrip, TripDetail } from "./screens/owner.tsx";
import { CreateTruck, RolePicker, Settings, Waiting, Welcome } from "./screens/setup.tsx";
import type { Kind } from "./domain/events.ts";

function Screen() {
  const [page, a, b] = route.value;
  const view = app.view.value;
  const r = role.value;

  if (page === "new" || !app.currentId.value) return page === "new" ? <CreateTruck /> : <Welcome />;
  if (!view?.truck) return <Waiting />;
  if (page === "role" || !r) return <RolePicker />;

  switch (page) {
    case "start":
      return <StartTrip />;
    case "trip":
      return a ? <TripDetail id={a} /> : <OwnerHome />;
    case "entry":
      return <EntryForm tripId={a!} kind={b as Kind} />;
    case "advance":
      return <AdvanceForm tripId={a!} />;
    case "end":
      return <EndTrip tripId={a!} />;
    case "settings":
      return <Settings />;
    default:
      return r === "driver" ? <DriverHome /> : <OwnerHome />;
  }
}

export function App() {
  if (!app.ready.value) return null;
  return (
    <AppShell app={app} appName="Carnet de route" onNew={() => navigate("new")}>
      <Screen />
    </AppShell>
  );
}
