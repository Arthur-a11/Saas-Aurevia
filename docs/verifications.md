# Vérifications, sources et points ouverts

Mis à jour le 1er novembre 2026.

## 1. Récupération du site

- **Source** : l'artifact claude.ai « AUREVIA SAAS – Apprenez à créer un SaaS » (version du 31/10/2026), sauvegardé intact dans `original/creation-sas.html` (empreinte SHA-256 `3045ce54…99aff60`).
- **Introuvables** dans le dossier de travail et sur la machine : `creation-sas.html` (fichier local d'Arthur), `presentation-saas.mp4` et `generer-video.py`.

## 2. Données d'idées

- Le contrôle automatique (`npm run donnees:verifier`) confirme : **15 marchés, 300 niches, 1 500 idées**, au format « Nom : description ». Toutes les descriptions sont identiques à l'original, à la même place.
- **22 noms renommés** pour supprimer les doublons exacts et les quasi-doublons (simple pluriel). Le nom d'origine est conservé dans le champ `nomOriginal`. Exemples : `PlanGardes` → `GardesSoignants`, `SuiviProgrès` (Soutien scolaire) → `ProgrèsParents`, `SuiviFlotte` (Taxis et VTC) → `SuiviVTC`. La liste complète est dans `scripts/construire-donnees.mjs`.
- **12 phrases « pourquoi ce marché »** contenaient des chiffres ou des classements non sourcés (« environ 17 % par an »…). Elles sont remplacées par des phrases descriptives. Le texte d'origine est conservé dans `pourquoiOriginal`.
- **Non corrigé** (choix laissé à Arthur) : 7 niches figurent dans deux marchés (Promoteurs, Diagnostiqueurs, Notaires, Rénovation énergétique, Emballages, Télétravail, Paie des petites équipes). Certaines « niches » sont des fonctions plutôt que des publics (Suivi de chantier, Traçabilité, Mots de passe…). Elles ont été gardées telles quelles pour ne pas dénaturer le catalogue.
- **Non vérifiable ici** : la disponibilité des noms comme marques. L'avertissement INPI/EUIPO est affiché sur chaque page d'idées.

## 3. Points juridiques

Les sites officiels (Légifrance, economie.gouv.fr, PayPal) **étaient inaccessibles depuis l'environnement de travail** (réseau bloqué). Les points ci-dessous viennent de résultats de recherche et doivent être confirmés par un juriste sur les textes officiels.

| Sujet | Ce qui a été retenu | Où c'est appliqué |
|---|---|---|
| Rétractation, contenus numériques | Exception de l'article L221-28, 13° : il faut l'accord exprès du consommateur et son renoncement exprès, puis une confirmation sur support durable (L221-13). Sans cet accord, le droit de rétractation reste entier. | Case facultative sur `/commande/`, textes exacts conservés avec la commande, e-mail de confirmation obligatoire (la commande est refusée si l'e-mail ne peut pas partir). |
| Rétractation, service (formule Accompagné) | Exécution pendant le délai sur demande expresse ; en cas de rétractation, montant proportionnel au service fourni (L221-25) ; exception si le service est entièrement exécuté avec accord et renoncement (L221-28, 1°). | Case séparée sur `/commande/`, article 8 des CGV. |
| Fonction de rétractation en ligne | Directive (UE) 2023/2673, transposée par l'ordonnance n° 2026-2 et le décret n° 2026-3 du 5 janvier 2026, en vigueur depuis le **19 juin 2026** (source : cabinets d'avocats, non confirmée sur Légifrance). Elle exige une fonction dédiée et gratuite, avec accusé de réception. **Le libellé exact imposé est à vérifier.** | Formulaire « Se rétracter du contrat ici » sur `/retractation/`, demande horodatée, accusé de réception par e-mail une fois Brevo connecté. |
| Médiateur de la consommation | Obligatoire pour toute vente à des consommateurs (L612-1), avec un médiateur référencé et un contrat préalable. Ses coordonnées doivent figurer sur le site et dans les CGV. | Champ « à compléter » dans les CGV. **Bloquant avant d'ouvrir les ventes.** |
| Prix | Pour des particuliers, prix TTC, ou mention « TVA non applicable, art. 293 B du CGI » en franchise. | `regimeTva` dans `site.json`. Rien n'est affirmé tant que ce n'est pas confirmé. |
| Cookies et mesure d'audience | Aucun cookie ni traceur aujourd'hui, donc pas de bandeau nécessaire. Selon les sources, la liste CNIL des outils exemptés n'existe plus depuis 2026 : chaque éditeur doit vérifier lui-même que son outil remplit les conditions. | Statistiques désactivées par défaut. |
| Polices Google | Le transfert d'adresse IP vers Google est supprimé : les polices sont hébergées sur le site. | `public/fonts/`. |
| « Le plus choisi » | Allégation de preuve de ventes impossible à justifier. | Remplacée par « Notre recommandation ». |

Sources consultées (résultats de recherche) : Village Justice (Élodie Kalfon, avocate) sur l'ordonnance 2026-2 ; HLC avocats ; Trusted Shops ; economie.gouv.fr (FAQ médiation, via extraits) ; entreprendre.service-public.gouv.fr (fiche F33338, via extraits) ; conditions PayPal.Me (paypal.com/fr, via extraits) ; CNIL, fiche n°16 sur la mesure d'audience (via extraits).

## 4. Paiement par PayPal.me

- Lien communiqué : `https://paypal.me/LeloupArthur`. **Non vérifié** : paypal.com était inaccessible depuis l'environnement de travail.
- D'après les conditions PayPal.Me (extraits) : un lien peut être « personnel » ou « commercial ». Les paiements pour des biens ou services reçus sur un lien personnel peuvent être requalifiés, avec des frais appliqués rétroactivement. PayPal recommande un **compte professionnel** pour vendre.
- Un lien PayPal.me ne crée **ni commande, ni facture, ni confirmation, ni accès automatique**. Le site est donc conçu ainsi : commande enregistrée avec les accords → e-mail de confirmation → paiement PayPal → vérification manuelle par Arthur → accès envoyé par e-mail.
- Pour automatiser : Stripe Payment Links ou PayPal Checkout (compte professionnel) avec un webhook, à ajouter plus tard.

## 5. Ressources des formules

Aucune vidéo, fiche, modèle ni communauté n'a été trouvé dans les fichiers fournis. Tous ces éléments sont affichés **« En préparation »** et les commandes restent fermées.

## 6. Tests exécutés

Voir la sortie de `npm test`. Au 1er novembre 2026 :

- contrôle des données : réussi ;
- 17 tests unitaires : réussis ;
- tests Playwright sur ordinateur et mobile : tous réussis, sauf un test volontairement ignoré sur mobile (alignement des cartes de tarifs, empilées sur mobile).

**Non testé** : les vrais envois d'e-mails (pas de compte Brevo), les vraies réponses de l'IA (pas de clé), la publication sur Netlify et Netlify Blobs (pas de compte), et le rendu sur de vrais iPhone ou Android (seulement en émulation Chromium).

## 7. Passe qualité du 1er novembre 2026 (point de départ : étiquette Git `depart-amelioration-qualite`)

Défauts trouvés et corrigés, chacun couvert par un test :

| Priorité | Défaut | Correction |
|---|---|---|
| 1 | Un même e-mail renvoyé créait plusieurs inscriptions (et plusieurs rétractations) | Détection des doublons sur 24 h par empreinte non réversible ; même référence renvoyée |
| 1 | Aucun garde-fou contre les envois automatiques rapides | Refus des envois faits moins de 1,5 s après l'ouverture du formulaire |
| 1 | Délai de l'IA (25 s) supérieur à la limite des fonctions Netlify (10 s) | 8 s par défaut, plafonné à 9 s, sans nouvelle tentative |
| 1 | Une clé API suffisait à activer l'IA payante | Activation explicite obligatoire (`ASSISTANT_IA=active`) |
| 1 | Aucun délai côté navigateur : un serveur muet bloquait le formulaire | 15 s (formulaires) et 12 s (assistant), puis parcours de secours |
| 1 | Les journaux d'erreur pouvaient contenir des données personnelles | Seul le type d'erreur est journalisé |
| 1 | Un corps de requête trop gros était lu avant d'être refusé | Refus immédiat d'après la taille annoncée |
| 2 | Impossible de chercher dans les 1 500 idées | Explorateur : recherche sans accents, filtre par marché, compteur, état vide, favoris, copie |
| 2 | Page de marché très longue sur téléphone (15 boutons sur un écran entier) | Rangées défilantes, cartes compactes, filtre interne |
| 2 | Un lien vers un module du programme ne l'ouvrait pas | Sommaire, ouverture automatique, « Tout ouvrir / Tout fermer » |
| 3 | « 1 500 » affiché « 1500 » (espace fine absente de la police) | Espace insécable classique partout |
| 3 | Boutons « Favori » mal nommés pour les commandes vocales (WCAG 2.5.3) | Nom « Favori : idée » + `aria-pressed` |
| 3 | Animation de la grille repeinte à chaque image | Calque déplacé par `transform` |
| 3 | Pas d'image d'aperçu de partage | `public/partage.png` (1200 × 630, 41 Ko), active quand `SITE_URL` est connu |

Doublons de noms d'idées : les 22 renommages de la reconstruction restent tracés (`nomOriginal`). Les paires encore proches (`PlanCours`/`PlanCourse`, `SuiviLits`/`SuiviLots`…) sont des mots différents et ont été conservées. Aucune idée n'a été ajoutée.

Vérifié dans un vrai navigateur (Chromium), à 375, 768 et 1280 px : aucun débordement horizontal sur les pages clés et aucune erreur dans la console.

Non vérifiable ici : rendu sur de vrais iPhone et Android, lecteurs d'écran réels (NVDA, VoiceOver), fonctions sur les serveurs Netlify réels.
