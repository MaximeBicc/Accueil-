# Personnalisation de la page d'accueil

## Règle de structure du projet

La page XWiki ne doit pas contenir de gros blocs CSS ou JavaScript.

La structure retenue est :

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

Dans XWiki, créer les extensions avec les noms suivants :

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

Les données des modules restent volontairement dans `xwiki/Accueil/WebHome.xwiki`, car il s'agit du contenu de la page et non de logique JavaScript.

Chercher :

```html
<div class="nh-module-source" aria-hidden="true">
```

Chaque bloc `data-home-module` correspond à un cercle :

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

Pour ajouter un cercle, dupliquer simplement ce bloc et modifier ses valeurs.

Pour retirer un cercle, supprimer son bloc.

`Accueil - Modules.js` détecte automatiquement le nombre de modules et recalcule leur disposition. Lorsque tous les cercles ne tiennent plus correctement sur un seul anneau, plusieurs anneaux concentriques sont utilisés.

---

## 2. Modifier les compteurs Documentation / Formation

Les compteurs sont calculés dans `WebHome.xwiki` avec XWQL.

La version actuelle compte les pages présentes dans les espaces `Documentation` et `Formation`, y compris leurs sous-espaces.

Cette logique reste côté XWiki / Velocity et ne doit pas être déplacée dans JavaScript.

---

## 3. Modifier le thème

Les variables principales du thème sont dans :

```text
xwiki/extensions/stylesheet/Accueil-Base.css
```

Au début de `.naval-home` :

```css
--navy-950: #041426;
--navy-900: #071d35;
--blue-500: #2486dc;
--blue-400: #52a8ef;
--cyan-300: #87d7ff;
```

### Responsabilité des trois feuilles CSS

- `Accueil - Base` : fond, palette, typographie, header et layout principal.
- `Accueil - Modules` : cercles, anneaux, animations et panneau de détail à droite.
- `Accueil - Panneaux & Contact` : trois panneaux inférieurs, statistiques, bouton administrateur, popup et toast.

---

## 4. Formulaire administrateur

Le traitement serveur reste dans `WebHome.xwiki`.

Le comportement visuel de la popup est dans :

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

Le formulaire envoie le nom, l'email saisi, l'utilisateur XWiki courant et le message.

---

## 5. Cartes du milieu

Le contenu des trois cartes reste dans `WebHome.xwiki` :

```html
<section class="nh-cards" aria-label="Informations principales">
```

Leur apparence est gérée uniquement par `Accueil - Panneaux & Contact`.

---

## 6. Convention à conserver pour les prochaines pages

Pour chaque fonctionnalité importante :

```text
Page XWiki   = contenu + Velocity / logique serveur indispensable
SSX          = apparence
JSX          = comportement navigateur
```

Si une feuille CSS ou un JavaScript devient trop gros, le découper par responsabilité métier ou composant plutôt que de créer un seul fichier global difficile à maintenir.
