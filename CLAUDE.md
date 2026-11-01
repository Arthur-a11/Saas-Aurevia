# CLAUDE.md : règles du projet AUREVIA SAAS

Formation en ligne pour apprendre à créer un SaaS, sans code. Propriétaire : Arthur Leloup. Il parle français et préfère les explications simples, sans jargon.

## Règles absolues

1. **N'inventez jamais** de témoignages, de chiffres d'élèves, de résultats, de statistiques de marché ou de preuves de ventes (« le plus choisi », « 1 000 élèves »…).
2. **Une niche n'est pas validée** : seule la rencontre avec de vrais clients la valide. Le message « Une idée rédigée n'est pas une niche validée » doit rester visible sur les pages d'idées. Le contrôle des données échoue s'il disparaît.
3. **Les textes légaux sont des brouillons** à faire relire par un juriste. Ne les présentez jamais comme validés.
4. **N'inventez aucune information d'entreprise** : SIREN, adresse, TVA, médiateur, hébergeur, régime fiscal. Les valeurs inconnues restent `null` dans `src/data/site.json` et s'affichent « à compléter ». Demandez-les à Arthur.
5. **Ne prétendez jamais qu'une chose a eu lieu si ce n'est pas le cas** : e-mail envoyé, paiement reçu, accès ouvert. Une fonction non connectée doit le dire.
6. **Ne promettez pas de ressources absentes** (vidéos, fiches, modèles, communauté) : elles gardent `"statut": "en-preparation"` tant qu'Arthur n'a pas confirmé qu'elles existent.
7. **Les clés API restent côté serveur** (variables d'environnement), jamais dans `src/` ni dans le dépôt.
8. **Ne modifiez jamais** `original/creation-sas.html` : c'est la sauvegarde de la version publiée.
9. **Gardez les prix** 14,90 €, 24,90 € et 54,90 €, sauf demande explicite d'Arthur. N'écrivez ni TTC ni HT tant que `regimeTva` vaut `null`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm install` | Installer les dépendances. |
| `npm run dev` | Site en développement (sans les fonctions serveur). |
| `npm run build` | Contrôle des données, puis construction du site dans `dist/`. |
| `npm run serveur` | Servir `dist/` et `/api/*` en local (http://localhost:4321). |
| `npm run donnees:verifier` | Contrôle des 15 marchés × 20 niches × 5 idées, des doublons et de la fidélité à l'original. |
| `npm run test:unitaires` | Tests des fonctions serveur et de l'assistant de secours. |
| `npm run test:e2e` | Tests Playwright (ordinateur et mobile, accessibilité axe). Nécessite `npm run build` avant. |
| `npm test` | Tout. **Doit réussir avant chaque livraison.** |
| `npm run formation:exporter` | Regénère `docs/formation/relecture.md` (toute la formation écrite, pour relecture). |
| `python3 video/generer-video.py` | Nouvelle vidéo de présentation (pas l'originale). |

## Conventions techniques à respecter

- `[hidden]` masque toujours (règle globale) : ne pas la contourner par un `display` plus fort.
- Les boutons dont le libellé visible est court gardent ce libellé au début de leur nom accessible (WCAG 2.5.3) : « Favori : NomIdée », « Copier l’idée NomIdée ». L'état passe par `aria-pressed`.
- Les favoris restent dans `localStorage` (clé `aurevia:favoris:v1`), toujours lus et écrits dans un `try/catch`.
- Toute requête réseau du navigateur a un délai maximal (`AbortSignal.timeout`) et un parcours de secours honnête.
- Les accès à la formation sont décidés **uniquement par le serveur** (`serveur/espace.js`), d'après une confirmation Stripe vérifiée (signature ou lecture de la session). Jamais d'après une adresse, un paramètre ou le navigateur. Voir `docs/paiement-et-acces.md`.
- Contenus payants : uniquement dans `serveur/contenus/` (jamais importés par une page). Statuts dans `src/data/formation.json` : seul Arthur passe un élément en `"valide"` ; les brouillons restent `"brouillon"`. Les scripts vidéo ne sont pas des vidéos.
- Ventes réelles : bloquées côté serveur par `serveur/ouverture.js` tant qu'une condition manque (`src/data/conditions.json`, `site.json`). Ne jamais remplir ces valeurs à la place d'Arthur.
- Paiement : achat unique (`mode: "payment"`). Aucun abonnement sans accord explicite d'Arthur. Tests uniquement avec des clés `sk_test_` ou le simulateur local (`scripts/stripe-simule.mjs`).
- Les nombres affichés passent par `nombre()` (`src/lib/site.js`) : espace insécable classique, jamais l'espace fine (absente de certaines polices).

## Façon de travailler

- Modifiez les fichiers par de **petites éditions ciblées**, jamais par des scripts de remplacement de texte sur tout le fichier. C'est ainsi que trois pages ont été perdues dans la première version.
- Après chaque modification : `npm test`. Si un test casse, corrigez la cause ; n'affaiblissez pas le test pour qu'il passe.
- Contenus dans `src/data/*.json`, couleurs dans `src/styles/tokens.css`, logique serveur dans `serveur/` (indépendante de l'hébergeur).
- Accessibilité : un seul `h1` par page, des étiquettes sur tous les champs, un contraste d'au moins 4,5:1, un usage complet au clavier, et le respect de « réduire les animations ».
- Pour ajouter une idée ou une niche, passez par `src/data/marches.json` et gardez 5 idées par niche, au format nom court + description.
- Sauvegardez avec Git (commits en français) et ne publiez pas avec des tests en échec.

## Informations encore manquantes (à demander à Arthur)

- Statut et identité de l'entreprise, adresse, SIREN, numéro de TVA ou franchise (art. 293 B du CGI).
- Médiateur de la consommation (contrat obligatoire avant toute vente à des particuliers).
- Nom de domaine, et confirmation de l'hébergeur (Netlify proposé).
- Comptes à connecter : Brevo (e-mails), Anthropic (assistant), compte PayPal professionnel ou Stripe.
- Existence réelle des vidéos, fiches, modèles et de la communauté ; modalités de l'« avis personnel » (formule Accompagné).
