// Fonction Vercel : comptes, paiement (Stripe) et espace « Ma formation ». Routes réécrites par vercel.json.
import { traiterEspace } from "../serveur/espace.js";
import { executer } from "../serveur/vercel.js";

export default executer(traiterEspace);
