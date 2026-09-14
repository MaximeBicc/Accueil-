# Liens v2 — Excel, auteurs, tris et suppression multiple

Cette version remplace l'interface reconstruite depuis les captures. Elle ne modifie pas le module Glossaire et ne nécessite pas de fusionner sa PR de reconstruction. Les fonctions Excel du glossaire sont adaptées aux périmètres personnel/commun ; le protocole AJAX est désormais JSON et chaque ligne obtient sa propre confirmation.

## Les quatre contenus à installer

| Fichier du dépôt | Destination XWiki | Action |
| --- | --- | --- |
| `xwiki/TestPage/PAGE/Lien-test/WebHome.xwiki` | `TestPage.PAGE.Lien-test.WebHome` | Remplacer le contenu Wiki. |
| `xwiki/TestPage/PAGE/Liens/DATA/WebHome.xwiki` | `TestPage.PAGE.Liens.DATA.WebHome` | Remplacer le contenu Wiki de l'endpoint. |
| `xwiki/TestPage/PAGE/Liens/CODE/LiensExtension.js` | `TestPage.PAGE.Liens.CODE.LiensExtension` | Un objet **XWiki.JavaScriptExtension**, nom `Liens-v2`, avec ce code. |
| `xwiki/TestPage/PAGE/Liens/CODE/LiensExtension.css` | Même page `LiensExtension` | Un objet **XWiki.StyleSheetExtension**, nom `Liens-v2`, avec ce code. |

**Ce ne sont pas deux extensions à ajouter par-dessus les anciennes.** Sur `Lien-test`, retirer les anciens objets JavaScriptExtension (onglet, actions, pagination, popup…) et l'ancien objet StyleSheetExtension qui appartiennent à ce module. Ne pas supprimer les extensions du module Glossaire utilisées sur sa propre page. Ne pas charger `Liens.CODE.GlossaireExtension` en parallèle. La nouvelle page charge uniquement `Liens.CODE.LiensExtension`.

Pour ces nouveaux objets : **Utiliser cette extension = À la demande** et **Parser le contenu = Non**. Ne pas entourer le JavaScript de `{{velocity}}`. Pendant l'installation, désactiver le cache des extensions ; rétablir le cache ensuite et effectuer une actualisation complète du navigateur. Les pages `.xwiki` utilisent la syntaxe XWiki 2.1. Protéger les pages de code et DATA contre les modifications par les utilisateurs ordinaires.

La référence de la page d’extension doit correspondre exactement à `extensionRef` dans la page principale. Si votre création XWiki produit `TestPage.PAGE.Liens.CODE.LiensExtension.WebHome`, utiliser cette référence complète dans `extensionRef` et attacher la bibliothèque à cette même page. Le déplacement utilise la fabrique de requêtes du module Refactoring (API présente depuis XWiki 10.11) ; vérifier sa présence sur le wiki cible.

La classe existante reste `TestPage.PAGE.Liens.CODE.lienClass.WebHome`. Ses propriétés restent `nom_lien`, `lien`, `definition`, `type`, `proprietaire`. Aucune nouvelle XClass à créer. Tester d'abord sur un jeu de fiches de test : le bouton de suppression supprime réellement le document XWiki.

## Configuration du rôle et des auteurs

En haut de DATA, `managerGroup = 'XWiki.IVQ_Gestionnaires'` reprend le groupe actif des captures. Modifier cette valeur si le groupe réel porte un autre nom. **Manager signifie membre de ce groupe, y compris via les groupes imbriqués** : aucun raccourci fondé sur `edit`, `admin` ou `program` n'est utilisé pour attribuer ce rôle.

`authorWiki = 'xwiki'` reprend l'annuaire central visible sur les captures (`xwiki:XWiki.*`). Pour une installation utilisant exclusivement des comptes locaux, mettre l'identifiant de ce sous-wiki à la place. L'annuaire est unique : deux utilisateurs local/global portant le même identifiant ne doivent pas partager accidentellement les mêmes liens personnels. Un compte issu d'un autre annuaire est refusé avec `AUTHOR_DIRECTORY`, plutôt que confondu avec un homonyme.

La colonne Auteur contient l'**identifiant du profil XWiki**, par exemple `Alice.Durand`, pas « Alice Durand » ni `xwiki:XWiki.Alice.Durand`. Le profil doit exister et porter un objet `XWiki.XWikiUsers`. Une valeur vide à la création/import prend l'identifiant de la personne connectée. Les permissions XWiki ordinaires restent nécessaires en plus du rôle métier pour lire, créer, déplacer ou supprimer une fiche ; elles ne sont ni contournées ni réécrites par ce module.

| Opération | Non-manager | Manager |
| --- | --- | --- |
| Voir et rechercher les liens communs | Oui | Oui |
| Voir les personnels d'une autre personne | Non | Non |
| Modifier/supprimer ses propres personnels | Oui | Oui |
| Créer/importer du commun | Non | Oui |
| Modifier/supprimer le commun | Non ; aucune colonne Actions ni sélection | Oui |
| Choisir un autre auteur lors d'une création ou d'une modification autorisée | Non | Oui |

Ces règles sont vérifiées dans DATA sur chaque requête, pas seulement avec des boutons masqués. Le serveur vérifie aussi le type et le propriétaire **avant** modification : transformer frauduleusement un commun en personnel ne donne aucun droit à un non-manager. Les références hors de `LIENDATA` et les classes envoyées par le client ne sont pas acceptées comme cibles arbitraires.

## Excel et aperçu

Colonnes conseillées : **Acronyme | Libellé | Définition | Type | Auteur**. Les trois premières sont obligatoires, Type et Auteur sont facultatives. Trois colonnes seules, comme dans l'ancien glossaire, fonctionnent également.

Un en-tête est détecté dès qu'au moins un intitulé est reconnu ; les champs restants sont déduits par élimination. L'ordre des colonnes peut varier. La case « Première ligne = en-tête » et le mapping permettent de corriger la détection, notamment quand une première ligne de données contient elle-même le mot « Description » ou « Type ».

L'aperçu permet de choisir la feuille, de corriger les cinq champs, de retirer une ligne et de filtrer par **Tout / Personnel / Commun**. Type vide prend le type par défaut choisi dans l'aperçu ; Auteur vide prend l'auteur par défaut, initialement l'importateur. Pour un non-manager, seul son identifiant et le type personnel sont acceptés. Les lignes communes ou attribuées à un tiers restent visibles dans l'aperçu avec un motif, mais ne sont pas importées ; elles peuvent être corrigées ou retirées.

Les motifs précisent les doublons d'acronyme et de libellé, dans les liens existants ou dans le fichier. « Ajouter uniquement les nouveaux » refuse ces doublons ; « Ajouter selon les options » tient compte des deux cases d'acceptation indépendantes. Les doublons sont comparés **dans le même périmètre** : commun, ou personnel d'un même auteur. Le contenu personnel d'un tiers n'est jamais utilisé pour révéler l'existence d'un doublon. Une collision de nom technique peut donc être résolue par un suffixe sans dévoiler la fiche privée correspondante.

Les ajouts sont séquentiels, chaque résultat est confirmé par le serveur et immédiatement reporté dans l'interface, sans actualisation obligatoire. Un échec ne devient jamais un faux succès. Les lignes déjà confirmées sont verrouillées, ainsi que le mapping et les valeurs par défaut pour cet import, afin d'éviter de les réinitialiser accidentellement. Limites applicatives : **20 Mo par fichier**, **2 000 lignes de données par feuille**. Au-delà, scinder le fichier.

Le bouton **Exemple Excel** génère un modèle à cinq colonnes. La lecture utilise SheetJS 0.20.3 côté navigateur et ne transmet pas le classeur à un service tiers : seules les lignes sélectionnées sont envoyées à DATA. Par défaut, le JavaScript de la bibliothèque est chargé depuis le CDN SheetJS. Pour l'intranet, attacher **`xlsx.full.min.js` version 0.20.3** à la page `LiensExtension` : la page utilisera automatiquement cette pièce jointe à la place du CDN. Ne pas modifier globalement `window.define` : le chargement prend en charge RequireJS et son module nommé `xlsx`.

## Arborescence, renommage et changement d'auteur

Destination : **`TestPage.PAGE.Liens.DATA.LIENDATA.{auteur}.{acronyme}`**. Par exemple :

```text
LIENDATA.Alice.API  →  LIENDATA.Bob.API      changement d'auteur
LIENDATA.Bob.API    →  LIENDATA.Bob.REST     changement de nom
```

Les références sont construites avec l'API de modèle XWiki et une liste de segments, pas par évaluation de chaînes `${candidateName}`. Les caractères de chemin/substitution dangereux et les noms réservés sont refusés. Un point dans un acronyme reste un caractère du nom, correctement échappé par la référence XWiki.

Avant de créer ou renommer, les variantes terminale et imbriquée sont vérifiées. Une collision déjà présente conduit à `API_1`, `API_2`, etc. La destination n'est pas remplacée volontairement. Le déplacement natif travaille sur la fiche uniquement (`deep=false`), sans déplacer ni supprimer l'espace de l'auteur. Les anciens documents imbriqués `…Acronyme.WebHome` sont reconnus ; leurs éventuelles sous-pages ne sont pas déplacées avec la fiche. Ce module vise des fiches feuilles, pas des dossiers de documents.

Le job de renommage reste interactif afin de pouvoir **refuser une question d'écrasement** ; une question inattendue entraîne l'annulation, pas une approbation aveugle. La réponse AJAX indique un traitement en cours ; le navigateur interroge ensuite son état. Le serveur relit la destination et vérifie les anciennes valeurs avant d'enregistrer les nouvelles. En cas d'échec de cette sauvegarde, un retour arrière de localisation est tenté. Une opération partielle non récupérable produit `RECOVERY_REQUIRED` et impose une vérification manuelle.

Après succès, le serveur renvoie la référence et la version effectives : les modifications/suppressions suivantes utilisent donc le nouvel emplacement. Si un manager transfère un lien personnel à une autre personne, il disparaît de sa propre liste et de sa recherche de liens existants.

Ces précautions ne constituent pas une transaction distribuée entre plusieurs utilisateurs ou plusieurs nœuds XWiki : les collisions et modifications concurrentes doivent aussi être testées sur l'installation cible. Les ACL natives d'une fiche ne sont pas automatiquement remplacées lors du changement d'auteur.

## Suppression multiple, filtres et tri

Une case par ligne et une case d'en-tête permettent de sélectionner **tous les résultats filtrés, toutes pages confondues**. Le compteur indique le nombre exact de fiches sélectionnées. Changer d'onglet ou de filtre efface la sélection ; changer de page ou de tri la conserve. La confirmation liste les acronymes et auteurs. Les suppressions réussies disparaissent immédiatement ; les refus restent visibles avec leur message.

Les cinq colonnes de chaque onglet sont triables par clic sur leur en-tête : premier clic croissant, second décroissant. Le tri français ignore la casse et les accents et traite naturellement les nombres. L'ordre appliqué est **filtrage → tri → pagination**, y compris avec « Tout afficher ».

## Confidentialité et reprise après erreur réseau

DATA filtre les personnels d'un tiers **avant sérialisation**. Ils ne se trouvent ni dans l'HTML initial, ni dans le JSON de liste, ni dans le tableau de vérification de la fenêtre d'ajout. Une seconde barrière côté interface évite également leur affichage. Cela ne change pas rétroactivement les permissions des anciennes pages : pour interdire leur accès par URL directe, export ou recherche native XWiki, configurer les ACL adaptées dans le wiki.

Chaque écriture possède un identifiant de reprise lié à la session de l'utilisateur. Après perte de réponse, utiliser **Vérifier / reprendre**, et non recréer une fiche. Une écriture dont le résultat n'est pas certain bloque les écritures suivantes dans ce navigateur. Actualiser la liste est possible, mais ne signifie pas qu'une opération ambiguë a été résolue. Ne pas purger manuellement le stockage de reprise pour forcer une nouvelle écriture. Les reprises après expiration de session exigent une vérification manuelle des documents.

## Tests et réception sur XWiki

Exécutés lors de la préparation : **25 tests Node réussis**, dont un contrôle statique des garde-fous Velocity ; **6 scénarios Chromium réussis avec API et lecture Excel simulées** ; vérification syntaxique JavaScript réussie. Les tests navigateur portent sur le véritable code d'interface, pas sur une maquette séparée. Ils vérifient la confidentialité d'affichage, les restrictions non-manager, la sélection multi-pages avec échec partiel, les nouvelles références après déplacement, l'import de plusieurs lignes sans rechargement, l'affichage de texte non interprété comme HTML et la reprise d'une réponse non JSON.

```sh
node --check xwiki/TestPage/PAGE/Liens/CODE/LiensExtension.js
node --test tests/Liens.test.js
# pip install pytest playwright ; playwright install chromium
pytest -q tests/test_liens_browser.py
# Ou : LIENS_CHROMIUM=/usr/bin/chromium pytest -q tests/test_liens_browser.py
```

**Non exécuté ici : le Velocity dans le moteur XWiki, les véritables jobs de refactoring et la lecture d'un vrai classeur par la bibliothèque locale/CDN.** Réception à faire sur des fiches de test avant production :

1. Un compte avec droit edit/admin mais hors groupe manager doit être refusé en POST forgé sur un commun, y compris avec un type personnel envoyé ; tester auteur tiers, référence hors LIENDATA, autre wiki et CSRF absent.
2. Tester l'appartenance directe/imbriquée au groupe, l'annuaire global et les permissions de création dans chaque dossier auteur.
3. Importer un vrai `.xlsx` de plusieurs lignes, avec en-têtes permutées, valeurs Type/Auteur absentes, doublons acceptés/refusés et mélange commun/personnel.
4. Renommer, déplacer vers un autre auteur, puis modifier et supprimer la même fiche. Contrôler physiquement l'arbre, le titre, les cinq propriétés, la version, les pièces jointes et les ACL natives.
5. Tester nom déjà occupé en forme terminale et `WebHome`, nom avec point, `${candidateName}` refusé, changement concurrent de version et destination occupée durant le job.
6. Interrompre une réponse réseau pendant import/déplacement ; reprendre avec le même identifiant. Provoquer un refus de sauvegarde après déplacement et vérifier le retour arrière ou le signalement explicite de l'opération partielle.

Références techniques : [Refactoring XWiki](https://extensions.xwiki.org/xwiki/bin/view/Extension/Refactoring%20Module), [questions des jobs](https://extensions.xwiki.org/xwiki/bin/view/Extension/Job%20Module/Question), [SheetJS avec RequireJS](https://docs.sheetjs.com/docs/getting-started/installation/amd/).
