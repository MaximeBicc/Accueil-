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

preview/
├── index.html
├── Preview.css
└── Preview.js
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

Le dossier `preview/` sert uniquement à simuler la page dans un navigateur. Il ne doit pas être copié dans XWiki.

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

## 2. Compteur Documentation

Le compteur Documentation est calculé côté XWiki / Velocity dans `WebHome.xwiki`.

### Configuration du dossier racine

```velocity
#set ($documentationRootSpace = 'Documentation')
```

Une racine imbriquée est possible :

```velocity
#set ($documentationRootSpace = 'Ressources.Documentation')
```

### Règle exacte

Tous les descendants du dossier racine sont parcourus, quelle que soit leur profondeur.

Pour chaque page trouvée, la requête inspecte les **XWiki Objects attachés à la page**, et en particulier une propriété String nommée :

```text
type
```

Le comptage est alors :

```text
type = document   → compté comme documentation
type = folder     → non compté
autre valeur      → non compté
pas de type        → non compté
```

Exemple :

```text
Documentation/                       racine non comptée
├── Procédure-A                      type=document   ✓ compté
├── Technique                       type=folder     ✗ non compté
│   ├── Guide-A                     type=document   ✓ compté
│   └── Sécurité                    type=folder     ✗ non compté
│       └── Guide-B                 type=document   ✓ compté
└── Archives                        type=folder     ✗ non compté
    └── Ancienne-procédure          type=document   ✓ compté
```

Le résultat de cet exemple est **4 documentations**, pas 7 pages.

La page racine est également explicitement exclue, même si elle possède par erreur `type=document`.

La requête utilise `count(distinct doc.fullName)` afin qu'une même page ne soit comptée qu'une seule fois si plusieurs objets correspondent.

> Remarque : cette version recherche la propriété `type` dans les XWiki Objects sans imposer une classe d'objet précise. Si plusieurs classes différentes de ton wiki utilisent aussi une propriété `type=document`, on pourra ensuite ajouter le nom exact de la classe comme filtre.

---

## 3. Compteur Formation

**Aucune modification de logique n'a été faite sur Formation.**

La configuration reste :

```velocity
#set ($formationRootSpace = 'Formation')
```

Le fonctionnement reste celui de la version précédente : toutes les pages descendantes de la racine Formation sont comptées récursivement, en excluant le `WebHome` racine.

---

## 4. Modifier le thème

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

## 5. Formulaire administrateur

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

## 6. Prévisualisation réelle dans un navigateur

À partir de maintenant, le livrable visuel est un **site web interactif**, pas une image générée.

Le simulateur est :

```text
preview/index.html
```

Il charge directement les mêmes CSS et JavaScript que la page XWiki :

```text
Accueil-Base.css
Accueil-Modules.css
Accueil-Panneaux-Contact.css
Accueil-Modules.js
Accueil-Contact.js
```

Il permet donc de tester réellement :

- le rendu desktop ;
- le responsive ;
- le placement dynamique des cercles ;
- le changement du panneau de droite au clic ;
- l'ouverture / fermeture de la popup administrateur ;
- un faux envoi du formulaire sans envoyer d'email réel.

Les valeurs de compteurs dans le simulateur sont des exemples visuels uniquement. Le vrai calcul reste effectué par XWiki dans `WebHome.xwiki`.

---

## 7. Convention à conserver pour les prochaines pages

```text
Page XWiki = contenu + Velocity / logique serveur indispensable
SSX        = apparence
JSX        = comportement navigateur
Preview    = simulation web interactive, jamais une image
```

Si une feuille CSS ou un JavaScript devient trop gros, le découper par responsabilité ou composant plutôt que de créer un fichier global difficile à maintenir.
