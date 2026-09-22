function ajouterFichier() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    popupContent.innerHTML = `
<h4>Nom du fichier ${parentPage}</h4>
<input type="hidden" name="action" value="ajouter un fichier" />
<input type="hidden" name="type" value="folder" />
<input type="text" name="nom_fichier" placeholder="nom du fichier" />
`;//<input type="hidden" name="page" value="${parentPage}" />
    popup.style.display = "block";
}

function ajouterDocument() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    popupContent.innerHTML = `
<h4>Nom du fichier ${parentPage}</h4>
<input type="hidden" name="action" value="ajouter un document" />
<input type="hidden" name="type" value="document" />
<input type="text" name="nom_fichier" placeholder="nom du document" />
`;//<input type="hidden" name="page" value="${parentPage}" />
    popup.style.display = "block";
}

function popupValider() {
    // 1. Bloquer la soumission classique du formulaire pour éviter le rechargement de page
    const formulaire = document.getElementById("formulairePopup");
    formulaire.onsubmit = function(e) {
        e.preventDefault();
    };

    const pageData = document.getElementById("pageData");
    const parentPage = pageData ? pageData.getAttribute("parent-page") : null;
    const box = document.getElementById("box");

    if (!parentPage || !box) return;

    // 2. Récupérer toutes les données du formulaire (nom, type, tokens, etc.)
    const formData = new FormData(formulaire);

    // 3. Envoyer la requête de création à XWiki de manière asynchrone
    fetch(urlCommande, {
        method: "POST",
        body: formData
    })
    .then(function(response) {
        return response.text();
    })
    .then(function(resultat) {
        // Si XWiki répond positivement (correspond au LIEN_AJOUTE_OK de votre Velocity)
        if (resultat.includes("LIEN_AJOUTE_OK")) {
            // Masquer la popup
            document.getElementById("popup").style.display = "none";

            // Nettoyer le champ texte pour la prochaine fois
            formulaire.reset();

            // Rafraîchir instantanément la zone avec le nouveau dossier/document
            LienPerso(parentPage, box);
        } else {
            alert("Erreur lors de la création : " + resultat);
        }
    })
    .catch(function(error) {
        console.error("Erreur AJAX :", error);
        alert("Impossible d'ajouter l'élément.");
    });
}

function popupAnnuler() {
    popup.style.display = "none";
}

document.addEventListener("DOMContentLoaded", function() {
    const popup = document.getElementById("popup");
    const popupContent = document.getElementById("popupContent");
    const span = document.getElementsByClassName("close")[1];

    span.onclick = function() {
        popup.style.display = "none";
    }

    window.onclick = function(event) {
        if (event.target == popup) {
            popup.style.display = "none";
        }
    }
});
