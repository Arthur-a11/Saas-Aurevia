# AUREVIA SAAS

Site de la formation en ligne **AUREVIA SAAS**, qui apprend à des débutants (entrepreneurs, indépendants, salariés) à créer un SaaS, c'est-à-dire un logiciel vendu par abonnement, sans savoir coder.

Le site est construit avec [Astro](https://astro.build) : chaque page a sa propre adresse (`/tarifs/`, `/idees/sante/`…), ce qui aide le référencement. Le design violet et bleu de la première version est conservé.

## Ce qu'il y a dedans

| Dossier / fichier | Rôle |
|---|---|
| `original/creation-sas.html` | **Sauvegarde intacte** du site publié sur claude.ai (version du 31/10/2026). Ne pas modifier. |
| `original/donnees-brutes.json` | Les 1 500 idées extraites telles quelles de l'original. |
| `src/data/marches.json` | **Les 15 marchés, 300 niches et 1 500 idées** (fichier unique, contrôlé automatiquement). |
| `src/data/site.json` | Nom, contact, **informations d'entreprise à compléter**, formules et prix, réglages du paiement. |
| `src/data/programme.json`, `faq.json` | Textes du programme et des questions fréquentes. |
| `src/pages/` | Une page par fichier (accueil, programme, idées, tarifs, questions, contact, inscription, commande, pages légales). |
| `src/components/` | Morceaux réutilisables : en-tête, pied de page, assistant, champs de formulaire… |
| `src/styles/tokens.css` | **Jetons de style** : toutes les couleurs, polices et espacements. |
| `public/fonts/` | Polices hébergées sur le site (plus aucune connexion à Google Fonts). |
| `serveur/` | Fonctions serveur : inscription, rétractation, commande, assistant IA. |
| `netlify/functions/` | Branchement de ces fonctions sur Netlify (hébergeur proposé). |
| `scripts/` | Extraction et contrôle des données, serveur local. |
| `tests/` | Tests unitaires (serveur) et tests dans un vrai navigateur (Playwright). |
| `video/generer-video.py` | **Nouveau** script de vidéo de présentation (l'original n'a pas été retrouvé). |
| `docs/verifications.md` | Ce qui a été vérifié, les sources, et ce qui reste à faire. |
| `docs/deploiement-netlify.md` | Mise en ligne sur Netlify : tests effectués, stockage, étapes. |
| `docs/paiement-et-acces.md` | Comptes, paiement Stripe, droits par formule, espace « Ma formation » : fonctionnement, sécurité, mise en mode test, ce qui manque avant les ventes. |
| `scripts/preparer-apercu.mjs` | Copie de l'aperçu consultable sur claude.ai (`npm run apercu`). |

## Lancer le site sur son ordinateur

Il faut [Node.js](https://nodejs.org) version 22 ou plus.

```bash
npm install
```

Pour travailler sur les pages (rechargement automatique, sans les fonctions serveur) :

```bash
npm run dev
```

Pour voir le site complet comme en production, avec les formulaires et l'assistant :

```bash
npm run build
```

```bash
npm run serveur
```

Puis ouvrez http://localhost:4321/. Les inscriptions de test sont enregistrées dans le dossier `.donnees-locales/`.

Pour brancher vos clés en local, copiez `.env.example` en `.env`, remplissez-le, puis lancez :

```bash
node --env-file=.env scripts/serveur-local.mjs
```

## Tester

Tout tester d'un coup (données, serveur, construction du site, navigateur) :

```bash
npm test
```

Ou par morceaux :

```bash
npm run donnees:verifier
```

```bash
npm run test:unitaires
```

```bash
npm run test:e2e
```

Les tests vérifient notamment : 15 marchés × 20 niches × 5 idées = 1 500 idées affichées, chaque page présente avec un titre, aucun lien cassé, les trois prix, les formulaires, l'assistant (y compris la touche Échap), le clavier, le mobile et l'accessibilité (outil axe).

**Si un test échoue, ne publiez pas.** C'est ce qui empêche de perdre à nouveau des pages par erreur.

## Sauvegarder

Créer une archive ZIP complète et vérifiable (code, données, historique Git, vidéo), sans GitHub :

```bash
npm run sauvegarde
```

L'archive est écrite dans `livraison/`.

## Modifier le contenu

- **Une idée, une niche** : `src/data/marches.json`, puis `npm run donnees:verifier`. Le contrôle refuse les doublons et toute niche qui n'aurait pas 5 idées.
- **Prix, formules, contenu des formules** : `src/data/site.json` → `formules`. Un élément pas encore disponible garde `"statut": "en-preparation"`.
- **Informations d'entreprise** (SIREN, adresse, TVA, médiateur, hébergeur) : `src/data/site.json`. Tant qu'une valeur vaut `null`, le site affiche « [… — à compléter] ».
- **Régime de TVA** : `"regimeTva"` dans `site.json` (`"franchise"` ou `"ttc"`). Tant qu'il vaut `null`, le site écrit « Mention de TVA à confirmer ».
- **Couleurs** : `src/styles/tokens.css`.

## Publier

Hébergement proposé : **Netlify** (offre gratuite au départ). Le fichier `netlify.toml` est prêt.

1. Mettre le projet sur GitHub (dépôt privé).
2. Sur Netlify : « Add new site » → « Import from Git » → choisir le dépôt. La commande `npm run build` et le dossier `dist` sont déjà indiqués.
3. Dans Netlify → « Site configuration » → « Environment variables », ajouter les variables de `.env.example` utiles (au minimum `SITE_URL` et `SEL_EMPREINTE`). **Les clés ne vont jamais dans le code.**
4. Brancher votre nom de domaine, puis mettre sa vraie adresse dans `SITE_URL` et relancer une publication : le sitemap, les liens canoniques et l'autorisation d'indexation par Google s'activent seulement à ce moment-là.

Les inscriptions et rétractations sont stockées dans **Netlify Blobs** (inclus dans Netlify, aucune clé à fournir). On les consulte depuis l'interface Netlify (« Blobs »). Le stockage en fichiers du serveur local (`.donnees-locales/`) sert uniquement aux essais et **n'est pas** une solution de production.

Le guide détaillé, avec ce qui a été vérifié et ce qui ne l'est pas, est dans **`docs/deploiement-netlify.md`**.

## État des fonctions (au 1er novembre 2026)

| Fonction | État |
|---|---|
| Pages, marchés, 1 500 idées | Prêtes et testées. |
| Recherche d'idées (`/idees/`) | Recherche sans accents ni majuscules dans les 1 500 idées, filtre par marché, nombre de résultats, message quand rien ne correspond, affichage par lots de 24. Sur chaque page de marché : filtre instantané interne. |
| Favoris et copie | Bouton « Favori » et « Copier » sur chaque idée. **Les favoris sont enregistrés uniquement dans le navigateur du visiteur** (stockage local, clé `aurevia:favoris:v1`) : rien n'est envoyé au serveur, ils ne passent pas d'un appareil à l'autre et disparaissent si l'on efface les données du site. |
| Inscription | Code prêt et testé en local. **Enregistrement réel seulement une fois publié sur Netlify.** Sans serveur (ou si le réseau coupe, au-delà de 15 s), la page le dit et propose un e-mail pré-rempli que la personne envoie elle-même. Un même e-mail renvoyé dans les 24 h ne crée pas de doublon (même référence). |
| Protections des formulaires | Validation côté serveur, corps limité à 20 Ko, champ piège anti-robot, refus des envois faits moins de 1,5 s après l'ouverture de la page, limite d'envois par visiteur et par heure, appels depuis un autre site refusés. Les adresses IP et e-mails servant aux limites et aux doublons sont transformés en empreintes non réversibles ; les journaux ne contiennent aucune donnée personnelle. |
| E-mail de confirmation | Code prêt (Brevo). **Non connecté** : il faut un compte Brevo, `BREVO_API_KEY` et `EMAIL_EXPEDITEUR`. Le site n'affiche jamais « envoyé » si rien n'est parti. |
| Rétractation en ligne | Formulaire prêt, horodaté, avec accusé de réception par e-mail une fois Brevo connecté. |
| Commande et paiement | **Fermés** (`paiement.actif: false`). La page et le recueil des accords (accès immédiat, début de l'accompagnement) sont prêts. Le lien PayPal.me n'est qu'un moyen de payer : pas de commande, de facture ni d'accès automatiques. |
| Assistant IA | Code prêt. **Non connecté** : l'IA payante ne s'active que si `ASSISTANT_IA=active` **et** `ANTHROPIC_API_KEY` sont réglés. Sinon, ou si l'IA ne répond pas en 8 s, il répond à partir des informations du site (mode secours, gratuit, testé). |
| Génération d'idées par IA | **Retirée** : elle faisait doublon avec les 1 500 idées et coûtait à chaque clic. |
| Statistiques | Aucune pour l'instant (aucun cookie). Option prête : `PUBLIC_STATS_SCRIPT` et `PUBLIC_STATS_DOMAINE` (Plausible ou équivalent), à déclarer ensuite dans la politique de confidentialité. |

### Maîtriser le coût de l'assistant IA

**Attention : limiter les requêtes n'est pas plafonner les dépenses.** Les limites ci-dessous réduisent le nombre d'appels, mais seul un **plafond de dépense réglé dans la console Anthropic** garantit un montant maximal. Réglez les deux.

- L'IA ne démarre jamais par accident : il faut `ASSISTANT_IA=active` en plus de la clé.
- Chaque appel est coupé après `ASSISTANT_DELAI_MS` (8 s par défaut, jamais plus de 9 s, sous la limite de 10 s des fonctions Netlify), sans nouvelle tentative automatique.
- La clé reste sur le serveur. Chaque visiteur a droit à `ASSISTANT_LIMITE_IP_JOUR` questions par jour (20 par défaut), et le site à `ASSISTANT_LIMITE_JOUR` au total (200 par défaut). Au-delà, l'assistant passe en mode secours.
- Les réponses sont limitées à `ASSISTANT_MAX_TOKENS` (1 500), avec un niveau de réflexion `low`.
- Le modèle par défaut est `claude-opus-5-5`. Pour réduire fortement le coût, vous pouvez choisir `ASSISTANT_MODELE=claude-haiku-5-5`, environ 40 fois moins cher : c'est votre décision.
- Fixez aussi une **limite de dépense mensuelle** dans la console Anthropic.

## Vidéo

L'original `presentation-saas.mp4` et son script `generer-video.py` **n'ont pas été retrouvés**. `video/generer-video.py` est une **nouvelle création** qui reprend les vrais contenus du site (programme, prix, nombre d'idées), sans « Lien dans la description ».

```bash
python3 video/generer-video.py --site www.votre-domaine.fr
```

Résultat : `video/sortie/presentation-saas-nouvelle-creation.mp4` (1080 × 1920, 17 s). Il faut Python 3, Pillow et ffmpeg.

## Textes légaux

Les mentions légales, CGV, politique de confidentialité et page de rétractation sont des **brouillons**. Ils doivent être **relus par un juriste avant la première vente**. Voir `docs/verifications.md`.
