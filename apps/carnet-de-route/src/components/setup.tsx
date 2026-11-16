import { Link, useNavigate } from "@tanstack/react-router";
import { app, setRole, type Role } from "../runtime.ts";

export function Welcome() {
  return (
    <div>
      <div className="hero">
        <div className="big">🚛</div>
        <h1>Carnet de route</h1>
        <p className="muted">Le trajet, les dépenses et les arrêts du camion, même sur les routes sans réseau.</p>
      </div>
      <div className="card">
        <h2>Vous êtes propriétaire du camion ?</h2>
        <p>Créez le carnet du camion, puis envoyez le lien au chauffeur par WhatsApp.</p>
        <Link to="/new" className="btn primary block">
          Créer le carnet d'un camion
        </Link>
      </div>
      <div className="card">
        <h2>Vous êtes chauffeur ?</h2>
        <p>Ouvrez le lien que le propriétaire vous a envoyé.</p>
      </div>
      <p className="muted small center">Tout est chiffré sur le téléphone. La position GPS est désactivée par défaut.</p>
    </div>
  );
}

export function Waiting() {
  return (
    <div className="hero">
      <div className="big">📡</div>
      <h1>En attente des données</h1>
      <p className="muted">Ce téléphone a rejoint le carnet, mais n'a pas encore reçu ses données. Elles arrivent dès qu'il y a du réseau.</p>
      <button type="button" className="btn primary" onClick={() => app.triggerSync()}>
        Réessayer maintenant
      </button>
    </div>
  );
}

export function RolePicker() {
  const navigate = useNavigate();
  const choose = async (r: Role) => {
    await setRole(r);
    await navigate({ to: "/" });
  };
  if (!app.canWrite()) {
    return (
      <div>
        <h1>Lecture seule</h1>
        <p className="muted">Avec le lien de lecture, vous suivez le trajet sans pouvoir le modifier. Les positions GPS ne sont pas visibles.</p>
        <button type="button" className="btn primary block" onClick={() => choose("viewer")}>
          Suivre le trajet
        </button>
      </div>
    );
  }
  return (
    <div>
      <h1>Qui utilise ce téléphone ?</h1>
      <button type="button" className="btn primary block" onClick={() => choose("driver")}>
        🚛 Je suis le chauffeur
      </button>
      <button type="button" className="btn block" onClick={() => choose("owner")}>
        👔 Je suis le propriétaire
      </button>
      <p className="muted small">Ce choix reste sur ce téléphone. Il change seulement l'écran d'accueil.</p>
    </div>
  );
}
