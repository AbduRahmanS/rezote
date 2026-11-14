import "@rezote/core/styles.css";
import { effect } from "@preact/signals";
import { render } from "preact";
import { App } from "./ui.tsx";
import { app, loadRole } from "./runtime.ts";

const root = document.getElementById("app")!;

app
  .init()
  .then(() => {
    // Keep the role and the space label in step with the selected campaign.
    effect(() => void loadRole(app.currentId.value));
    effect(() => {
      const c = app.view.value?.campaign;
      const id = app.currentId.value;
      if (c && id) void app.setLabel(id, `${c.cooperative} · ${c.name}`);
    });
    render(<App />, root);
  })
  .catch((e: unknown) => {
    root.innerHTML = `<div class="main"><h1>Collecte ne peut pas démarrer</h1><p>Ce navigateur ne permet pas d'enregistrer des données (navigation privée ?). Ouvrez la page dans Chrome ou Firefox en mode normal.</p><p class="muted small" id="err"></p></div>`;
    root.querySelector("#err")!.textContent = String(e);
  });
