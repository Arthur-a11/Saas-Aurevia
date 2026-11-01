// Réponses de secours de l'assistant (sans IA) : elles doivent être justes, surtout sur les prix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { repondreLocalement as r } from "../../src/lib/assistant-local.js";

test("prix : la question sur la formule Complet donne 24,90 €", () => {
  const t = r("combien coûte la formule complète ?").texte;
  assert.match(t, /Complet coûte 24,90 €/);
  assert.match(t, /14,90 €/);
  assert.match(t, /54,90 €/);
  assert.doesNotMatch(t, /€ ?(TTC|HT)\b/, "aucun prix annoncé TTC ou HT tant que le régime n'est pas confirmé");
  assert.match(t, /en cours de confirmation/);
});

test("chaque question type obtient la bonne rubrique", () => {
  const cas = [
    ["Quels sont les prix ?", "/tarifs/"],
    ["Que contient le programme ?", "/programme/"],
    ["Faut-il savoir coder ?", "/programme/"],
    ["Comment m’inscrire ?", "/inscription/"],
    ["comment payer par paypal", "/inscription/"],
    ["je veux être remboursé", "/retractation/"],
    ["des idées pour les cabinets dentaires", "/idees/sante/#cabinets-dentaires"],
    ["le marché immobilier", "/idees/immobilier/"],
    ["comment vous contacter", "/contact/"],
  ];
  for (const [q, lien] of cas) assert.equal(r(q).liens[0]?.href, lien, q);
  assert.match(r("Combien de temps faut-il ?").texte, /heures par semaine/);
  assert.match(r("ces idées sont-elles validées ?").texte, /n’est pas une niche validée/);
});

test("question inconnue : aucune invention, renvoi vers le contact", () => {
  const x = r("quelle est la météo à Lyon ?");
  assert.match(x.texte, /pas trouvé de réponse sûre/);
});
