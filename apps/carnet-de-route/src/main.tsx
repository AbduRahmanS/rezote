import "@rezote/core/styles.css";
import "./theme.css";
import { effect } from "@preact/signals";
import { render } from "preact";
import { App } from "./ui.tsx";
import { app, loadSettings } from "./runtime.ts";

const root = document.getElementById("app")!;

app
  .init()
  .then(() => {
    effect(() => void loadSettings(app.currentId.value));
    effect(() => {
      const t = app.view.value?.truck;
      const id = app.currentId.value;
      if (t && id) void app.setLabel(id, `${t.plate} · ${t.name}`);
    });
    render(<App />, root);
  })
  .catch((e: unknown) => {
    root.innerHTML = `<div class="main"><h1>Carnet de route ne peut pas démarrer</h1><p>Ce navigateur ne permet pas d'enregistrer des données (navigation privée ?). Ouvrez la page dans Chrome ou Firefox en mode normal.</p><p class="muted small" id="err"></p></div>`;
    root.querySelector("#err")!.textContent = String(e);
  });
