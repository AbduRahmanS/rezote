import { navigate } from "@rezote/core";
import { Field } from "@rezote/core/ui";
import { useState } from "preact/hooks";
import { DEFAULT_GRADES } from "../domain/app.ts";
import { app, setRole } from "../runtime.ts";
import { act, useView } from "./common.tsx";

export function Welcome() {
  return (
    <div>
      <div class="hero">
        <div class="big">⚖️</div>
        <h1>Collecte</h1>
        <p class="muted">La pesée du coton au village, même sans réseau.</p>
      </div>
      <div class="card">
        <h2>Vous êtes trésorier de la coopérative ?</h2>
        <p>Créez la campagne, puis envoyez le lien aux collecteurs par WhatsApp.</p>
        <button type="button" class="btn primary block" onClick={() => navigate("new")}>
          Créer une campagne
        </button>
      </div>
      <div class="card">
        <h2>Vous êtes collecteur ?</h2>
        <p>Ouvrez le lien que le trésorier vous a envoyé. Il ajoute la campagne à ce téléphone.</p>
      </div>
      <p class="muted small center">
        Tout est enregistré sur le téléphone d'abord. Les pesées sont envoyées au trésorier dès qu'il y a du réseau. 👻 = pas encore envoyé.
      </p>
    </div>
  );
}

export function CreateCampaign() {
  const [cooperative, setCooperative] = useState("");
  const [name, setName] = useState("Campagne coton 2026-2027");
  const [product, setProduct] = useState("Coton graine");
  const [grades, setGrades] = useState(DEFAULT_GRADES.map((g) => ({ ...g, price: String(g.pricePerKg) })));
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    const parsed = grades
      .filter((g) => g.label.trim())
      .map((g) => ({ code: g.code, label: g.label.trim(), pricePerKg: Number(g.price) }));
    if (parsed.some((g) => !Number.isInteger(g.pricePerKg) || g.pricePerKg <= 0)) {
      window.alert("Chaque prix doit être un nombre entier de FCFA par kg.");
      return;
    }
    setBusy(true);
    const ok = await act(async () => {
      const space = await app.createSpace(`${cooperative} · ${name}`);
      await app.emit("collecte/campaign.created", { cooperative, name, product, grades: parsed }, space);
      await setRole({ kind: "treasurer" });
    });
    setBusy(false);
    if (ok) navigate("collectors");
  };

  return (
    <form onSubmit={submit}>
      <h1>Nouvelle campagne</h1>
      <Field label="Coopérative">
        <input required maxLength={80} value={cooperative} onInput={(e) => setCooperative(e.currentTarget.value)} placeholder="Coopérative de Kignan" />
      </Field>
      <Field label="Campagne">
        <input required maxLength={80} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </Field>
      <Field label="Produit">
        <input required maxLength={40} value={product} onInput={(e) => setProduct(e.currentTarget.value)} list="products" />
        <datalist id="products">
          <option value="Coton graine" />
          <option value="Amandes de karité" />
          <option value="Sésame" />
          <option value="Arachide" />
        </datalist>
      </Field>
      <h2>Qualités et prix d'achat</h2>
      {grades.map((g, i) => (
        <div class="inline" key={g.code}>
          <Field label={`Qualité ${i + 1}`}>
            <input
              maxLength={30}
              value={g.label}
              placeholder="(aucune)"
              onInput={(e) => setGrades(grades.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)))}
            />
          </Field>
          <Field label="FCFA / kg">
            <input
              inputMode="numeric"
              value={g.price}
              onInput={(e) => setGrades(grades.map((x, j) => (j === i ? { ...x, price: e.currentTarget.value.replace(/\D/g, "") } : x)))}
            />
          </Field>
        </div>
      ))}
      {grades.length < 5 && (
        <button
          type="button"
          class="btn small"
          onClick={() => setGrades([...grades, { code: String(grades.length + 1), label: "", pricePerKg: 0, price: "" }])}
        >
          + Ajouter une qualité
        </button>
      )}
      <p class="muted small">
        Prix 2025-2026 au Mali : 300 FCFA/kg pour le coton graine 1er choix. Vérifiez le prix de la campagne avant de commencer : il ne
        peut pas être modifié ensuite.
      </p>
      <button type="submit" class="btn primary block" disabled={busy}>
        Créer la campagne
      </button>
    </form>
  );
}

export function Waiting() {
  const s = app.status.value;
  return (
    <div class="hero">
      <div class="big">📡</div>
      <h1>En attente des données</h1>
      <p class="muted">
        Ce téléphone a rejoint la campagne, mais n'a pas encore reçu ses données. Elles arrivent dès qu'il y a du réseau.
      </p>
      {!s.online && <p class="warn">Pas de réseau pour le moment.</p>}
      <button type="button" class="btn primary" onClick={() => app.triggerSync()}>
        Réessayer maintenant
      </button>
    </div>
  );
}

export function RolePicker() {
  const view = useView();
  const usable = view.collectors.filter((c) => !c.duplicateCode);
  const choose = async (r: Parameters<typeof setRole>[0]) => {
    await setRole(r);
    navigate();
  };
  if (!app.canWrite()) {
    return (
      <div>
        <h1>Lecture seule</h1>
        <p class="muted">Ce téléphone a reçu le lien de lecture : il peut consulter la campagne, pas peser.</p>
        <button type="button" class="btn primary block" onClick={() => choose({ kind: "viewer" })}>
          Consulter la campagne
        </button>
      </div>
    );
  }
  return (
    <div>
      <h1>Qui utilise ce téléphone ?</h1>
      <p class="muted">Ce choix reste sur ce téléphone. Vous pourrez le changer depuis l'accueil.</p>
      <h2>Collecteurs</h2>
      {usable.length === 0 && <p class="muted">Le trésorier n'a pas encore ajouté de collecteur.</p>}
      <ul class="list">
        {usable.map((c) => (
          <li key={c.id}>
            <button type="button" class="row" onClick={() => choose({ kind: "collector", collectorId: c.id })}>
              <span class="row-title">{c.name}</span>
              <span class="muted">{c.code}</span>
            </button>
          </li>
        ))}
      </ul>
      <h2>Coopérative</h2>
      <button type="button" class="btn block" onClick={() => choose({ kind: "treasurer" })}>
        Je suis le trésorier
      </button>
    </div>
  );
}
