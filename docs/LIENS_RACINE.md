# Installer Liens sous une autre racine

Dans les **deux templates** — affichage et DATA — modifier uniquement cette ligne, placée en tête du fichier :

```velocity
#set($liensRoot = 'MonEspace.Liens')
```

Mettre exactement la même valeur dans les deux pages. Utiliser la référence de l’espace dans le wiki courant, sans préfixe de wiki, sans `.WebHome` à la fin et sans point final. Les noms d’espaces contenant des espaces sont pris en charge. La valeur livrée reste `TestPage.PAGE.Liens`.

Tous les chemins internes en découlent : service DATA, classe des fiches, classe et page des autorisations, page d’extensions, dossiers des utilisateurs et destinations de création ou de déplacement. Les listes d’espaces sont construites avec les références XWiki ; aucune liste `['TestPage', 'PAGE', ...]` ne reste à modifier.

## Pages et objets à installer

Pour la racine `MonEspace.Liens`, conserver cette structure :

| Élément | Destination XWiki |
| --- | --- |
| Contenu de `Lien-test/WebHome.xwiki` | `MonEspace.Liens.WebHome`, ou une autre page d’affichage choisie |
| Contenu de `Liens/DATA/WebHome.xwiki` | `MonEspace.Liens.DATA.WebHome` |
| Définition de la classe des fiches | `MonEspace.Liens.CODE.lienClass.WebHome` |
| Définition de la classe des autorisations | `MonEspace.Liens.CODE.liensConfigurationClass.WebHome` |
| Objet des autorisations | `MonEspace.Liens.CODE.Configuration.WebHome` |
| Objets JavaScript Extension et StyleSheet Extension | `MonEspace.Liens.CODE.GlossaireExtension` |
| Fiches | `MonEspace.Liens.DATA.LIENDATA.<userid>.<identifiant>` |

Changer la variable **ne copie ni les pages ni leurs objets**. Copier ou déplacer la structure XWiki complète, puis adapter la racine dans les deux contenus. Les classes et extensions doivent être installées avant de créer ou d’importer des fiches.

La page d’affichage peut rester hors de cette structure, notamment sur l’ancien `Lien-test`. Le formulaire de paramètres transmet sa référence réelle pour y revenir après un enregistrement sans JavaScript. En l’absence de cette information, DATA revient sur `<racine>.WebHome` ; les retours sont limités au même wiki. Les rechargements JavaScript restent sur la page courante.

## Champs absents, personnel invisible et expressions Velocity affichées

XWiki renvoie `null` lorsqu’une propriété n’existe pas sur un objet. Les templates transforment maintenant les valeurs lues en chaînes avant de les afficher et utilisent des références silencieuses pour l’échappement. Une cellule sans définition reste vide ; elle n’affiche plus `$escapetool.html(...)` et ne reprend pas la valeur de la ligne précédente, y compris sous Velocity 1.7.

Si `proprietaire` est vide sur une ancienne fiche, le propriétaire peut être retrouvé depuis le dernier dossier de **`<racine>.DATA.LIENDATA.<userid>`**. Le parent complet doit correspondre à cette racine, avec un seul dossier d’utilisateur. Un propriétaire déjà renseigné reste prioritaire. Personnel conserve le contrôle d’identité et les droits natifs : les personnels d’autres utilisateurs ou d’un autre emplacement ne sont pas ouverts par ce repli. L’affichage, la popup, DATA et les opérations utilisent la même règle ; un enregistrement renseigne le propriétaire récupéré dans l’objet.

Avant une création ou une modification, le module contrôle que la définition de classe existe et que ses cinq propriétés sont actives. Une classe incomplète provoque un message précisant son chemin et les champs concernés, avant toute création ou tout déplacement. La création vérifie aussi que les valeurs ont bien été affectées à l’objet avant l’enregistrement. Les personnes ayant l’écriture voient également un avertissement si la classe est incomplète.

Dans **Modifier → Classe** sur `<racine>.CODE.lienClass.WebHome`, conserver les noms techniques exacts, indépendamment des titres affichés dans les tableaux :

| Nom technique | Intitulé affiché | Propriété conseillée |
| --- | --- | --- |
| `nom_lien` | Liens | String |
| `lien` | Domaine | String |
| `definition` | Définition | TextArea |
| `type` | Type | String, ou liste simple conservant `personnel` / `commun` |
| `proprietaire` | Créateur / Auteur | String contenant le userid court |

Copier la définition complète de la classe d’origine est préférable à la recréer avec des noms de propriétés tirés des intitulés visibles. Ces intitulés n’ont pas renommé les propriétés XWiki. Le texte d’une définition qui n’a jamais été enregistré dans l’objet ne peut pas être reconstitué automatiquement ; après réparation de la classe, le renseigner en éditant la fiche.

## Objets JavaScript et CSS

Le contenu des scripts **00, 01, 02, 03, 04, 06 et 07**, ainsi que du CSS **05**, n’a pas de racine du module à modifier. L’affichage fournit les adresses et la classe aux scripts.

Il faut toutefois copier les objets `XWiki.JavaScriptExtension` et `XWiki.StyleSheetExtension` sur la nouvelle page `<racine>.CODE.GlossaireExtension`, avec leurs contenus et leurs paramètres. Copier uniquement le texte de la page XWiki ne suffit pas à installer ces objets.

Si les scripts sont regroupés dans un seul objet JavaScript Extension, conserver l’ordre 00, 01, 02, 03, 04, 06, 07. L’affichage charge automatiquement cette nouvelle page par `jsx.use` et `ssx.use`. Recharger ensuite avec Ctrl + F5.

## Tableaux vides après déplacement

Les listes recherchent les objets de **`<racine>.CODE.lienClass.WebHome`**. Les requêtes utilisent un paramètre de classe pour prendre en charge les noms d’espaces contenant des espaces.

Dans XWiki, vérifier une fiche créée au nouvel emplacement avec **Modifier → Objets** :

- Elle doit porter un objet de la nouvelle classe, par exemple `MonEspace.Liens.CODE.lienClass.WebHome`.
- Cet objet doit conserver les champs `nom_lien`, `lien`, `definition`, `type` et `proprietaire`, avec les propriétés de la classe d’origine.
- Le propriétaire reste le `userid` court et le type vaut `personnel` ou `commun`.

Déplacer une fiche dans un autre dossier ne garantit pas que son objet utilise la nouvelle classe. Une fiche restée attachée à `TestPage.PAGE.Liens.CODE.lienClass.WebHome` ne correspond pas à la classe de la nouvelle installation. Corriger ou migrer la référence de classe des objets en conservant leurs valeurs. Copier la définition de classe complète, avec ses propriétés, et pas seulement le contenu de sa page.

La même règle s’applique aux autorisations : l’objet de `<racine>.CODE.Configuration.WebHome` doit utiliser `<racine>.CODE.liensConfigurationClass.WebHome`. Installer cette classe et ses cinq champs décrits dans [LIENS_DROITS.md](LIENS_DROITS.md), puis enregistrer les droits dans Paramètres.

| Symptôme | Points à vérifier |
| --- | --- |
| Tableaux sans fiches | Même racine dans les deux pages, classe des objets, valeurs Type/Propriétaire, droits de lecture fonctionnels et droits natifs XWiki |
| Boutons inactifs ou présentation absente | Objets JS/CSS sur la nouvelle page d’extensions, ordre des scripts et cache du navigateur |
| Création possible mais fiche absente de la liste | Classe réellement utilisée sur la fiche et classe attendue par l’affichage identiques |
| Erreur lors de l’enregistrement | Page DATA à la destination dérivée, définitions de classe complètes et droits natifs sur la nouvelle structure |

Les racines de deux installations produisent deux références de classe et de configuration différentes. Les données de l’ancienne installation ne sont pas migrées automatiquement vers la nouvelle.

## Vérification

Après installation, créer une fiche et contrôler son affichage, la modifier, importer un fichier Excel, ouvrir Paramètres et tester les onglets avec les comptes concernés. Les requêtes d’enregistrement doivent cibler la nouvelle page `<racine>.DATA.WebHome`.

La validation du dépôt couvre deux racines différentes, dont une contenant des espaces, avec création manuelle et DATA, affichage, liste visible, changement d’auteur, suppression, classes distinctes, chargement des extensions et retour des paramètres. Chromium vérifie aussi l’édition, l’import XLSX et les paramètres vers le nouvel endpoint. Ces tests utilisent une API XWiki simulée ; ils ne remplacent pas la vérification des objets et droits sur l’instance.
