import { navigate } from "@rezote/core";
import { Field } from "@rezote/core/ui";
import { useState } from "preact/hooks";
import { app, gpsEnabled, role, setGps, setRole } from "../runtime.ts";
import { act, BackLink } from "./common.tsx";

export function Welcome() {
  return (
    <div>
      <div class="hero">
        <div class="big">🚛</div>
        <h1>Carnet de route</h1>
        <p class="muted">Le trajet, les dépenses et les arrêts du camion, même sur les routes sans réseau.</p>
      </div>
      <div class="card">
        <h2>Vous êtes propriétaire du camion ?</h2>
        <p>Créez le carnet du camion, puis envoyez le lien au chauffeur par WhatsApp.</p>
        <button type="button" class="btn primary block" onClick={() => navigate("new")}>
          Créer le carnet d'un camion
        </button>
      </div>
      <div class="card">
        <h2>Vous êtes chauffeur ?</h2>
        <p>Ouvrez le lien que le propriétaire vous a envoyé.</p>
      </div>
      <p class="muted small center">Tout est chiffré sur le téléphone. La position GPS est désactivée par défaut.</p>
    </div>
  );
}

export function CreateTruck() {
  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const submit = async (e: Event) => {
    e.preventDefault();
    const ok = await act(async () => {
      const space = await app.createSpace(plate);
      await app.emit("route/truck.registered", { plate, name }, space);
      await setRole("owner");
    });
    if (ok) navigate();
  };
  return (
    <form onSubmit={submit}>
      <h1>Nouveau camion</h1>
      <Field label="Immatriculation">
        <input required maxLength={20} value={plate} onInput={(e) => setPlate(e.currentTarget.value.toUpperCase())} placeholder="AB-1234-MD" />
      </Field>
      <Field label="Nom ou modèle">
        <input required maxLength={60} value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Renault Kerax rouge" />
      </Field>
      <button type="submit" class="btn primary block">
        Créer le carnet
      </button>
      <p class="muted small">Ensuite, menu ☰ → Partager → « Envoyer le lien d'écriture » au chauffeur.</p>
    </form>
  );
}

export function Waiting() {
  return (
    <div class="hero">
      <div class="big">📡</div>
      <h1>En attente des données</h1>
      <p class="muted">Ce téléphone a rejoint le carnet, mais n'a pas encore reçu ses données. Elles arrivent dès qu'il y a du réseau.</p>
      <button type="button" class="btn primary" onClick={() => app.triggerSync()}>
        Réessayer maintenant
      </button>
    </div>
  );
}

export function RolePicker() {
  const choose = async (r: "owner" | "driver" | "viewer") => {
    await setRole(r);
    navigate();
  };
  if (!app.canWrite()) {
    return (
      <div>
        <h1>Lecture seule</h1>
        <p class="muted">Avec le lien de lecture, vous suivez le trajet sans pouvoir le modifier. Les positions GPS ne sont pas visibles.</p>
        <button type="button" class="btn primary block" onClick={() => choose("viewer")}>
          Suivre le trajet
        </button>
      </div>
    );
  }
  return (
    <div>
      <h1>Qui utilise ce téléphone ?</h1>
      <button type="button" class="btn primary block" onClick={() => choose("driver")}>
        🚛 Je suis le chauffeur
      </button>
      <button type="button" class="btn block" onClick={() => choose("owner")}>
        👔 Je suis le propriétaire
      </button>
      <p class="muted small">Ce choix reste sur ce téléphone. Il change seulement l'écran d'accueil.</p>
    </div>
  );
}

export function Settings() {
  return (
    <div>
      <BackLink />
      <h1>Réglages de ce téléphone</h1>
      <div class="card">
        <h2>Position GPS</h2>
        <p>
          Si vous l'activez, chaque saisie enregistre la position du téléphone (le GPS marche sans réseau). La position est chiffrée et
          visible seulement par les personnes qui ont le lien d'écriture. Elle n'apparaît jamais dans les résumés partagés.
        </p>
        <p class="warn small">Sur les routes dangereuses, réfléchissez avant d'activer : un lien qui circule montre où est le camion.</p>
        <button type="button" class={`btn block ${gpsEnabled.value ? "danger" : "primary"}`} onClick={() => setGps(!gpsEnabled.value)}>
          {gpsEnabled.value ? "Désactiver le GPS" : "Activer le GPS"}
        </button>
      </div>
      <div class="card">
        <h2>Rôle</h2>
        <p>Actuellement : {role.value === "driver" ? "chauffeur" : role.value === "owner" ? "propriétaire" : "lecture"}</p>
        <a class="btn block" href="#/role">
          Changer
        </a>
      </div>
    </div>
  );
}
