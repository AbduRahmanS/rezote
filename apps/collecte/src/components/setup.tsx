import { useStatus } from "@rezote/core/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { app, setRole, useView, type Role } from "../runtime.ts";

export function Welcome() {
  return (
    <div>
      <div className="hero">
        <div className="big">⚖️</div>
        <h1>Collecte</h1>
        <p className="muted">La pesée du coton au village, même sans réseau.</p>
      </div>
      <div className="card">
        <h2>Vous êtes trésorier de la coopérative ?</h2>
        <p>Créez la campagne, puis envoyez le lien aux collecteurs par WhatsApp.</p>
        <Link to="/new" className="btn primary block">
          Créer une campagne
        </Link>
      </div>
      <div className="card">
        <h2>Vous êtes collecteur ?</h2>
        <p>Ouvrez le lien que le trésorier vous a envoyé. Il ajoute la campagne à ce téléphone.</p>
      </div>
      <p className="muted small center">
        Tout est enregistré sur le téléphone d'abord. Les pesées sont envoyées au trésorier dès qu'il y a du réseau. 👻 = pas encore envoyé.
      </p>
    </div>
  );
}

export function Waiting() {
  const s = useStatus(app);
  return (
    <div className="hero">
      <div className="big">📡</div>
      <h1>En attente des données</h1>
      <p className="muted">Ce téléphone a rejoint la campagne, mais n'a pas encore reçu ses données. Elles arrivent dès qu'il y a du réseau.</p>
      {!s.online && <p className="warn">Pas de réseau pour le moment.</p>}
      <button type="button" className="btn primary" onClick={() => app.triggerSync()}>
        Réessayer maintenant
      </button>
    </div>
  );
}

export function RolePicker() {
  const view = useView();
  const navigate = useNavigate();
  const usable = view.collectors.filter((c) => !c.duplicateCode);
  const choose = async (r: Role) => {
    await setRole(r);
    await navigate({ to: "/" });
  };
  if (!app.canWrite()) {
    return (
      <div>
        <h1>Lecture seule</h1>
        <p className="muted">Ce téléphone a reçu le lien de lecture : il peut consulter la campagne, pas peser.</p>
        <button type="button" className="btn primary block" onClick={() => choose({ kind: "viewer" })}>
          Consulter la campagne
        </button>
      </div>
    );
  }
  return (
    <div>
      <h1>Qui utilise ce téléphone ?</h1>
      <p className="muted">Ce choix reste sur ce téléphone. Vous pourrez le changer depuis l'accueil.</p>
      <h2>Collecteurs</h2>
      {usable.length === 0 && <p className="muted">Le trésorier n'a pas encore ajouté de collecteur.</p>}
      <ul className="list">
        {usable.map((c) => (
          <li key={c.id}>
            <button type="button" className="row" onClick={() => choose({ kind: "collector", collectorId: c.id })}>
              <span className="row-title">{c.name}</span>
              <span className="muted">{c.code}</span>
            </button>
          </li>
        ))}
      </ul>
      <h2>Coopérative</h2>
      <button type="button" className="btn block" onClick={() => choose({ kind: "treasurer" })}>
        Je suis le trésorier
      </button>
    </div>
  );
}
