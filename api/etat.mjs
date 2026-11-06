// Fonction Vercel : /api/etat. Indique seulement OUI/NON si chaque réglage est présent (jamais de valeur).
import { traiterEtat } from "../serveur/fonctions.js";
import { creerStockage } from "../serveur/stockage.js";

export default {
  async fetch(requete) {
    const env = process.env;
    return traiterEtat(requete, {
      env, stockage: creerStockage("redis", { env }),
      sources: { processEnv: Boolean(env.SEL_EMPREINTE), netlifyEnv: false },
      deploiement: { id: env.VERCEL_DEPLOYMENT_ID ?? null, contexte: env.VERCEL_ENV ?? null },
    });
  },
};
