function LienPerso(url, zone) {
    zone.innerHTML = "<p style='color: %236b7280; padding: 10px;'>Chargement...</p>";
    fetch(urlCommande + "?xpage=plain&action=recupContact&childRef=" + encodeURIComponent(url), { method: "GET" })
    .then(function(response) {
        return response.text();
    })
    .then(function(html) {
        zone.innerHTML = html;
        createSpan(zone); // Ré-attache les écouteurs sur le nouveau code HTML injecté
    })
    .catch(function(error) {
        zone.innerHTML = "<p style='color: %23ef4444; padding: 10px;'>Erreur pendant le chargement.</p>";
        console.error(error);
    });
}

function createSpan(box) {
    // 1. Gestion du clic sur les dossiers
    const folders = document.querySelectorAll(".folder");
    folders.forEach(folder => {
        if (!folder.hasAttribute('data-event-listener')) {
            folder.addEventListener("click", function() {
                const url = folder.getAttribute("data-full-name");
                LienPerso(url, box);
            });
            folder.setAttribute('data-event-listener', 'true');
        }
    });

    // 2. Gestion moderne et commutable du fil d'ariane (Style Explorateur de fichiers Windows)
    const wrapper = document.getElementById("breadcrumb-wrapper");
    const container = document.getElementById("breadcrumb-container");
    const input = document.getElementById("breadcrumb-input");
    const test = document.getElementById("test");

    if (wrapper && container && input && !wrapper.hasAttribute('data-event-listener')) {

        // Événement A : Clic sur la barre pour passer en mode "Texte modifiable"
        wrapper.addEventListener("click", function(e) {
            // Si on clique sur un dossier parent, on le laisse faire son action de clic standard
            if (e.target.classList.contains("folder") && e.target !== container.querySelector(".folder:last-of-type")) {
                return;
            }

            // Bascule l'affichage : cache les badges, montre l'input texte
            container.style.display = "none";
            input.style.display = "block";
            input.focus();

            // --- CORRECTION : On ne sélectionne plus tout le texte ---
            // On place simplement le curseur à la fin du texte pour permettre une modification rapide
            const textLength = input.value.length;
            input.setSelectionRange(textLength, textLength);
        });

        // Événement B : Validation par la touche Entrée ou annulation avec Échap
        input.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                const pathContent = input.value.trim();
                // Découpe le chemin peu importe si l'utilisateur met des ">" ou "»"
                const pages = pathContent.split(/[>»]+/).map(page => page.trim()).filter(page => page);

                if (pages.length > 0) {
                    const url = `TestPage.PAGE.${pages.join('.')}.WebHome`;
                    if (test) test.innerHTML = `${url}`;
                    LienPerso(url, box);
                } else {
                    // Si tout a été supprimé, on peut par exemple rediriger vers la racine par défaut
                    if (typeof initialPageRef !== 'undefined') LienPerso(initialPageRef, box);
                }
            } else if (event.key === "Escape") {
                // Annule l'édition et restaure les badges visuels
                input.style.display = "none";
                container.style.display = "flex";
            }
        });

        // Événement C : Clic en dehors de l'input (Perte de focus) -> Restaure les badges
        input.addEventListener("blur", function() {
            // Petit délai pour permettre aux autres clics de s'exécuter si nécessaire
            setTimeout(() => {
                input.style.display = "none";
                container.style.display = "flex";
            }, 200);
        });

        wrapper.setAttribute('data-event-listener', 'true');
    }
}

// Lancement automatique au premier chargement de la page
document.addEventListener("DOMContentLoaded", function() {
    const box = document.getElementById("box");
    if (box && typeof initialPageRef !== 'undefined') {
        // Appelle directement le flux standard pour charger la racine proprement
        LienPerso(initialPageRef, box);
    }
});
