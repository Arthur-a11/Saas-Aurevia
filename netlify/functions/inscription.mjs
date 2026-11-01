// Fonction Netlify : /api/inscription. La logique est dans serveur/fonctions.js.
import { traiterInscription } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";
import { lireEnv } from "../env.mjs";

export default async (requete, contexte) =>
  traiterInscription(requete, { env: lireEnv().env, stockage: creerStockage("netlify"), ip: contexte.ip });

export const config = { path: "/api/inscription" };
