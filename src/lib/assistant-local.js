// Réponses de secours de l'assistant, calculées dans le navigateur, sans IA.
// Utilisées quand l'assistant IA n'est pas connecté, est saturé ou a atteint sa limite.
// Toutes les réponses viennent des fichiers de données du site : rien n'est inventé.
import site from "../data/site.json" with { type: "json" };
import programme from "../data/programme.json" with { type: "json" };
import faq from "../data/faq.json" with { type: "json" };
import marchesData from "../data/marches.json" with { type: "json" };
import conditions from "../data/conditions.json" with { type: "json" };
const ABONNEMENT = conditions.frequencePaiement.valeur === "abonnement-mensuel";
const PAR_MOIS = ABONNEMENT ? " par mois" : "";

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");

function mentionTaxes() {
  if (site.regimeTva === "franchise") return " (TVA non applicable, art. 293 B du CGI)";
  if (site.regimeTva === "ttc") return " TTC";
  return "";
}

function formuleCitee(q) {
  const f = site.formules.find((x) => q.includes(norm(x.nom)) || q.includes(x.id.slice(0, 8)));
  return f ? `La formule ${f.nom} coûte ${f.prixAffiche}${PAR_MOIS}${mentionTaxes()}. ` : "";
}

const listePrix = () =>
  site.formules.map((f) => `${f.nom} : ${f.prixAffiche}${PAR_MOIS}`).join(", ");

export const REPONSES = {
  prix: (q = "") => ({
    texte:
      formuleCitee(q) +
      (ABONNEMENT ? `Trois formules en abonnement mensuel, résiliable à tout moment : ${listePrix()}${mentionTaxes()}. ` : `Trois formules, en paiement unique, sans abonnement : ${listePrix()}${mentionTaxes()}. `) +
      (site.regimeTva ? "" : "La mention de TVA (TTC ou TVA non applicable) est en cours de confirmation. ") +
      "Certaines ressources des formules sont encore en préparation : c’est indiqué sur la page Tarifs.",
    liens: [{ href: "/tarifs/", label: "Voir les tarifs" }],
  }),
  paiement: () => ({
    texte: site.paiement.actif
      ? "Le paiement se fait par PayPal après avoir rempli la page de commande. Il n’est pas vérifié automatiquement : l’organisateur confirme la commande et l’accès par e-mail."
      : "Les commandes en ligne ne sont pas encore ouvertes. Vous pouvez vous inscrire dès maintenant (sans paiement) : l’organisateur vous recontacte par e-mail pour la suite.",
    liens: [{ href: "/inscription/", label: "S’inscrire" }],
  }),
  programme: () => ({
    texte:
      "Six modules : " +
      programme.modules.map((m, i) => `${i + 1}. ${m.titre.toLowerCase()}`).join(", ") +
      ". Chaque module dit quoi faire, dans quel ordre, et ce que vous devez avoir à la fin.",
    liens: [{ href: "/programme/", label: "Voir le programme" }],
  }),
  code: () => ({ texte: faq[0].reponse, liens: [{ href: "/programme/", label: "Voir le programme" }] }),
  duree: () => ({ texte: faq[1].reponse, liens: [] }),
  inscription: () => ({
    texte:
      "Cliquez sur « Je m’inscris » et remplissez le formulaire court (prénom, nom, e-mail, profession et formule choisie). L’inscription n’engage à aucun paiement.",
    liens: [{ href: "/inscription/", label: "S’inscrire" }],
  }),
  contact: () => ({
    texte: `Vous pouvez écrire directement à l’organisateur : ${site.contactEmail}.`,
    liens: [{ href: "/contact/", label: "Page Contact" }],
  }),
  retractation: () => ({
    texte:
      "Si vous êtes consommateur, vous disposez en principe de 14 jours pour vous rétracter, sauf exceptions prévues par la loi (par exemple si vous avez demandé l’accès immédiat à un contenu numérique en renonçant à ce droit). Le détail est sur la page Droit de rétractation. Je ne donne pas de conseil juridique personnalisé.",
    liens: [{ href: "/retractation/", label: "Droit de rétractation" }],
  }),
  validation: () => ({ texte: faq[4].reponse, liens: [{ href: "/idees/", label: "Marchés et idées" }] }),
  idees: () => ({
    texte: `Le site présente ${marchesData.marches.length} marchés, chacun avec 20 niches et 5 idées de SaaS par niche. Ce sont des pistes à tester, pas des niches validées.`,
    liens: [{ href: "/idees/", label: "Marchés et idées" }],
  }),
};

// Ordre important : la première règle qui correspond gagne.
const REGLES = [
  ["retractation", /retract|rembours|annul/],
  ["validation", /valid|garanti/],
  ["duree", /combien de temps|\btemps\b|duree|heures?\b|rythme/],
  ["paiement", /payer|paiement|paypal|carte bancaire|\bcb\b|regler|acheter|commander|commande/],
  ["prix", /prix|tarif|cout|coute|combien|euros?\b|€|formule|essentiel|complet|accompagn|cher\b/],
  ["code", /coder|\bcode\b|developp|programmer|informatique|technique/],
  ["inscription", /inscri|rejoindre|commencer|m enregistrer/],
  ["programme", /programme|module|contenu|apprend|formation|cours|lecon/],
  ["contact", /contact|joindre|e ?-?mail|ecrire|telephone/],
  ["idees", /idee|niche|marche|secteur/],
];

function chercherMarche(q) {
  for (const m of marchesData.marches) {
    for (const n of m.niches) {
      const nn = norm(n.nom);
      if (nn.length > 4 && q.includes(nn)) {
        return {
          texte: `Niche « ${n.nom} » (marché ${m.nom}) : ` + n.idees.map((i) => i.nom).join(", ") + ". Ce sont des pistes à tester auprès de vrais clients.",
          liens: [{ href: `/idees/${m.id}/#${n.id}`, label: `Voir ${n.nom}` }],
        };
      }
    }
    const mots = [m.court, m.nom].map(norm);
    if (mots.some((x) => x.length > 2 && new RegExp(`\\b${x.replace(/[^a-z0-9 ]/g, "")}\\b`).test(q))) {
      return {
        texte: `Marché ${m.nom} : ${m.pourquoi} Il contient 20 niches, avec 5 idées chacune.`,
        liens: [{ href: `/idees/${m.id}/`, label: `Voir le marché ${m.court}` }],
      };
    }
  }
  return null;
}

/** Retourne { texte, liens } pour une question. */
export function repondreLocalement(question) {
  const q = norm(String(question || "")).slice(0, 600);
  if (q.replace(/[^a-z0-9]/g, "").length < 2) {
    return { texte: "Pouvez-vous préciser votre question ? Je peux vous parler du programme, des prix, de l’inscription ou des idées de SaaS.", liens: [] };
  }
  if (/^(bonjour|salut|hello|bonsoir|coucou)\b/.test(q) && q.length < 25) {
    return { texte: "Bonjour ! Posez-moi votre question sur la formation : programme, prix, inscription ou idées de SaaS.", liens: [] };
  }
  const marche = chercherMarche(q);
  for (const [cle, re] of REGLES) {
    if (re.test(q)) {
      if (cle === "idees" && marche) return marche;
      return REPONSES[cle](q);
    }
  }
  if (marche) return marche;
  return {
    texte: "Je n’ai pas trouvé de réponse sûre à cette question sur le site. Essayez avec d’autres mots (programme, prix, inscription, idées) ou écrivez directement à l’organisateur.",
    liens: [{ href: "/contact/", label: "Contact" }],
  };
}
