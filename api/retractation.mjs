// Fonction Vercel : /api/retractation. La logique est dans serveur/fonctions.js.
import { traiterRetractation } from "../serveur/fonctions.js";
import { executer } from "../serveur/vercel.js";

export default executer(traiterRetractation);
