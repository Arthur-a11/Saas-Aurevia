# Déploiement sur Netlify

État au 1er novembre 2026 : **préparé et testé localement avec l'outil officiel Netlify. Pas encore déployé** (aucun compte Netlify n'est connecté).

## 1. Ce qui a été vérifié, et comment

Tests faits avec `netlify-cli` 27.16.1 (`netlify functions:serve --offline`), qui exécute les fonctions avec le moteur de Netlify et un stockage **Netlify Blobs** local (« sandbox »).

| Fonction | Résultat vérifié |
|---|---|
| Empaquetage | Les 4 fonctions (`inscription`, `retractation`, `commande`, `assistant`) sont empaquetées et chargées par Netlify. Leurs adresses `/api/...` répondent. |
| Inscription | 201, enregistrée dans Netlify Blobs (magasin `inscriptions`), avec la référence, la date et le texte de consentement. Champs invalides : 400 avec un message par champ. Appel d'un autre site : 403. Méthode GET : 405. |
| Rétractation | 201, enregistrée et horodatée dans Netlify Blobs (magasin `retractations`). |
| Limites d'usage | Compteurs dans Netlify Blobs (magasin `compteurs`), en cohérence forte. Avec une limite de 2, le 3e envoi est refusé (429). L'adresse IP du visiteur est bien reçue, et seule son empreinte est stockée. |
| Commande | 403 « commandes fermées » (paiement désactivé). |
| Assistant sans clé | 503 « non configuré », et le site passe en mode secours. |
| Assistant avec une clé invalide | Vrai appel à l'API Anthropic, refusé (401), puis réponse 503 « indisponible ». Le SDK fonctionne donc une fois empaqueté par Netlify. |
| E-mail (Brevo) avec une clé invalide | L'envoi échoue, et l'inscription répond `emailConfirmation: "echec"`. Le site n'annonce donc pas d'envoi. |

**Pas vérifié** (impossible depuis l'environnement de travail) :
- un vrai déploiement sur les serveurs Netlify et le vrai Netlify Blobs en ligne (il faut un compte) ;
- un vrai envoi d'e-mail : `api.brevo.com` est bloqué par le réseau de l'environnement, et il n'y a pas de compte ;
- une vraie réponse de l'IA (il faut une clé valide) ;
- `netlify serve` complet : il nécessite `edge.netlify.com`, bloqué par le réseau de l'environnement. Le projet n'utilise pourtant aucune « Edge Function ».

## 2. Où sont stockées les données

- **En production :** uniquement dans **Netlify Blobs** (magasins `inscriptions`, `retractations`, `commandes`, `compteurs`). Ce stockage est persistant, rattaché au site Netlify, et ne demande aucune clé.
- **Le stockage « fichier »** (`.donnees-locales/`) sert **seulement** au serveur local et aux tests. Ce n'est **pas** une solution de production, et les fonctions Netlify ne l'utilisent jamais.
- **Région d'hébergement des données et garanties RGPD** : à vérifier dans les conditions de Netlify, puis à reporter dans la politique de confidentialité. Je ne l'ai pas vérifié.

Consulter les inscriptions : interface Netlify → votre site → **Blobs**. Ou, en ligne de commande :

```bash
npx netlify-cli blobs:list inscriptions
```

```bash
npx netlify-cli blobs:get inscriptions INS-AAAAMMJJ-XXXXXX
```

## 3. Étapes de mise en ligne (à faire par Arthur, ou avec lui)

1. Créer un compte Netlify et un dépôt GitHub privé contenant ce projet (ou glisser-déposer le projet dans Netlify).
2. Netlify → **Add new site** → **Import an existing project** → choisir le dépôt. La commande `npm run build`, le dossier `dist` et Node 22 sont déjà réglés dans `netlify.toml`.
3. Netlify → **Site configuration** → **Environment variables** : ajouter au minimum `SEL_EMPREINTE` (texte aléatoire secret). Les autres variables sont listées dans `.env.example`.
4. Une fois le site en ligne, vérifier avec un vrai formulaire : l'inscription doit apparaître dans **Blobs** → `inscriptions`.
5. Plus tard, quand vous les aurez :
   - le nom de domaine : renseigner `SITE_URL`, puis redéployer (cela active l'indexation par Google, le sitemap et les liens canoniques) ;
   - le compte Brevo : `BREVO_API_KEY`, `EMAIL_EXPEDITEUR` (adresse validée chez Brevo) et `EMAIL_ORGANISATEUR` ;
   - la clé Anthropic : `ANTHROPIC_API_KEY`, avec une limite de dépense mensuelle fixée dans la console Anthropic.

## 4. Paiements : restent désactivés

`src/data/site.json` → `paiement.actif: false`. Ne pas activer avant d'avoir :
- les informations complètes de l'entreprise (statut, SIREN, adresse, régime de TVA) ;
- un médiateur de la consommation sous contrat ;
- des contenus de formules réellement disponibles, et les modalités de l'« avis personnel » ;
- l'envoi d'e-mails fonctionnel : la fonction de commande refuse de toute façon de fonctionner sans lui, car la confirmation sur support durable est obligatoire ;
- la relecture des CGV par un juriste ;
- le choix d'un vrai prestataire de paiement (compte PayPal professionnel ou Stripe), vérifié.

## 5. Où on en est (sujet mis en pause le 1er novembre 2026)

- Dépôt GitHub privé créé : `Arthur-a11/aurevia-saas`. Arthur y a téléversé le contenu du ZIP depuis le site de GitHub. Claude n'a pas pu le vérifier, car la session n'avait pas d'accès au dépôt.
- Blocage : Arthur n'arrive pas à créer un nouveau projet sur Netlify. Pistes à vérifier : e-mail Netlify non confirmé ou accueil non terminé, application Netlify sans accès au dépôt privé (« Configure the Netlify app on GitHub »), ou mauvais parcours (glisser-déposer au lieu d'« Import from GitHub »).
- Reprise : demander une capture d'écran de la page bloquante, puis reprendre à l'étape 4 de la section 3.
- Pour vérifier le site en ligne depuis une session Claude, il faudra autoriser le domaine `xxxx.netlify.app` dans les réglages réseau de l'environnement.
