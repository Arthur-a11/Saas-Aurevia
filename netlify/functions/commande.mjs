// Fonction Netlify : /api/commande. La logique est dans serveur/fonctions.js.
import { traiterCommande } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";

export default async (requete, contexte) =>
  traiterCommande(requete, { env: process.env, stockage: creerStockage("netlify"), ip: contexte.ip });

export const config = { path: "/api/commande" };
