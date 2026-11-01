// Fonction Netlify : /api/retractation. La logique est dans serveur/fonctions.js.
import { traiterRetractation } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";
import { lireEnv } from "../env.mjs";

export default async (requete, contexte) =>
  traiterRetractation(requete, { env: lireEnv().env, stockage: creerStockage("netlify"), ip: contexte.ip });

export const config = { path: "/api/retractation" };
