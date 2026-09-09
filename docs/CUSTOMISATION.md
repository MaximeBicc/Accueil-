# Personnalisation de la page d'accueil

## Structure XWiki

```text
xwiki/
├── Accueil/
│   └── WebHome.xwiki
└── extensions/
    ├── stylesheet/
    │   ├── Accueil-Base.css
    │   ├── Accueil-Modules.css
    │   ├── Accueil-Branding.css
    │   ├── Accueil-Panneaux-Contact.css
    │   └── Accueil-Flux.css
    └── javascript/
        ├── Accueil-Modules.js
        ├── Accueil-Contact.js
        └── Accueil-Flux.js

preview/
├── index.html
├── Preview.css
└── Preview.js
```

## Extensions à créer dans XWiki

### StyleSheet Extensions

- `Accueil - Base`
- `Accueil - Modules`
- `Accueil - Branding`
- `Accueil - Panneaux & Contact`
- `Accueil - Flux`

### JavaScript Extensions

- `Accueil - Modules`
- `Accueil - Contact`
- `Accueil - Flux`

## Logo central

Le centre de l'orbite utilise maintenant une vraie image et non un logo redessiné en SVG.

Action manuelle : joindre le fichier suivant à la page `Accueil.WebHome` :

```text
naval-group-logo.png
```

Le code le récupère automatiquement avec l'URL de téléchargement de la pièce jointe.

## Documentation

Racine configurable :

```velocity
#set ($documentationRootSpace = 'Documentation')
```

Tous les descendants sont inspectés. Seules les pages possédant un XWiki Object avec une propriété String exactement égale à :

```text
type = document
```

sont considérées comme des documentations.

```text
type=document  -> compté
type=folder    -> non compté
autre          -> non compté
```

La racine elle-même est exclue.

Le code évite les appels Velocity problématiques de type `.trim()` et `.toLowerCase()` et compare directement la valeur attendue.

## Formation

La logique Formation n'a pas été modifiée : tous les descendants de la racine Formation sont comptés, hors WebHome racine.

## À la une

Le panneau contient deux onglets :

- `Derniers créés` : 5 derniers documents `type=document` par date de création ;
- `Plus vus · 30 jours` : 5 documents les plus vus sur les 30 derniers jours si Statistics est actif.

## Accès rapides

Affiche jusqu'aux 10 derniers documents ouverts par l'utilisateur courant, en supprimant les doublons et en filtrant sur les vraies documentations `type=document`.

## Sous-wiki et Statistics

Le code teste `enabledForCurrentWiki`, donc il travaille sur le sous-wiki courant.

XWiki distingue deux niveaux :

1. le service Statistics doit être autorisé globalement par le serveur (`xwiki.stats=1`) ;
2. le sous-wiki peut ensuite décider de l'activer via la propriété `statistics` de son `XWiki.XWikiPreferences`.

Si le niveau 1 est désactivé par l'administrateur de la plateforme, un administrateur limité au sous-wiki ne peut pas le réactiver seul.

Si le service est disponible mais simplement désactivé pour le sous-wiki, il peut être activé dans les préférences du sous-wiki sans accéder au wiki principal.

## Prévisualisation

`preview/index.html` reste la prévisualisation interactive. Le logo exact fourni est injecté localement par `Preview.js`, donc aucune image de maquette générée n'est utilisée.

## Convention projet

```text
Page XWiki = contenu + Velocity nécessaire
SSX        = apparence
JSX        = comportement navigateur
Preview    = simulation web interactive
```
