# Glossaire : installation et vérifications

Les fichiers du dépôt sont à copier dans les pages et extensions XWiki correspondantes. Une modification GitHub ne met pas automatiquement le wiki à jour. Les classes, groupes, permissions et propositions sont détaillés dans [GLOSSAIRE_VALIDATION.md](GLOSSAIRE_VALIDATION.md).

## Fichiers à installer ensemble

| Fichier sous `xwiki/TestPage/PAGE/Glossaire/` | Destination XWiki |
| --- | --- |
| `WebHome.xwiki` | Contenu de `TestPage.PAGE.Glossaire.WebHome`, syntaxe XWiki 2.1 |
| `DATA/WebHome.xwiki` | Contenu de `TestPage.PAGE.Glossaire.DATA.WebHome`, syntaxe XWiki 2.1 ; tous les traitements serveur |
| `CODE/GlossaireExtension.css` | StyleSheet Extension de `TestPage.PAGE.Glossaire.CODE.GlossaireExtension` |
| `CODE/GlossaireExtension.js` | JavaScript Extension de `TestPage.PAGE.Glossaire.CODE.GlossaireExtension` |
| `CODE/GlossairePageExtension.js` | JavaScript Extension de `TestPage.PAGE.Glossaire.CODE.GlossairePageExtension` |

Conserver la classe `TestPage.PAGE.Glossaire.CODE.glossaireClass.WebHome` et ses champs `acronyme`, `libelle`, `definition`. Compléter les classes de configuration et de proposition avant utilisation. Créer les conteneurs PROPOSITIONS et CORBEILLE et protéger leurs droits.

La page charge explicitement ses extensions. Si les JavaScript sont parsés par Velocity, conserver ce réglage. DATA reçoit toutes les actions ; aucune page COMMANDE ni extension GlossaireWorkflow n'est nécessaire. DATA renvoie du texte brut avec des valeurs encodées par `escapetool.url` ; installer client et serveur ensemble puis recharger sans cache.

## Comportement

- Le titre conserve la barre de 3 px, bleue sur 78 % de sa hauteur puis rouge, comme l'accueil et les contacts.
- Chaque nouvelle fiche a une référence technique indépendante du nom. Modifier l'acronyme met à jour les champs et le titre en conservant l'URL, sans créer de page résiduelle.
- La conversion des anciennes adresses est disponible manuellement dans Paramètres ; elle met à jour les liens internes sans redirection. Les anciennes fiches non converties restent modifiables avec leur référence actuelle.
- Les groupes reçoivent quatre niveaux cumulatifs : Lecture, Proposition, Ajout direct et Validation. Les deux niveaux supérieurs peuvent modifier et supprimer les acronymes publiés. Paramètres reste réservé aux administrateurs du wiki.
- L'import crée une proposition par ligne au niveau Proposition et publie directement à partir du niveau Ajout direct. Aperçu, corrections et options de doublons sont conservés.
- Une validation publie puis retire la proposition. Refus et suppression de proposition alimentent CORBEILLE, avec revalidation pendant sept jours. Les propositions expirées sont nettoyées à l'ouverture du glossaire.
- Les décisions utilisent une version attendue ; les références cibles et les permissions sont vérifiées côté serveur. Les auteurs et dates proviennent du serveur.
- Filtres, tri, pagination et tableau de vérification sont recalculés après une modification. Les doubles clics ne lancent pas deux sauvegardes concurrentes.
- Les références et textes spéciaux sont encodés et échappés. Les noms `constructor`, `toString` et `__proto__` ne sont pas traités comme des doublons Excel.

## Anciennes pages résiduelles

Les anciennes redirections déjà présentes ne sont pas supprimées automatiquement. Vérifier chaque ancienne page : une redirection XWiki porte un objet `XWiki.RedirectClass` pointant vers la nouvelle fiche. Conserver les pages contenant des données utiles et supprimer uniquement les redirections confirmées. La conversion des adresses porte uniquement sur les fiches ayant la classe glossaire.

## Tests automatisés

Prérequis : Node.js, Playwright avec Chromium, Java 17 ou supérieur, JAR Velocity Engine 2.3, Commons Lang 3.11 et SLF4J API 1.7.30. Le contrôle du parseur XWiki nécessite `org.xwiki.rendering:xwiki-rendering-wikimodel:16.10.17`.

```sh
node tests/Accueil-Tracking.test.js
java -cp '/chemin/vers/jars/*' tests/GlossaireVelocityTest.java /tmp/glossaire-rendered.html
java -cp '/chemin/vers/jars/*' tests/GlossaireXWikiParsingTest.java
node tests/Glossaire.browser.test.js /tmp/glossaire-rendered.html
node tests/GlossaireWorkflow.browser.test.js /tmp
```

Les tests Java utilisent un seul moteur Velocity à la fois ; ils peuvent aussi être exécutés avec Velocity 1.7 et ses dépendances Commons Collections et Commons Lang 2. Les tests simulent l'API XWiki, exécutent les templates complets, contrôlent le parsing réel puis chargent les extensions dans Chromium. Les captures sont enregistrées à côté du HTML généré.

Les vérifications couvrent les références fixes, niveaux et paramètres, imports, requêtes forgées, versions périmées, publications et reprises, corbeille, expiration, échappement HTML, filtres, erreurs réseau, doubles clics, pagination et suppressions multiples. Elles ne remplacent pas un essai sur l'instance, notamment pour ses ACL natives et ses extensions.

Validation de cette version : **266 contrôles serveur**, exécutés avec Velocity 1.7 et 2.3, **22 contrôles navigateur du glossaire**, **190 du circuit de propositions**, **13 contrôles des parseurs XWiki/Velocity**, le test d'accueil et la syntaxe des **16 fichiers JavaScript** passent. Les tests vérifient aussi que les titres saisis restent du texte, qu'une classe incomplète ne provoque pas la perte d'une proposition et que le premier paramétrage crée sa configuration, même avec un JavaScript chargé tardivement ou un envoi par formulaire natif.

## Vérification après installation

1. Ajouter un terme puis changer plusieurs fois son acronyme : une fiche et une URL fixe dans DATA.
2. Convertir une ancienne fiche via Paramètres, vérifier ses liens internes puis la modifier et la supprimer.
3. Tester les quatre niveaux et les requêtes directes avec un compte non autorisé ; vérifier également l'absence d'accès aux URL de données quand Voir est retiré.
4. Proposer, refuser, supprimer une proposition, revalider depuis la corbeille puis vérifier le nettoyage des données expirées.
5. Essayer l'import avec doublons, les filtres et la suppression multiple, puis vérifier la barre du titre et les formulaires sur mobile.
