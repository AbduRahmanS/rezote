import { BackLink } from "@rezote/core/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { setGps, useGps, useRole } from "../../runtime.ts";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const gps = useGps();
  const role = useRole();
  return (
    <div>
      <BackLink />
      <h1>Réglages de ce téléphone</h1>
      <div className="card">
        <h2>Position GPS</h2>
        <p>
          Si vous l'activez, chaque saisie enregistre la position du téléphone (le GPS marche sans réseau). La position est chiffrée et
          visible seulement par les personnes qui ont le lien d'écriture. Elle n'apparaît jamais dans les résumés partagés.
        </p>
        <p className="warn small">Sur les routes dangereuses, réfléchissez avant d'activer : un lien qui circule montre où est le camion.</p>
        <button type="button" className={`btn block ${gps ? "danger" : "primary"}`} onClick={() => void setGps(!gps)}>
          {gps ? "Désactiver le GPS" : "Activer le GPS"}
        </button>
      </div>
      <div className="card">
        <h2>Rôle</h2>
        <p>Actuellement : {role === "driver" ? "chauffeur" : role === "owner" ? "propriétaire" : "lecture"}</p>
        <Link className="btn block" to="/role">
          Changer
        </Link>
      </div>
    </div>
  );
}
