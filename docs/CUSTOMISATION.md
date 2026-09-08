# Personnalisation de la page d'accueil

## 1. Ajouter ou retirer des cercles

Dans `xwiki/Accueil/WebHome.xwiki`, chercher :

```js
var modules = [
```

Chaque objet représente un cercle :

```js
{
  label: 'Documentation',
  icon: 'D',
  title: 'Documentation',
  description: 'Texte affiché à droite.',
  points: ['Point 1', 'Point 2', 'Point 3'],
  url: '$xwiki.getURL("Documentation.WebHome", "view")'
}
```

Ajouter ou supprimer simplement des objets. Le JavaScript recalcule automatiquement les positions. S'il n'y a plus assez de place sur un seul anneau, il répartit les modules sur plusieurs anneaux concentriques.

## 2. Modifier les compteurs Documentation / Formation

En haut du fichier, les espaces de référence sont :

```velocity
#set ($documentationSpace = 'Documentation')
#set ($formationSpace = 'Formation')
```

La première version compte les pages situées dans `Documentation` et ses sous-espaces, ainsi que dans `Formation` et ses sous-espaces.

## 3. Modifier le thème

Les couleurs principales se trouvent au début du bloc CSS dans `.naval-home` :

```css
--navy-950: #041426;
--navy-900: #071d35;
--blue-500: #2486dc;
--blue-400: #52a8ef;
--cyan-300: #87d7ff;
```

## 4. Formulaire administrateur

Le destinataire est récupéré depuis la préférence XWiki `admin_email`.

Pour que l'envoi fonctionne :

- une adresse administrateur doit être configurée ;
- XWiki doit avoir un expéditeur / SMTP valide ;
- la page doit disposer des droits nécessaires pour utiliser le service Mail Sender.

Le formulaire envoie le nom, l'email saisi, l'utilisateur XWiki courant et le message. L'email saisi n'est volontairement pas injecté dans les en-têtes du mail : il est seulement placé dans le corps du message afin d'éviter les injections d'en-têtes.

## 5. Cartes du milieu

Chercher le bloc :

```html
<section class="nh-cards">
```

Les trois cartes `À la une`, `Accès rapides` et `Informations utiles` sont des contenus de départ et peuvent être remplacées librement.
