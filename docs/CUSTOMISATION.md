# Personnalisation de la page d'accueil

## Règle de structure du projet

La page XWiki ne doit pas contenir de gros blocs CSS ou JavaScript.

```text
xwiki/
├── Accueil/
│   └── WebHome.xwiki
└── extensions/
    ├── stylesheet/
    │   ├── Accueil-Base.css
    │   ├── Accueil-Modules.css
    │   └── Accueil-Panneaux-Contact.css
    └── javascript/
        ├── Accueil-Modules.js
        └── Accueil-Contact.js
```

Dans XWiki, créer les extensions suivantes.

### StyleSheet Extensions

1. `Accueil - Base`
2. `Accueil - Modules`
3. `Accueil - Panneaux & Contact`

### JavaScript Extensions

1. `Accueil - Modules`
2. `Accueil - Contact`

Chaque fichier du dépôt correspond au contenu à copier dans l'extension XWiki portant le même nom.

---

## 1. Ajouter ou retirer des cercles

Les données des modules restent dans `xwiki/Accueil/WebHome.xwiki` car elles font partie du contenu de la page.

Chercher :

```html
<div class="nh-module-source" aria-hidden="true">
```

Chaque bloc `data-home-module` représente un cercle :

```html
<div data-home-module
     data-label="Documentation"
     data-icon="D"
     data-title="Documentation"
     data-description="Texte affiché dans le panneau de droite."
     data-url="$escapetool.xml($xwiki.getURL('Documentation.WebHome', 'view'))">
  <span data-module-point>Premier point</span>
  <span data-module-point>Deuxième point</span>
  <span data-module-point>Troisième point</span>
</div>
```

Pour ajouter un cercle, dupliquer le bloc puis modifier ses valeurs. Pour le retirer, supprimer son bloc.

`Accueil - Modules.js` détecte automatiquement le nombre de modules et recalcule leur position. Si nécessaire, plusieurs anneaux concentriques sont utilisés.

---

## 2. Compteurs Documentation / Formation

Les compteurs sont calculés côté XWiki / Velocity dans `WebHome.xwiki`.

### Configuration

Modifier uniquement ces deux variables :

```velocity
#set ($documentationRootSpace = 'Documentation')
#set ($formationRootSpace = 'Formation')
```

Une racine peut être imbriquée :

```velocity
#set ($documentationRootSpace = 'Ressources.Documentation')
#set ($formationRootSpace = 'Ressources.Formation')
```

### Règle de comptage

Le dossier racine sert uniquement de conteneur et n'est pas compté lui-même.

Sont comptés automatiquement :

```text
Documentation/
├── Procédure A                  ✓
├── Procédure B                  ✓
├── Technique/                   ✓ (page enfant)
│   ├── Guide A                  ✓
│   └── Sous-dossier/            ✓
│       └── Guide B              ✓
└── Autre dossier/               ✓
    └── ...                      ✓
```

Autrement dit, tous les enfants, sous-enfants et descendants à profondeur quelconque sont inclus.

Le `WebHome` de la racine elle-même est explicitement exclu du compteur.

Le comptage utilise un préfixe d'espace XWiki avec paramètres liés (`bindValue`) et échappement des caractères spéciaux de `LIKE`.

---

## 3. Modifier le thème

Le thème actuel est : **blanc, moderne luxueux, avec bleu profond et accent rouge discret**.

Les variables principales sont dans :

```text
xwiki/extensions/stylesheet/Accueil-Base.css
```

Au début de `.naval-home` :

```css
--nh-white: #ffffff;
--nh-surface: #ffffff;
--nh-surface-soft: #f7f9fc;
--nh-blue: #173f98;
--nh-blue-deep: #0d2d73;
--nh-blue-light: #365db3;
--nh-red: #ef233c;
--nh-text: #18324f;
--nh-muted: #647890;
```

### Responsabilité des trois feuilles CSS

- `Accueil - Base` : palette, fond blanc, typographie, header et layout principal.
- `Accueil - Modules` : cercles mixtes blanc / bleu, anneaux, animations et panneau de détail.
- `Accueil - Panneaux & Contact` : trois panneaux inférieurs, compteurs, contact administrateur, popup et toast.

Le logo n'est actuellement pas affiché. Le centre de l'orbite utilise seulement une signature graphique abstraite bleu / rouge.

---

## 4. Formulaire administrateur

Le traitement serveur reste dans `WebHome.xwiki`.

Le comportement de la popup est dans :

```text
xwiki/extensions/javascript/Accueil-Contact.js
```

Son apparence est dans :

```text
xwiki/extensions/stylesheet/Accueil-Panneaux-Contact.css
```

Le destinataire est récupéré depuis la préférence XWiki `admin_email`.

Pour que l'envoi fonctionne :

- une adresse administrateur doit être configurée ;
- XWiki doit avoir un expéditeur / SMTP valide ;
- la page doit disposer des droits nécessaires pour utiliser le service Mail Sender.

---

## 5. Cartes du milieu

Le contenu des trois cartes reste dans `WebHome.xwiki` :

```html
<section class="nh-cards" aria-label="Informations principales">
```

Leur apparence est gérée uniquement par `Accueil - Panneaux & Contact`.

---

## 6. Convention à conserver pour les prochaines pages

```text
Page XWiki = contenu + Velocity / logique serveur indispensable
SSX        = apparence
JSX        = comportement navigateur
```

Si une feuille CSS ou un JavaScript devient trop gros, le découper par responsabilité ou composant plutôt que de créer un fichier global difficile à maintenir.
