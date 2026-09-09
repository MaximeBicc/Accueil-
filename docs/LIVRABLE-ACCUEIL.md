# Livrable — Page d'accueil XWiki

## État actuel

Version : **blanc moderne luxueux**, bleu profond + accent rouge discret.

Le centre de l'orbite affiche maintenant le symbole NAVAL GROUP en grand.

Le livrable visuel est une **prévisualisation web interactive**, jamais une image générée.

---

## Arborescence

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

docs/
├── CUSTOMISATION.md
└── LIVRABLE-ACCUEIL.md
```

---

## Extensions XWiki à créer

### SSX

```text
Accueil - Base
Accueil - Modules
Accueil - Panneaux & Contact
Accueil - Flux
```

### JSX

```text
Accueil - Modules
Accueil - Contact
Accueil - Flux
```

---

## Documentation — logique exacte

Racine :

```velocity
#set ($documentationRootSpace = 'Documentation')
```

Tous les descendants sont inspectés récursivement.

```text
type=document → compté
type=folder   → non compté
autre type    → non compté
sans type     → non compté
```

La racine elle-même est exclue.

---

## Formation

La logique Formation n'a pas été modifiée.

```velocity
#set ($formationRootSpace = 'Formation')
```

Elle continue à compter les pages descendantes de façon récursive.

---

## À la une

Le panneau contient deux onglets interactifs.

### Derniers créés

Affiche automatiquement les 5 derniers documents créés qui :

1. sont sous la racine Documentation ;
2. ont un XWiki Object avec `type=document`.

Aucune configuration supplémentaire n'est requise.

### Plus vus · 30 jours

Affiche les 5 documents les plus consultés sur les 30 derniers jours, filtrés eux aussi sur `type=document` et la racine Documentation.

Cette fonction utilise le service Statistics natif de XWiki.

---

## Accès rapides

Affiche jusqu'à 10 derniers documents ouverts par l'utilisateur connecté.

Les actions de consultation sont récupérées depuis XWiki, puis filtrées pour exclure les éléments `type=folder` et ne garder que `type=document`.

Les doublons sont supprimés.

---

## Action humaine nécessaire

Pour rendre **Plus vus · 30 jours** et **Accès rapides** réellement fonctionnels, les statistiques XWiki doivent être activées sur le serveur.

Si elles ne le sont pas déjà, il faut modifier `xwiki.cfg` :

```properties
xwiki.stats=1
xwiki.stats.default=1
```

Puis redémarrer XWiki.

Pour un sous-wiki, la propriété `statistics` de `XWiki.XWikiPreferences` peut également devoir être activée.

**Aucune XClass personnalisée n'est nécessaire** pour ces deux fonctionnalités.

Le code actuel détecte si Statistics est actif. S'il ne l'est pas, la page continue de fonctionner et affiche un état indisponible au lieu de provoquer une erreur.

---

## Prévisualisation web interactive

Ouvrir :

```text
preview/index.html
```

Le simulateur réutilise les vrais CSS et JavaScript du livrable et permet de tester :

- l'orbite dynamique ;
- le logo central ;
- la sélection des modules ;
- les onglets `Derniers créés` / `Plus vus · 30 jours` ;
- la liste des 10 documents récemment ouverts ;
- la popup administrateur ;
- le responsive.

Les données de documents et statistiques de la prévisualisation sont fictives. Les interactions et la mise en page correspondent au vrai code.

---

## Règle projet

```text
Page XWiki = contenu + Velocity nécessaire
SSX        = CSS
JSX        = JavaScript
Preview    = site web interactif de simulation
```
