// Fonction Netlify : /api/assistant. La logique est dans serveur/fonctions.js.
import { traiterAssistant } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";

export default async (requete, contexte) =>
  traiterAssistant(requete, { env: process.env, stockage: creerStockage("netlify"), ip: contexte.ip });

export const config = { path: "/api/assistant" };
