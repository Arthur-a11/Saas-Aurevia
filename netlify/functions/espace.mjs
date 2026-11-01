// Fonction Netlify : comptes, paiement (Stripe) et espace « Ma formation ». La logique est dans serveur/espace.js.
import { traiterEspace } from "../../serveur/espace.js";
import { creerStockage } from "../../serveur/stockage.js";
import { lireEnv } from "../env.mjs";

export default async (requete, contexte) =>
  traiterEspace(requete, { env: lireEnv().env, stockage: creerStockage("netlify"), ip: contexte.ip });

export const config = { path: ["/api/compte/*", "/api/paiement/*", "/api/formation", "/api/formation/*"] };
