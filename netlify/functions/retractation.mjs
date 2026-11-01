// Fonction Netlify : /api/retractation. La logique est dans serveur/fonctions.js.
import { traiterRetractation } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";

export default async (requete, contexte) =>
  traiterRetractation(requete, { env: process.env, stockage: creerStockage("netlify"), ip: contexte.ip });

export const config = { path: "/api/retractation" };
