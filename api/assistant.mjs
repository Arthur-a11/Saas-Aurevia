// Fonction Vercel : /api/assistant. La logique est dans serveur/fonctions.js.
import { traiterAssistant } from "../serveur/fonctions.js";
import { executer } from "../serveur/vercel.js";

export default executer(traiterAssistant);
