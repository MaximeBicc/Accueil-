# Personnalisation de la page d'accueil

## Structure XWiki

```text
xwiki/
├── Accueil/
│   └── WebHome.xwiki
├── InfoWiki/
│   └── CODE/
│       └── TrackView.xwiki
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
        ├── Accueil-Flux.js
        └── Accueil-Tracking.js

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
- `Accueil - Tracking`

`Accueil - Tracking` est particulière : elle doit être chargée **sur tout le sous-wiki**, afin de détecter l'ouverture des pages Documentation.

## Logo central

Le centre de l'orbite utilise une vraie image attachée à `Accueil.WebHome` :

```text
naval-group-logo.png
```

Le code utilise `$doc.getAttachmentURL(...)`, ce qui fonctionne directement dans le sous-wiki courant.

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

## Formation

La logique Formation n'a pas été modifiée : tous les descendants de la racine Formation sont comptés, hors WebHome racine.

## À la une

Le panneau contient deux onglets :

- `Derniers créés` : 5 derniers documents `type=document` par date de création ;
- `Plus vus · 30 jours` : 5 documents les plus consultés selon notre propre XClass `InfoWiki.CODE.viewClass`.

Le module Statistics XWiki n'est plus utilisé.

## Accès rapides

Les 10 derniers documents ouverts par l'utilisateur sont conservés côté navigateur dans `localStorage`.

Cette solution :

- évite d'enregistrer l'identité de l'utilisateur dans les statistiques serveur ;
- filtre toujours les folders grâce à la validation de `InfoWiki.CODE.TrackView` ;
- conserve les 10 derniers documents sans doublon.

L'historique reste lié au navigateur / appareil.

## Tracking manuel

La configuration exacte est documentée dans :

```text
docs/TRACKING-MANUEL.md
```

Résumé :

```text
InfoWiki.CODE.viewClass
├── document : String
├── day      : Date
└── views    : Number / Integer
```

Créer également :

```text
InfoWiki.CODE.TrackView
InfoWiki.DATA.ViewStats.WebHome
```

Puis donner le droit **Edit** sur l'espace `InfoWiki.DATA.ViewStats` aux utilisateurs authentifiés qui doivent générer des statistiques.

Le JavaScript limite une même page à une vue comptée toutes les 30 minutes par navigateur afin de réduire les refresh artificiels et le nombre d'écritures.

## Compatibilité Velocity

Les nouveaux traitements n'utilisent pas `.trim()`, `.toLowerCase()`, `.startsWith()` ou `.replaceAll()` dans le code Velocity.

## Prévisualisation

`preview/index.html` reste la prévisualisation interactive. Les données statistiques y sont simulées car le vrai tracking dépend des XObjects et droits du sous-wiki.

## Convention projet

```text
Page XWiki = contenu + Velocity nécessaire
SSX        = apparence
JSX        = comportement navigateur
Preview    = simulation web interactive
```
