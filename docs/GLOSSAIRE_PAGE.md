# Glossaire : installation et vérifications

Les fichiers du dépôt sont à copier dans les pages et extensions XWiki correspondantes. Une modification sur GitHub ne met pas automatiquement à jour le wiki.

## Fichiers à mettre à jour ensemble

| Fichier du dépôt, sous `xwiki/TestPage/PAGE/Glossaire/` | Destination XWiki |
| --- | --- |
| `WebHome.xwiki` | Contenu de `TestPage.PAGE.Glossaire.WebHome`, syntaxe XWiki 2.1 |
| `DATA/WebHome.xwiki` | Contenu de `TestPage.PAGE.Glossaire.DATA.WebHome`, syntaxe XWiki 2.1 |
| `CODE/GlossaireExtension.css` | StyleSheet Extension de `TestPage.PAGE.Glossaire.CODE.GlossaireExtension` |
| `CODE/GlossaireExtension.js` | JavaScript Extension de `TestPage.PAGE.Glossaire.CODE.GlossaireExtension` |
| `CODE/GlossairePageExtension.js` | JavaScript Extension de `TestPage.PAGE.Glossaire.CODE.GlossairePageExtension` |

Conserver la classe `TestPage.PAGE.Glossaire.CODE.glossaireClass.WebHome` et ses champs `acronyme`, `libelle`, `definition`. La page charge explicitement ses extensions. Si les extensions JavaScript sont parsées par Velocity, conserver ce réglage.

Le serveur renvoie maintenant du texte brut et encode les références avec `escapetool.url`. Les extensions JavaScript décodent ces références : installer les fichiers serveur et client ensemble, puis recharger le navigateur sans cache.

## Corrections

- Barre à gauche du titre : même pseudo-élément que l'accueil et les contacts, largeur de 3 px, extrémités arrondies, bleu sur 78 % de la hauteur puis rouge. Le rendu HTML utilise `clean="false"`, comme ces deux pages ; les valeurs saisies sont échappées avant leur insertion dans le HTML.
- Renommage : requête XWiki explicite avec `setAutoRedirect(false)`, mise à jour des liens internes et absence d'interaction avec le job. Un succès exige que la destination existe avec son objet glossaire et que l'ancienne page ait disparu.
- Suppression : un job absent ou une page encore présente produit une erreur. Le navigateur conserve alors la ligne, y compris en suppression multiple.
- Les tableaux principal et de vérification utilisent la nouvelle référence après renommage. Les références contenant un point, un guillemet, un antislash ou `|` sont conservées correctement.
- Les filtres lisent les textes affichés et sont recalculés après une modification. Les doubles clics sur « Enregistrer » ne lancent plus deux requêtes concurrentes.
- La création vérifie POST, CSRF, champs obligatoires, droits et disponibilité du nom. L'épuisement des 100 noms candidats ne crée plus une page avec une référence invalide.
- Les opérations sur une fiche sont limitées aux documents de DATA portant la classe glossaire, avec vérification des droits.
- Les mots comme `constructor`, `toString` et `__proto__` ne sont plus considérés à tort comme des doublons Excel.

## Anciennes pages restées après un renommage

Ce correctif empêche la création de nouvelles pages de redirection. Il ne supprime pas les anciennes pages déjà présentes sur le wiki.

Dans XWiki, vérifier chaque ancienne page avant de la supprimer : une redirection créée par le renommage porte un objet `XWiki.RedirectClass` pointant vers la nouvelle fiche. Conserver toute page contenant des données utiles. Supprimer uniquement les anciennes redirections confirmées, puis vérifier l'arborescence. Aucun nettoyage des données existantes n'est exécuté par les tests.

## Tests automatisés

Prérequis : Node.js, Playwright avec Chromium, Java 17 ou supérieur, et les JAR Velocity Engine 2.3, Commons Lang 3.17.0 et SLF4J API 1.7.36 dans un répertoire de test.

```sh
node tests/Accueil-Tracking.test.js
java -cp '/chemin/vers/jars/*' tests/GlossaireVelocityTest.java /tmp/glossaire-rendered.html
node tests/Glossaire.browser.test.js /tmp/glossaire-rendered.html
```

Le test Velocity exécute les templates du dépôt avec une API XWiki simulée : renommage suivi de suppression, collisions, échecs de jobs, droits, CSRF, créations invalides, saturation des noms, échappement HTML et import avec doublons. Le test navigateur utilise ce HTML et les véritables extensions : barre sur ordinateur/mobile, mise à jour des références, filtres, erreurs HTTP, double enregistrement, import, suppression multiple et pagination.

Le test d'accueil a été adapté à la version actuelle du suivi (`v5.4`, XMLHttpRequest). Il vérifie le suivi, la limitation des comptages répétés, l'exclusion des prévisualisations et l'affichage de l'historique récent.

Résultat de la validation : **21 vérifications Velocity, 17 vérifications navigateur et test d'accueil réussis** ; les **16 fichiers JavaScript** de `xwiki/` et `preview/` passent la vérification de syntaxe. Les captures du navigateur sont enregistrées à côté du HTML généré.

Ces tests ne remplacent pas un essai sur l'instance XWiki, notamment pour ses droits et extensions installées.

## Vérification après installation sur le wiki

1. Ajouter un terme de test puis changer son acronyme. Vérifier qu'une seule fiche existe dans DATA et que l'ancienne adresse n'est plus une page de redirection.
2. Renommer vers un acronyme déjà utilisé : la fiche existante doit être conservée et la nouvelle référence doit recevoir un suffixe disponible.
3. Supprimer la fiche renommée et vérifier le tableau, la modale et l'arborescence après rechargement.
4. Modifier un texte avec un filtre actif, importer quelques lignes avec doublons, puis essayer la suppression multiple.
5. Vérifier le titre sur ordinateur et mobile, et les messages d'erreur avec un utilisateur sans les droits requis.
