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

La réponse DATA est désormais du texte brut avec des champs encodés par `escapetool.url`. Installer le serveur et les extensions JavaScript ensemble, puis recharger le navigateur sans cache.

## Corrections

- La barre de l'en-tête couvre le titre et le sous-titre : 3 px, extrémités arrondies, bleu `#173f98` sur 78 % puis rouge `#ef233c`, comme l'accueil. Un élément HTML explicite assure sa présence ; le rendu HTML utilise `clean="false"` et les valeurs dynamiques sont échappées.
- Les onglets, filtres et paginations sont initialisés quand le DOM est disponible, y compris si les extensions arrivent après `DOMContentLoaded`. Les filtres et commandes de pagination sont aussi raccordés par JavaScript.
- Les filtres lisent uniquement les textes affichés. Ils se combinent par ET dans chaque tableau. Le filtre Acronyme / Libellé de la fenêtre de création conserve sa logique OU.
- « Tout afficher » respecte les filtres. Le changement de taille revient à la première page, les flèches respectent les limites et une suppression recalcule le nombre de pages. Tri, modification et pagination réappliquent les filtres actifs.
- La fenêtre de vérification charge une seule liste et préserve les caractères spéciaux, les retours à la ligne et les références contenant `|`. Elle ne montre que les communs et les personnels de l'utilisateur courant, dès le rendu initial.
- Les enregistrements traitent les acronymes comme du texte. Les doubles enregistrements sont bloqués ; une erreur HTTP conserve la ligne. Annuler une modification restaure aussi le créateur. Le type reste visible si une autre ligne est encore en édition, et un changement Personnel / Commun recharge le bon onglet.
- Les déplacements utilisent une seule requête XWiki de renommage vers la référence finale, sans redirection. Un succès exige que la destination et son objet existent et que l'ancienne page ait disparu. La suppression ne retire la ligne qu'après confirmation que la page a été supprimée.
- La création manuelle vérifie POST, CSRF, champs, type, groupe gestionnaire, droits et disponibilité du nom. Le serveur protège également les actions DATA. Les groupes gestionnaires au singulier et au pluriel sont reconnus de la même manière dans la page et dans DATA.
- La suppression multiple et l'import gèrent les erreurs réseau et les doubles clics. Les mots `constructor` et `toString` ne sont plus considérés comme des doublons Excel. Le recalcul des largeurs n'observe plus ses propres écritures de styles.
- Les modales restent au-dessus du fond Bootstrap. Les identifiants dupliqués ont été retirés. Sur mobile, le défilement horizontal des tableaux conserve des champs de filtre utilisables.

## Tests

Prérequis : Java 17 ou supérieur, Velocity Engine 2.3, Commons Lang 3.17.0, SLF4J API 1.7.36, Node.js et Playwright avec Chromium. Le test navigateur utilise jQuery 3.7.1, Bootstrap 3.4.1 et SheetJS 0.20.3 réels, placés dans un répertoire d'assets : `liens-jquery.js`, `liens-bootstrap.js`, `liens-bootstrap.css`, `liens-sheetjs.js`.

```sh
java -cp '/chemin/vers/jars/*' tests/LiensVelocityTest.java /tmp/liens-rendered.html
node tests/Liens.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
```

Le navigateur utilise `/usr/bin/chromium` par défaut ; `CHROMIUM_PATH` permet de choisir un autre exécutable. Playwright doit être accessible à Node.js.

Résultat : **27 vérifications Velocity et 43 vérifications Chromium réussies**, avec vérification de syntaxe des sept extensions JavaScript. Le test serveur exécute les templates réels avec une API XWiki simulée. Le navigateur utilise le HTML produit, les extensions du dépôt et un endpoint DATA simulé. Il couvre les deux paginations, filtres, tri, affichage ordinateur/mobile, éditions, erreurs HTTP, suppressions, chargement tardif, lecture/import d'un vrai fichier XLSX et fonctions réservées aux gestionnaires.

## Vérifier après installation dans XWiki

1. Dans chaque onglet, filtrer plusieurs colonnes, changer la taille de page et choisir « Tout afficher ». Vérifier les résultats et les flèches.
2. Modifier une ligne avec un filtre actif, annuler une modification de créateur, puis changer le type avec un gestionnaire.
3. Créer un lien, renommer son acronyme et changer son auteur. Vérifier la destination dans LIENDATA, puis supprimer le lien et contrôler l'arborescence.
4. Essayer l'import Excel et la suppression multiple avec un gestionnaire et avec un utilisateur ordinaire.
5. Vérifier les fenêtres modales et la barre de l'en-tête sur ordinateur et mobile.

Aucun accès à l'instance XWiki n'a été utilisé pour cette validation. L'essai sur le wiki reste à effectuer, notamment pour ses droits, le service de refactoring et les extensions installées.
