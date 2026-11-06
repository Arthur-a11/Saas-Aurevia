// Fonction Vercel : /api/inscription. La logique est dans serveur/fonctions.js.
import { traiterInscription } from "../serveur/fonctions.js";
import { executer } from "../serveur/vercel.js";

export default executer(traiterInscription);
