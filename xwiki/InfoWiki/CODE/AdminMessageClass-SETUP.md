# InfoWiki.CODE.AdminMessageClass

Créer manuellement dans XWiki la classe :

`InfoWiki.CODE.AdminMessageClass`

Comme il s'agit d'une page imbriquée non terminale dans cette instance, la référence utilisée par le code est :

`InfoWiki.CODE.AdminMessageClass.WebHome`

## Propriétés à créer

| Propriété | Type XWiki | Réglage conseillé |
|---|---|---|
| `senderName` | String | taille 255 |
| `senderUser` | String | taille 255 |
| `message` | TextArea | texte long, 80 colonnes / 8 lignes environ |
| `created` | Date | format `dd/MM/yyyy HH:mm` ou `yyyy-MM-dd HH:mm:ss` |
| `isRead` | Boolean | valeur par défaut : Non / 0 |
| `isDone` | Boolean | valeur par défaut : Non / 0 |

## Pages utilisées

- Endpoint d'envoi : `InfoWiki.CODE.SendAdminMessage.WebHome`
- Stockage : `InfoWiki.DATA.AdminMessages.WebHome`
- Boîte de réception : `InfoWiki.AdminMessages.WebHome`

## Droits

Pour qu'un utilisateur puisse envoyer un message avec cette version sans Programming Right, il doit avoir le droit `Edit` sur `InfoWiki.DATA.AdminMessages.WebHome` (ou sur l'espace qui lui transmet ce droit).

La page `InfoWiki.AdminMessages.WebHome` doit être réservée aux administrateurs pour éviter que les utilisateurs ordinaires consultent la boîte de réception.

Cette solution est volontairement simple. Comme les utilisateurs qui envoient ont besoin du droit Edit sur la page de stockage, ce n'est pas une boîte confidentielle forte contre un utilisateur qui tenterait volontairement d'accéder ou modifier les données. Une version réellement privée demanderait un composant serveur exécutant l'écriture avec des droits dédiés.
