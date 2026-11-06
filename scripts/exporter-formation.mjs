// Exporte toute la formation écrite dans un seul document de relecture : docs/formation/relecture.md
// Usage : npm run formation:exporter
import { writeFile, mkdir } from "node:fs/promises";
import formation from "../src/data/formation.json" with { type: "json" };
import { CONTENUS } from "../serveur/contenus/index.js";

const L = [];
const p = (...x) => L.push(...x);
const STATUT = { valide: "validé", brouillon: "BROUILLON (à relire)", "en-preparation": "en préparation (n'existe pas)", "a-definir": "à définir" };
p("# Formation AUREVIA SAAS : document de relecture", "",
  "Généré automatiquement depuis `serveur/contenus/`. **Tout est en brouillon** : rien n'est vendable tant qu'Arthur n'a pas relu et passé les éléments en « valide » dans `src/data/formation.json`.",
  "Les exemples sont fictifs et doivent le rester. Les vidéos n'existent pas : voir `scripts-videos.md`.", "");
for (const m of formation.modules) {
  const c = CONTENUS[m.id];
  p(`## Module ${formation.modules.indexOf(m) + 1} : ${c.titre}`, "", "**Objectifs**", "", ...c.objectifs.map((o) => `- ${o}`), "");
  p("**Éléments et statuts**", "", ...m.lecons.map((e) => `- ${e.titre} (${e.type}, droit « ${e.droit} ») : ${STATUT[e.statut]}`), "");
  for (const l of c.lecons) {
    p(`### ${l.titre} (${l.duree})`, "", l.intro, "");
    for (const s of l.sections) {
      p(`#### ${s.titre}`, "");
      for (const x of s.paragraphes ?? []) p(x, "");
      if (s.liste) p(...s.liste.map((x) => `- ${x}`), "");
      if (s.exemple) p(`> ${s.exemple}`, "");
    }
    p("**À retenir**", "", ...l.aRetenir.map((x) => `- ${x}`), "");
  }
  const e = c.exercice;
  p(`### ${e.titre}`, "", e.consigne, "", ...e.etapes.map((x, i) => `${i + 1}. ${x}`), "", `**Livrable :** ${e.livrable}`, "",
    "**Critères de réussite**", "", ...e.criteres.map((x) => `- ${x}`), "", `**${e.corrige.titre}**`, "", ...e.corrige.paragraphes.flatMap((x) => [x, ""]));
  p(`### ${c.fiche.titre}`, "", ...c.fiche.points.map((x) => `- ${x}`), "");
  p(`### ${c.modele.titre}`, "", c.modele.intro, "");
  for (const s of c.modele.sections) p(`**${s.titre}**`, "", ...s.champs.map((x) => `- ${x}`), "");
  p(`### Checklist de fin de module`, "", ...c.checklist.map((x) => `- [ ] ${x}`), "");
}
await mkdir("docs/formation", { recursive: true });
await writeFile("docs/formation/relecture.md", L.join("\n"));
const mots = L.join(" ").split(/\s+/).length;
console.log(`docs/formation/relecture.md : ${mots} mots environ.`);
