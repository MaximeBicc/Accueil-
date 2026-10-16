# Page Liens : installation et validation

La page Liens se trouve dans `xwiki/TestPage/PAGE/Lien-test/`. Les données restent dans `TestPage.PAGE.Liens.DATA.LIENDATA.{auteur}` avec la classe existante `TestPage.PAGE.Liens.CODE.lienClass.WebHome`.

Les fichiers GitHub sont des sources à copier dans XWiki. Une modification du dépôt ne met pas automatiquement à jour le wiki.

## Installer les fichiers ensemble

| Source dans le dépôt | Destination |
| --- | --- |
| `xwiki/TestPage/PAGE/Lien-test/WebHome.xwiki` | Contenu de `TestPage.PAGE.Lien-test.WebHome`, syntaxe XWiki 2.1 |
| `xwiki/TestPage/PAGE/Liens/DATA/WebHome.xwiki` | Contenu de `TestPage.PAGE.Liens.DATA.WebHome`, syntaxe XWiki 2.1 |
| `xwiki/TestPage/PAGE/Lien-test/extensions/00-onglet.js` à `07-corrections-popup-selectize.js` | JavaScript Extensions du module Liens, dans l'ordre numérique |
| `xwiki/TestPage/PAGE/Lien-test/extensions/05-hide-type-column.css` | StyleSheet Extension du module Liens |

La page utilise `TestPage.PAGE.Liens.CODE.GlossaireExtension` pour charger le JavaScript et le CSS. Conserver cette destination existante. Si les scripts sont regroupés dans un seul objet JavaScript Extension, concaténer les sept fichiers `.js` dans l'ordre 00, 01, 02, 03, 04, 06, 07. Remplacer les anciens scripts plutôt qu'ajouter les nouvelles versions à côté. Si le module est installé dans une autre page CODE, adapter les deux appels `jsx.use` et `ssx.use` à cette destination.

Le paramétrage des droits Personnel et Commun est décrit dans [LIENS_DROITS.md](LIENS_DROITS.md). Installer sa classe de configuration avant le premier enregistrement dans Paramètres.

La réponse DATA est désormais du texte brut avec des champs encodés par `escapetool.url`. Installer le serveur et les extensions JavaScript ensemble, puis recharger le navigateur sans cache.

Pour les auteurs issus des groupes autorisés, mettre à jour ensemble les deux pages `WebHome.xwiki` (affichage et DATA), les JavaScript `01-actions-personnelles.js`, `02-actions-communes.js`, `06-glossaire-adaptation.js`, `07-corrections-popup-selectize.js` et le CSS `05-hide-type-column.css`, puis Ctrl + F5. Aucune nouvelle classe XWiki n'est requise. Le sélecteur utilise la ressource native `uicomponents/suggest/xwiki.selectize.js` et reste utilisable en liste native si l'enrichissement n'est pas disponible. Les auteurs des pages d'affichage et DATA doivent pouvoir lire les profils des membres pour charger leurs noms/prénoms.

## Corrections

- La barre de l'en-tête couvre le titre et le sous-titre : 3 px, extrémités arrondies, bleu `#173f98` sur 78 % puis rouge `#ef233c`, comme l'accueil. Un élément HTML explicite assure sa présence ; le rendu HTML utilise `clean="false"` et les valeurs dynamiques sont échappées.
- Les onglets, filtres et paginations sont initialisés quand le DOM est disponible, y compris si les extensions arrivent après `DOMContentLoaded`. Les filtres et commandes de pagination sont aussi raccordés par JavaScript.
- Paramètres est le dernier bouton à droite, comme dans le Glossaire. Les boutons Excel ont leur propre conteneur et ne remplacent pas Paramètres ; celui-ci reste présent pour un administrateur sans droit d'écriture.
- Les filtres lisent uniquement les textes affichés. Ils se combinent par ET dans chaque tableau. Le filtre Acronyme / Libellé de la fenêtre de création conserve sa logique OU.
- « Tout afficher » respecte les filtres. Le changement de taille revient à la première page, les flèches respectent les limites et une suppression recalcule le nombre de pages. Tri, modification et pagination réappliquent les filtres actifs.
- Les boutons A → Z utilisent les mêmes classes Bootstrap et la même icône XWiki `right` que le Glossaire. Le libellé avec son icône est rempli avant insertion et le bouton ne se comprime pas dans la cellule, sans modifier sa taille native. Le tri est disponible sur Acronyme, Libellé, Définition et, pour les communs, Créateur ; aucun bouton de tri n’est ajouté dans Type.
- La fenêtre de vérification charge une seule liste et préserve les caractères spéciaux, les retours à la ligne et les références contenant `|`. Elle ne montre que les communs et les personnels de l'utilisateur courant, dès le rendu initial.
- Les enregistrements traitent les acronymes comme du texte. Les doubles enregistrements sont bloqués ; une erreur HTTP conserve la ligne. Annuler une modification restaure aussi le créateur. Le type reste visible si une autre ligne est encore en édition, et un changement Personnel / Commun recharge le bon onglet.
- Les déplacements utilisent une seule requête XWiki de renommage vers la référence finale, sans redirection. Un succès exige que la destination et son objet existent et que l'ancienne page ait disparu. La suppression ne retire la ligne qu'après confirmation que la page a été supprimée.
- La création manuelle vérifie POST, CSRF, champs, type, droit d’écriture sur l’onglet, droits natifs et disponibilité du nom. Le serveur protège également les actions DATA. Les accès se règlent par groupe dans Paramètres ; les anciens groupes gestionnaires restent utilisés uniquement avant le premier enregistrement.
- La suppression multiple et l'import gèrent les erreurs réseau et les doubles clics. Les mots `constructor` et `toString` ne sont plus considérés comme des doublons Excel. Le recalcul des largeurs n'observe plus ses propres écritures de styles.
- Avec Écriture dans Commun, Auteur utilise les membres des groupes ayant Écriture dans Commun, sous-groupes inclus, pour l'édition et l'import. Les deux interfaces rechargent la même liste depuis DATA et le serveur vérifie encore l'appartenance lors de l'enregistrement. Un auteur Excel est rapproché de son identifiant ou de son prénom/nom dans les deux ordres, accents et casse ignorés, puis reste modifiable dans une liste. Une valeur sans correspondance suffisamment proche reste affichée en rouge. L'aperçu s'ouvre aussi si la liste est indisponible. Un ancien auteur de lien commun qui n'est plus membre d'un groupe autorisé doit être remplacé avant l'enregistrement.
- Les modales sont déplacées directement sous `document.body`, comme celles du Glossaire, pour sortir du contexte d’empilement du contenu XWiki et rester au-dessus du fond Bootstrap. Leurs couches suivent le thème Bootstrap, sans forcer une autre valeur de z-index. Les identifiants dupliqués ont été retirés. Sur mobile, le défilement horizontal des tableaux conserve des champs de filtre utilisables.

## Tests

Prérequis : Java 17 ou supérieur, Velocity Engine 2.3, Commons Lang 3.17.0, SLF4J API 1.7.36, Node.js et Playwright avec Chromium. Le test navigateur utilise jQuery 3.7.1, Bootstrap 3.4.1, SheetJS 0.20.3 et Tom Select 2.4.3 réels, placés dans un répertoire d'assets : `liens-jquery.js`, `liens-bootstrap.js`, `liens-bootstrap.css`, `liens-sheetjs.js`, `liens-tomselect.js` (distribution `tom-select.complete.min.js`), `liens-tomselect.css` (distribution `tom-select.default.min.css`). Le test du widget passe par un adaptateur jQuery exposant la même API que XWiki ; il ne charge pas le wiki complet.

```sh
java -cp '/chemin/vers/jars/*' tests/LiensVelocityTest.java /tmp/liens-rendered.html
node tests/Liens.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
node tests/Liens.permissions.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
```

Le navigateur utilise `/usr/bin/chromium` par défaut ; `CHROMIUM_PATH` permet de choisir un autre exécutable. Playwright doit être accessible à Node.js.

Résultat : **246 vérifications Velocity et 288 vérifications Chromium réussies**, avec vérification de syntaxe des sept extensions JavaScript. Le test serveur exécute les templates réels avec une API XWiki simulée. Le navigateur utilise le HTML produit, les extensions du dépôt et un endpoint DATA simulé. Il vérifie aussi le rendu du tri par rapport au bouton du Glossaire et la présence des six fenêtres au-dessus du fond noir dans un conteneur XWiki isolé. Il couvre les deux paginations, filtres, tri, affichage ordinateur/mobile, éditions, erreurs HTTP, suppressions, chargement tardif, lecture/import d'un vrai fichier XLSX et neuf combinaisons de droits Personnel/Commun et paramètres administrateur. Le test d'enregistrement reproduit l'URL invalide due au champ `action`, puis contrôle l'adresse exacte de DATA utilisée par le bouton corrigé. Les cas d'auteurs couvrent identifiant distinct du nom, faute, accents, référence XWiki, nom inversé, valeur vide, catalogue vide/absent, valeur inconnue en rouge, modification manuelle, menu natif et widget Tom Select, ainsi que l'appartenance aux groupes, l'édition avec rechargement de la liste et les refus serveur des auteurs retirés de leurs groupes ou supprimés après aperçu. Paramètres est vérifié avec et sans écriture, y compris sur mobile.

## Vérifier après installation dans XWiki

1. Dans chaque onglet, filtrer plusieurs colonnes, changer la taille de page et choisir « Tout afficher ». Vérifier les résultats et les flèches.
2. Modifier une ligne avec un filtre actif, annuler une modification de créateur, puis changer le type avec un compte autorisé à écrire dans Commun.
3. Créer un lien, renommer son acronyme et changer son auteur. Vérifier la destination dans LIENDATA, puis supprimer le lien et contrôler l'arborescence.
4. Essayer l'import Excel et la suppression multiple avec un compte en écriture puis un compte en lecture seule. Dans l'aperçu Excel, vérifier un auteur valide, un nom mal orthographié et une valeur vide ; modifier la sélection et contrôler l'identifiant enregistré.
5. Vérifier les fenêtres modales et la barre de l'en-tête sur ordinateur et mobile.

Aucun accès à l'instance XWiki n'a été utilisé pour cette validation. L'essai sur le wiki reste à effectuer, notamment pour ses droits, le service de refactoring et les extensions installées.
