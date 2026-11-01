# Paiement et accès à la formation

Mis à jour le 1er novembre 2026. Branche `espace-formation`. **Cette version n'est pas publiée** : le site public reste sur la version précédente (étiquette Git `avant-espace-formation`).

## 1. Le parcours

1. La personne choisit une formule (page Tarifs → Commande).
2. Elle se connecte ou crée son compte (page `/compte/`).
3. Elle coche les accords (CGV obligatoires ; accès immédiat facultatif), puis paie sur la page sécurisée de **Stripe**.
4. Stripe envoie une notification **signée** au serveur (`/api/paiement/webhook`). Le serveur vérifie :
   - la signature ;
   - le montant ;
   - la devise ;
   - la référence de commande.
5. Les droits de la formule sont enregistrés dans le compte (magasin Blobs `droits`).
6. La personne revient sur « Ma formation ». La page affiche « Vérification du paiement en cours » jusqu'à la confirmation, puis le bouton « Commencer ma formation ».
7. À chaque connexion, elle retrouve ses modules et sa progression.

Si la notification tarde, le serveur interroge lui-même Stripe avec la clé secrète.

**Rien ne se débloque par le navigateur** : ni par l'adresse de retour (`?commande=…`), ni par un paramètre, ni par une valeur stockée dans le navigateur.

## 2. Ce que donne chaque formule

C'est une correspondance **proposée**, tirée des textes actuels des formules. Elle est à confirmer par Arthur et se règle dans `src/data/formation.json`, rubrique `acces`.

| Contenu | Essentiel 14,90 € | Complet 24,90 € | Accompagné 54,90 € | État réel |
|---|---|---|---|---|
| 6 leçons écrites (une par module) | oui | oui | oui | Disponibles. Ce sont les textes de la page Programme, **déjà publics**. |
| Vidéos des 6 modules | oui | oui | oui | **En préparation** (aucune vidéo fournie). |
| Fiches résumé des 6 modules | oui | oui | oui | **En préparation**. |
| Modèles à copier | non | oui | oui | **En préparation**. |
| Communauté d'entraide | non | oui | oui | **En préparation**. |
| Avis personnel sur le projet | non | non | oui | **Modalités à définir** (forme, durée, délai, part du prix). |

Tous les prix se paient **en une fois**. Il n'y a ni abonnement ni prélèvement récurrent : Stripe est appelé en mode `payment`.

### Points signalés avant d'ouvrir les ventes

- **Le contenu payant n'existe pas encore.** Aujourd'hui, une personne paierait pour des textes déjà gratuits sur la page Programme. Elle recevrait aussi des vidéos, des fiches et des modèles encore « En préparation ». C'est pourquoi, en mode réel, le serveur **refuse la vente** d'une formule tant qu'un de ses contenus est en préparation.
- **Les trois formules donnent les mêmes 6 modules.** Les textes « Tout l'Essentiel » et « Tout le Complet » le disent ainsi. Si vous voulez réserver des modules à certaines formules, il faut le décider.
- **Durée d'accès** : rien n'est écrit (à vie ? un an ?). Ce point est à fixer dans les CGV.
- **Sans accord d'accès immédiat**, le client garde son droit de rétractation et l'accès s'ouvre 14 jours après le paiement. C'est la règle des CGV (article 8), encore marquée « à décider ». Elle se règle avec `delaiSansAccordJours`.
- **Le délai d'accès des CGV** (`delaiAcces`, toujours `null`) peut devenir « dès la confirmation du paiement ». C'est à confirmer.

## 3. Sécurité

| Protection | Comment |
|---|---|
| Comptes | Mot de passe protégé par scrypt, jamais stocké en clair. Session par cookie `HttpOnly`, `SameSite=Lax` et `Secure` en HTTPS, valable 30 jours. Le serveur ne garde que l'empreinte du jeton. |
| Essais de connexion | 10 par adresse et par heure, 30 par visiteur. Le temps de réponse est le même que le compte existe ou non. |
| Prix | Fixés par le serveur (`site.json`). Un prix envoyé par le navigateur est ignoré. |
| Notifications | Signature HMAC vérifiée, refus au-delà de 5 minutes (contre le rejeu). Une notification du mode test ne touche pas un site en mode réel. |
| Doublons | Chaque notification n'est traitée qu'une fois, et un achat n'est ouvert qu'une fois par commande. Une formule déjà détenue ne peut pas être rachetée. |
| Paiement en attente, refusé, annulé ou expiré | La commande est notée, aucun droit n'est ouvert. |
| Remboursement | S'il est total, l'accès de la commande est retiré. S'il est partiel, il est noté et l'accès est conservé. |
| Contenus | Les leçons arrivent par `/api/formation/lecon`, après vérification des droits. Les fichiers (fiches, modèles) arrivent par `/api/formation/fichier` depuis le magasin Blobs `fichiers-formation`, jamais depuis une adresse publique. |
| Historique | Magasins Blobs `commandes` (statuts horodatés et accords), `droits` (achats et historique), `evenements-stripe` et `paiements`. |

## 4. Brancher Stripe en MODE TEST (sur une version de test, pas sur le site public)

1. Créez un compte Stripe, puis restez en **mode test** (interrupteur « Test mode »).
2. Ouvrez **Développeurs > Clés API** et copiez la clé secrète de test (`sk_test_…`). Ne la collez jamais dans une conversation.
3. Ouvrez **Développeurs > Webhooks > Ajouter un point de terminaison** :
   - adresse : `https://VOTRE-SITE/api/paiement/webhook` ;
   - événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` et `charge.refunded`.

   Copiez ensuite le « secret de signature » (`whsec_…`).
4. Sur Netlify, ouvrez **Project configuration > Environment variables**. Ajoutez `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`, puis redéployez.
5. `/api/etat` doit alors afficher `"paiementStripe":"test"`. La page Commande affiche le bandeau « Mode test ». Payez avec la carte de test `4242 4242 4242 4242`.

## 5. Avant les ventes réelles (rien de tout cela n'est fait)

- Identité de l'entreprise, régime de TVA, médiateur de la consommation, CGV relues par un juriste.
- Contenus réellement produits, avec le statut `disponible` dans `formation.json` (et les fichiers déposés dans Blobs `fichiers-formation`).
- E-mails Brevo connectés : confirmation sur support durable. En mode réel, la vente est refusée sans e-mail.
- `paiement.actif: true` dans `site.json`, puis les clés `sk_live_…` et `whsec_…` du mode réel.
- Réinitialisation du mot de passe par e-mail. Elle n'est pas encore faite, faute de Brevo ; d'ici là, la page Compte renvoie vers Contact.
- Litiges (contestations bancaires) et suppression de compte à la demande (RGPD) : à traiter à la main pour l'instant.

## 6. Tests

- Tests serveur (`tests/unitaires/espace.test.mjs`), avec un Stripe simulé :
  - comptes ;
  - signatures ;
  - les 3 formules ;
  - redirection falsifiée ;
  - montant modifié ;
  - notifications répétées ;
  - paiement refusé, en attente ou expiré ;
  - remboursements ;
  - délai de 14 jours ;
  - progression ;
  - téléchargement protégé.
- Tests navigateur (`tests/e2e/paiement.spec.mjs`), sur ordinateur et téléphone, avec le **simulateur Stripe local** (`scripts/stripe-simule.mjs`). Ils couvrent le parcours complet pour les 3 formules, l'annulation, le refus, la notification retardée, la notification en double puis le remboursement, la reconnexion et l'accessibilité.

**Non testé** : le vrai Stripe, même en mode test (aucun compte fourni), et aucun paiement réel.
