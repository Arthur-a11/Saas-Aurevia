# AUREVIA SAAS : état et décisions avant l'ouverture des ventes

Mis à jour le 1er novembre 2026, sur la branche `espace-formation`. **Le site public n'est pas modifié.**

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
| Mot de passe oublié | Prêt, mais **bloqué tant que Brevo n'est pas connecté** (message honnête) | Brevo **simulé** : jeton à usage unique, valable 30 min, même réponse pour une adresse inconnue |
| E-mails (inscription, compte, commande, réinitialisation, rétractation) | Prêts, **Brevo à connecter**. Le site distingue « accepté par Brevo », « échec » et « non configuré ». Il n'écrit jamais « reçu ». | Brevo **simulé**, panne comprise |
| Paiement Stripe (mode test) | Prêt, **Stripe à connecter** (clés de test) | Stripe **simulé** : 3 formules, refus, annulation, notification en retard ou en double, remboursement, montant falsifié |
| Ouverture immédiate ou différée, durée d'accès | Prêtes, réglables dans `src/data/conditions.json` | Tests des deux options et de « 12 mois » |
| Blocage des ventes réelles | **Actif côté serveur** : aucun paiement réel ne peut être créé (22 conditions contrôlées, 23 pour Accompagné) | Tests : refus même si les ventes sont forcées à « actives » |
| Informations légales | **À fournir** (liste ci-dessous). Les emplacements « à compléter » sont prêts : tarifs, commande, e-mail de confirmation, CGV. | Test : « à compléter » affiché |
| Vrais Stripe et Brevo, même en mode test | **Non testés** : aucun compte connecté | — |

## 2. Les décisions qui t'attendent (une seule liste)

1. **Différences entre les offres.** Aujourd'hui :
   - les 3 formules donnent les 6 modules (leçons, exercices, checklists, fiches) et les vidéos (encore à tourner) ;
   - Complet ajoute les modèles et la communauté (qui n'existe pas encore) ;
   - Accompagné ajoute ton avis (non défini).

   La seule différence qui existe vraiment est **les 6 modèles** (+10 € pour Complet). Proposition à valider (rien n'est modifié sans ton accord) :
   - Essentiel 14,90 € : leçons + fiches ;
   - Complet 24,90 € : + exercices corrigés + modèles + checklists ;
   - Accompagné 54,90 € : + une relecture écrite de ta part (voir le point 4).
   Ou bien garder l'accès commun et retirer la communauté tant qu'elle n'existe pas.
2. **Durée d'accès** : à vie (« tant que le service existe ») ou 12 mois ?
3. **Achat unique** (affiché aujourd'hui, aucun abonnement créé) : à confirmer.
4. **Accompagnement**. Il faut préciser :
   - le format (par exemple un retour écrit sur ta fiche MVP et ta page de tarifs) ;
   - la durée (par exemple une relecture) ;
   - le délai (par exemple 7 jours ouvrés) ;
   - les limites (par exemple un seul projet, pas de garantie de résultat) ;
   - la part du prix qui correspond au service.
5. **Accès sans renonciation** : différé de 14 jours (actuel) ou immédiat en gardant le droit de rétractation ? À décider avec un juriste (voir `docs/juridique-acces.md`).
6. **Informations d'entreprise** à fournir :
   - forme juridique, nom, adresse du siège, SIREN, immatriculation (RCS ou RNE), directeur de la publication ;
   - régime de TVA (franchise ou TVA facturée) ;
   - médiateur de la consommation (nom, site, adresse) et son contrat ;
   - hébergeur (Netlify : adresse et contact à confirmer) ;
   - adresse e-mail professionnelle pour le contact et l'expédition. Aujourd'hui, le site affiche ton adresse Gmail personnelle comme contact ; une adresse sur ton domaine est préférable.
7. **Relecture** : la formation par toi, les CGV et les règles de rétractation par un juriste.

Quand une décision est prise, je mets à jour `src/data/conditions.json`, `src/data/site.json` ou `src/data/formation.json`. Le serveur lève ensuite le blocage correspondant.

## 3. Variables à saisir dans Netlify (Project configuration > Environment variables)

Ne colle jamais ces valeurs dans une conversation. Saisis-les seulement dans Netlify, sur un site **de test** (pas sur le site public), puis redéploie.

| Variable | Où la trouver | Exemple de forme |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe, **mode test** : Développeurs > Clés API > clé secrète | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe, mode test : Développeurs > Webhooks > ajouter `https://TON-SITE/api/paiement/webhook` avec les 5 événements de `docs/paiement-et-acces.md`, puis « secret de signature » | `whsec_…` |
| `BREVO_API_KEY` | Brevo : SMTP & API > Clés API | `xkeysib-…` |
| `EMAIL_EXPEDITEUR` | Une adresse **validée** dans Brevo : Expéditeurs, domaines et IP > ajouter un expéditeur, puis cliquer sur le lien reçu. Il vaut mieux authentifier ton domaine (DKIM et DMARC) : une adresse Gmail comme expéditeur est souvent rejetée ou classée en indésirables. | `contact@ton-domaine.fr` |
| `SITE_URL` | L'adresse du site de test | `https://….netlify.app` |
| `SEL_EMPREINTE` | Déjà en place | — |

Sans clé `sk_live_`, aucun paiement réel n'est possible. Même avec une clé `sk_live_`, le serveur refuse tant que toutes les conditions ne sont pas remplies.
