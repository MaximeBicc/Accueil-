# Personnalisation de la page d'accueil

## Structure du projet

```text
xwiki/
├── Accueil/
│   └── WebHome.xwiki
└── extensions/
    ├── stylesheet/
    │   ├── Accueil-Base.css
    │   ├── Accueil-Modules.css
    │   ├── Accueil-Panneaux-Contact.css
    │   └── Accueil-Flux.css
    └── javascript/
        ├── Accueil-Modules.js
        ├── Accueil-Contact.js
        └── Accueil-Flux.js

preview/
├── index.html
└── Preview.css
```

### StyleSheet Extensions

1. `Accueil - Base`
2. `Accueil - Modules`
3. `Accueil - Panneaux & Contact`
4. `Accueil - Flux`

### JavaScript Extensions

1. `Accueil - Modules`
2. `Accueil - Contact`
3. `Accueil - Flux`

Le dossier `preview/` sert uniquement à simuler la page dans un navigateur.

---

## 1. Modules circulaires

Les données des modules sont dans `xwiki/Accueil/WebHome.xwiki` dans le bloc `nh-module-source`.

Chaque bloc `data-home-module` correspond à un cercle. `Accueil - Modules.js` détecte automatiquement leur nombre et recalcule la disposition.

Le centre de l'orbite affiche maintenant le symbole NAVAL GROUP en grand sous forme de SVG directement dans le HTML de la page. Aucun fichier image externe n'est nécessaire.

---

## 2. Compteur Documentation

Racine configurable :

```velocity
#set ($documentationRootSpace = 'Documentation')
```

Tous les descendants de cette racine sont parcourus, quelle que soit leur profondeur.

Pour chaque page, le compteur inspecte les XWiki Objects et la propriété String `type` :

```text
type = document   → compté
type = folder     → non compté
autre valeur      → non compté
pas de type        → non compté
```

La page racine est explicitement exclue et `count(distinct doc.fullName)` évite les doublons.

> La requête ne filtre pas encore par nom de XClass. Si plusieurs classes de ton wiki utilisent aussi une propriété `type`, il sera préférable d'ajouter le nom exact de la classe.

---

## 3. Compteur Formation

La logique Formation reste volontairement inchangée :

```velocity
#set ($formationRootSpace = 'Formation')
```

Toutes les pages descendantes sont comptées récursivement, en excluant le WebHome racine.

---

## 4. À la une

Le panneau `À la une` possède deux onglets :

### Derniers créés

Les 5 derniers documents créés sont récupérés automatiquement parmi les descendants de la racine Documentation qui possèdent `type=document`.

Cette fonction n'a besoin d'aucun module supplémentaire et fonctionne directement avec la Query API XWiki.

### Plus vus · 30 jours

Les 5 documents les plus consultés sur les 30 derniers jours utilisent le service de statistiques natif XWiki.

La page filtre ensuite les statistiques pour conserver uniquement les descendants Documentation ayant `type=document`.

Si les statistiques XWiki sont désactivées, l'interface reste fonctionnelle mais affiche un message indiquant que cette donnée est indisponible.

---

## 5. Accès rapides

`Accès rapides` affiche les 10 derniers documents ouverts par l'utilisateur courant.

La récupération utilise l'API XWiki :

```velocity
$xwiki.getRecentActions('view', ...)
```

Les résultats sont filtrés :

```text
type=document → conservé
type=folder   → ignoré
```

Les doublons sont supprimés et seuls les 10 premiers vrais documents sont affichés.

Cette fonctionnalité dépend elle aussi du module Statistics.

---

## 6. Action administrateur nécessaire pour les statistiques

Aucune XClass supplémentaire n'est nécessaire pour les vues et l'historique récent.

En revanche, XWiki doit enregistrer les statistiques de consultation. Si elles ne sont pas déjà activées, une intervention sur le serveur est nécessaire :

```properties
xwiki.stats=1
xwiki.stats.default=1
```

Ces propriétés se trouvent dans `xwiki.cfg`. Un redémarrage de XWiki est normalement nécessaire après modification.

Sur un sous-wiki, la préférence `statistics` dans `XWiki.XWikiPreferences` peut aussi devoir être activée.

Le code de la page détecte automatiquement si les statistiques sont actives : il n'échoue pas si elles sont désactivées.

---

## 7. Responsabilité des CSS / JS

- `Accueil - Base` : palette, fond, typographie et layout principal.
- `Accueil - Modules` : orbite, logo central, cercles et panneau de détail.
- `Accueil - Panneaux & Contact` : compteurs inférieurs, popup et contact.
- `Accueil - Flux` : À la une, listes de documents et Accès rapides.
- `Accueil - Modules.js` : interactions de l'orbite.
- `Accueil - Contact.js` : popup de contact.
- `Accueil - Flux.js` : onglets Derniers créés / Plus vus.

---

## 8. Prévisualisation web

Ouvrir :

```text
preview/index.html
```

La prévisualisation charge les mêmes feuilles CSS et scripts que XWiki. Les données sont simulées, mais les interactions sont réelles : orbite, sélection de module, onglets À la une et popup de contact.

---

## Convention à conserver

```text
Page XWiki = contenu + Velocity / logique serveur
SSX        = apparence
JSX        = comportement navigateur
Preview    = simulation web interactive
```
