// Fonction Netlify : /api/etat. Indique seulement OUI/NON si chaque réglage est présent (jamais de valeur).
import { traiterEtat } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";
import { lireEnv } from "../env.mjs";

export default async (requete, contexte) => {
  const { env, sources } = lireEnv();
  return traiterEtat(requete, {
    env, stockage: creerStockage("netlify"), sources,
    deploiement: { id: contexte?.deploy?.id ?? null, contexte: contexte?.deploy?.context ?? null },
  });
};

export const config = { path: "/api/etat" };
