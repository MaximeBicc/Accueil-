async function POST(formulaire, message, bouton, isPopup) {
    message.innerHTML = "";
    bouton.disabled = true;
    bouton.textContent = "Chargement...";
    const donnees = new FormData(formulaire);
    try {
        const reponse = await fetch(urlCommande, {
            method: "POST",
            body: donnees,
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        const resultat = await reponse.text();
        message.innerHTML = resultat;
        if (resultat.includes("LIEN_AJOUTE_OK")) {
            message.innerHTML = '<div class="alert alert-success">' + 'Le fichier a bien été ajouté.' + '</div>';
        } else if (resultat.includes("LIEN_MODIFIE_OK")) {
            message.innerHTML = '<div class="alert alert-success">' + 'Le fichier a bien été modifié.' + '</div>';
        } else if (resultat.includes("LIEN_SUPPRIME_OK")) {
            message.innerHTML = '<div class="alert alert-success">' + 'Le fichier a bien été supprimé.' + '</div>';
        }
        else if (resultat.includes("ERREUR_CSRF")) {
            message.innerHTML = '<div class="alert alert-danger">' + 'La session de sécurité a expiré. Recharge la page.' + '</div>';
        } else if (resultat.includes("ERREUR_CHAMPS")) {
            message.innerHTML = '<div class="alert alert-danger">' + 'Le nom fichier est obligatoire.' + '</div>';
        } else if (resultat.includes("ERREUR_DROITS")) {
            message.innerHTML = '<div class="alert alert-danger">' + 'Tu n\'as pas les droits.' + '</div>';
        } else {
            console.error("Réponse reçue :", resultat);
            message.innerHTML = '<div class="alert alert-danger">' + 'Une erreur inconnue s\'est produite.' + resultat + '</div>';
        }
    } catch (erreur) {
        console.error(erreur);
        message.innerHTML = '<div class="alert alert-danger">' + 'Impossible de contacter la page de commande.' + urlCommande + '</div>';
    } finally {
        bouton.disabled = false;
        formulaire.reset();
        if(isPopup){
            popup.style.display = "none";
            bouton.textContent = "Valider";
        }
        else{
            bouton.textContent = "pas popup";
        }
    }
}

document.addEventListener("DOMContentLoaded", function() {
    const formulaireCommun = document.getElementById("formulairePopup");
    const messageCommun = document.getElementById("notification");
    const boutonCommun = document.getElementById("btn-popup-valide");
    formulaireCommun.addEventListener("submit", async function (event) {
        event.preventDefault();
        await POST(formulaireCommun, messageCommun, boutonCommun, true);
    });
});
