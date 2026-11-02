# AUREVIA SAAS : état et décisions avant l'ouverture des ventes

Mis à jour le 2 novembre 2026, sur la branche `refonte-visuelle`. **Le site public n'est pas modifié.**

Site de test séparé : **https://aurevia-saas-test.netlify.app**. C'est le projet Netlify `aurevia-saas-test`, qui publie la branche `refonte-visuelle`. Ses données sont séparées de celles du site public, il est en mode test Stripe, et ses ventes réelles sont bloquées.

## 1. Ce qui fonctionne, ce qui reste à connecter, ce qui attend ta validation

| Élément | État | Testé comment |
|---|---|---|
| Formation écrite : 6 modules, 19 leçons, 6 exercices avec corrigé, 6 fiches, 6 modèles, 6 checklists (environ 9 500 mots) | **Rédigée, en brouillon : attend ta relecture** | Contrôles automatiques : contenu complet, exemples marqués « fictif », aucune promesse de revenus. |
| Scripts des 6 vidéos | **Rédigés, à relire** (`docs/formation/scripts-videos.md`). Aucune vidéo n'existe. | — |
| Communauté | **N'existe pas** (marquée « En préparation ») | — |
| Accompagnement (avis personnel) | **À définir** : rien n'est promis | — |
| Correspondance formules → contenus → droits | Fonctionne, avec une source unique (`src/data/formation.json`) pour les tarifs, la commande, le serveur et l'espace client | Tests serveur et navigateur |
| Protection des contenus payants | Fonctionne : textes uniquement sur le serveur, après contrôle des droits | Tests : sans compte, mauvaise formule, adresse falsifiée ; aucun texte payant dans les pages publiques |
| Comptes, connexion, progression | Fonctionnent | Tests serveur et navigateur (ordinateur et mobile) |
| Mot de passe oublié | **Fonctionne sur le site de test** | Brevo **réel** (2 nov.) : e-mail reçu, nouveau mot de passe enregistré, connexion réussie. Brevo simulé : usage unique, expiration de 30 min, même réponse pour une adresse inconnue |
| E-mails (inscription, compte, commande, réinitialisation, rétractation) | **Brevo connecté sur le site de test** (offre gratuite, clé restreinte aux e-mails transactionnels). Expéditeur : adresse Gmail, à remplacer par une adresse sur ton domaine avant les ventes. | Brevo **réel** : e-mail de réinitialisation reçu. Brevo simulé : panne comprise |
| Paiement Stripe (mode test) | **Fonctionne sur le site de test** | Stripe **réel en mode test** (2 nov.) : paiement avec la carte 4242, puis formule Complet ouverte ; leçons, téléchargement et progression OK ; accès conservé après reconnexion ; rachat refusé ; remboursement total, puis accès retiré par notification. Stripe simulé : refus, annulation, notification en double, montant falsifié |
| Abonnement mensuel (Stripe mode test) | **Fonctionne sur le site de test** | Stripe **réel en mode test** (2 nov.) : abonnement Essentiel payé avec la carte 4242, 25 éléments ouverts, exercices et modèles refusés (non inclus) ; résiliation en ligne, accès conservé jusqu'à la fin du mois payé. Correction des notifications simultanées vérifiée (commande `CMD-20261102-KGLG62`) : état de l'e-mail de commande « accepté par Brevo », plus jamais vide. Fin d'abonnement et impayés : simulateur uniquement |
| Ouverture immédiate ou différée, durée d'accès | Prêtes, réglables dans `src/data/conditions.json` | Tests des deux options et de « 12 mois » |
| Blocage des ventes réelles | **Actif côté serveur** : aucun paiement réel ne peut être créé (22 conditions contrôlées, 23 pour Accompagné) | Tests : refus même si les ventes sont forcées à « actives » |
| Informations légales | **À fournir** (liste ci-dessous). Les emplacements « à compléter » sont prêts : tarifs, commande, e-mail de confirmation, CGV. | Test : « à compléter » affiché |
| Vrais Stripe (mode test) et Brevo | **Testés le 2 nov. sur le site de test** (voir ci-dessus) | Non testés en vrai : paiement refusé et notification en double (simulateurs uniquement) |
| `SITE_URL` | Contrôlée par le serveur : une adresse mal tapée est ignorée, ce qui évite les liens d'e-mail cassés (`/api/etat` indique `siteUrlValide`) | Test serveur dédié |

## 2. Décisions

### Prises par Arthur le 2 novembre 2026 (appliquées dans le code)

- **Répartition des formules :**
  - Essentiel : 19 leçons, 6 fiches et les vidéos (encore à tourner) ;
  - Complet : en plus, exercices corrigés, checklists et modèles. La communauté reste dans Complet, toujours « en préparation » ;
  - Accompagné : en plus, l'avis personnel (à définir).
- **Paiement :** abonnement mensuel à 14,90 / 24,90 / 54,90 € par mois, résiliable en ligne à tout moment depuis « Ma formation ». La résiliation prend effet à la fin du mois déjà payé (choix technique par défaut, à confirmer).
- **Durée d'accès :** tant que l'abonnement est actif.
- **Accès sans renonciation :** différé de 14 jours. Ce choix reste **à valider par un juriste**, en particulier avec l'abonnement, puisque le premier mois est payé avant l'ouverture.

### Encore à décider ou à fournir

1. **Accompagnement** : format, durée, délai, limites et part du prix.
2. **Informations d'entreprise** :
   - identité (forme, nom, adresse, SIREN, RCS ou RNE, directeur de la publication) ;
   - régime de TVA ;
   - médiateur de la consommation ;
   - coordonnées de l'hébergeur ;
   - adresse e-mail professionnelle.
3. **Relecture** : la formation par toi ; les CGV par un juriste, notamment l'article « abonnement, renouvellement et résiliation », l'information avant renouvellement et les remboursements.
4. **Stripe :** ajouter 4 événements à la destination webhook (voir `docs/paiement-et-acces.md`).

Quand une décision est prise, je mets à jour `src/data/conditions.json`, `src/data/site.json` ou `src/data/formation.json`. Le serveur lève ensuite le blocage correspondant.

## 3. Variables à saisir dans Netlify (Project configuration > Environment variables)

Ne colle jamais ces valeurs dans une conversation. Saisis-les seulement dans Netlify, sur un site **de test** (pas sur le site public), puis redéploie.

**État au 2 novembre 2026 :** les 6 variables sont en place sur `aurevia-saas-test`. Les trois clés (Stripe et Brevo) sont marquées secrètes : avec l'offre gratuite de Netlify, il faut choisir « Different value for each deploy context » et saisir la valeur dans « Production ».

| Variable | Où la trouver | Exemple de forme |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe, **mode test** : Développeurs > Clés API > clé secrète | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe, mode test : Développeurs > Webhooks > ajouter `https://TON-SITE/api/paiement/webhook` avec les 5 événements de `docs/paiement-et-acces.md`, puis « secret de signature » | `whsec_…` |
| `BREVO_API_KEY` | Brevo : SMTP & API > Clés API | `xkeysib-…` |
| `EMAIL_EXPEDITEUR` | Une adresse **validée** dans Brevo : Expéditeurs, domaines et IP > ajouter un expéditeur, puis cliquer sur le lien reçu. Il vaut mieux authentifier ton domaine (DKIM et DMARC) : une adresse Gmail comme expéditeur est souvent rejetée ou classée en indésirables. | `contact@ton-domaine.fr` |
| `SITE_URL` | L'adresse du site de test | `https://….netlify.app` |
| `SEL_EMPREINTE` | Déjà en place | — |

Sans clé `sk_live_`, aucun paiement réel n'est possible. Même avec une clé `sk_live_`, le serveur refuse tant que toutes les conditions ne sont pas remplies.
