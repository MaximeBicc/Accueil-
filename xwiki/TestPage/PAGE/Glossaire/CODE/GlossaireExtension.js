var rowToDelete = null;

function toggleEditMode(button, isEnteringEdit) {
    var row = button.closest('.main-term-row');
    var viewElements = row.querySelectorAll('.view-mode, .view-buttons');
    var editElements = row.querySelectorAll('.edit-mode, .edit-buttons');

    if (isEnteringEdit) {
        viewElements.forEach(el => el.style.display = 'none');
        row.querySelectorAll('.edit-mode').forEach(el => el.style.display = 'block');
        row.querySelector('.edit-buttons').style.display = 'flex';
    } else {
        row.querySelector('.edit-acronym').value = row.querySelector('.main-acronym .view-mode').textContent.trim();
        row.querySelector('.edit-label').value = row.querySelector('.main-label .view-mode').textContent.trim();
        row.querySelector('.edit-definition').value = row.querySelector('.main-definition .view-mode').textContent.trim();

        editElements.forEach(el => el.style.display = 'none');
        row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
        row.querySelector('.view-buttons').style.display = 'block';
    }
}

// 1. ENVOI DU POST POUR SAUVEGARDE (VIA FETCH)
async function saveRowEdition(button) {
    var row = button.closest('.main-term-row');
    var table = document.getElementById('mainGlossaryTable');

    var fullRef = row.getAttribute('data-full-ref');
    var className = table.getAttribute('data-class-path');
    var csrfToken = table.getAttribute('data-csrf');

    var newAcronym = row.querySelector('.edit-acronym').value;
    var newLabel = row.querySelector('.edit-label').value;
    var newDefinition = row.querySelector('.edit-definition').value;

    const donnees = new FormData();
    donnees.append("action", "save");
    donnees.append("targetRef", fullRef);
    donnees.append("className", className);
    donnees.append("acronym", newAcronym);
    donnees.append("label", newLabel);
    donnees.append("definition", newDefinition);
    donnees.append("form_token", csrfToken);

    try {
        const reponse = await fetch(urlGlossaireData + "?xpage=plain", {
            method: "POST",
            body: donnees,
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });

        const resultat = await reponse.text();

        if (resultat.includes("GLOSSAIRE_OK")) {
            // Mise à jour du tableau principal
            row.querySelector('.main-acronym .view-mode strong').textContent = newAcronym;
            row.querySelector('.main-label .view-mode').textContent = newLabel;
            row.querySelector('.main-definition .view-mode').textContent = newDefinition;
            row.setAttribute('data-acronym', newAcronym.toUpperCase());

            // --- AJOUT : Mise à jour du tableau de la modal ---
            var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
            if (modalRow) {
                var modalAcronymCell = modalRow.querySelector('.term-acronym');
                var modalLabelCell = modalRow.querySelector('.term-label');

                if (modalAcronymCell) modalAcronymCell.textContent = newAcronym;
                if (modalLabelCell) modalLabelCell.textContent = newLabel;
            }

            // Force le déclenchement du filtre global si la modal est ouverte pour recalculer la pertinence
            if (typeof triggerGlobalFilter === 'function') {
                triggerGlobalFilter();
            }
            // -----------------------------------------------

            toggleEditMode(button, false);
        } else {
            alert("Erreur serveur : " + resultat.trim());
        }
    } catch (erreur) {
        console.error(erreur);
        alert("Impossible de joindre la page DATA : " + erreur);
    }
}

function openDeleteModal(button) {
    rowToDelete = button.closest('.main-term-row');
    var acronymText = rowToDelete.querySelector('.main-acronym .view-mode').textContent.trim();
    var labelText = rowToDelete.querySelector('.main-label .view-mode').textContent.trim();

    document.getElementById('deleteModalAcronym').innerText = acronymText;
    document.getElementById('deleteModalLabel').innerText = labelText;

    jQuery('#deleteConfirmModal').modal('show');
}

// 2. ENVOI DU POST POUR SUPPRESSION (VIA FETCH)
async function executeRowDelete() {
    if (!rowToDelete) return;

    var table = document.getElementById('mainGlossaryTable');
    var fullRef = rowToDelete.getAttribute('data-full-ref');
    var csrfToken = table.getAttribute('data-csrf');

    const donnees = new FormData();
    donnees.append("action", "delete");
    donnees.append("targetRef", fullRef);
    donnees.append("form_token", csrfToken);

    var deleteButton = document.getElementById('btnConfirmDelete');
    deleteButton.disabled = true;

    try {
        const reponse = await fetch(urlGlossaireData + "?xpage=plain", {
            method: "POST",
            body: donnees,
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });

        const resultat = await reponse.text();

        if (resultat.includes("GLOSSAIRE_OK")) {
            jQuery('#deleteConfirmModal').modal('hide');

            // --- AJOUT : Suppression dans le tableau de la modal ---
            var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
            if (modalRow) {
                modalRow.remove();
            }
            // -------------------------------------------------------

            rowToDelete.remove();
            rowToDelete = null;

            if (typeof applyPagination === 'function') {
                applyPagination();
            }
        } else {
            alert("Erreur de suppression serveur : " + resultat.trim());
            jQuery('#deleteConfirmModal').modal('hide');
        }
    } catch (erreur) {
        console.error(erreur);
        alert("Erreur réseau lors de la suppression : " + erreur);
        jQuery('#deleteConfirmModal').modal('hide');
    } finally {
        deleteButton.disabled = false;
    }
}

// Variables globales pour piloter la pagination
var currentPage = 1;
var pageSize = 10;

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", function() {
    applyPagination();
});

// 1. MODIFICATION : Filtrage croisé par colonne en temps réel (Logique ET)
function filterMainTableColumns() {
    var acronymVal = document.getElementById('filterAcronym').value.toUpperCase();
    var labelVal = document.getElementById('filterLabel').value.toUpperCase();
    var definitionVal = document.getElementById('filterDefinition').value.toUpperCase();

    var rows = document.querySelectorAll('#mainGlossaryTable tbody .main-term-row');

    rows.forEach(function(row) {
        var acronymCell = row.querySelector('.main-acronym');
        var labelCell = row.querySelector('.main-label');
        var definitionCell = row.querySelector('.main-definition');

        if (acronymCell && labelCell && definitionCell) {
            var acronymText = (acronymCell.textContent || acronymCell.innerText).toUpperCase();
            var labelText = (labelCell.textContent || labelCell.innerText).toUpperCase();
            var definitionText = (definitionCell.textContent || definitionCell.innerText).toUpperCase();

            var matchAcronym = (acronymVal === '' || acronymText.indexOf(acronymVal) > -1);
            var matchLabel = (labelVal === '' || labelText.indexOf(labelVal) > -1);
            var matchDefinition = (definitionVal === '' || definitionText.indexOf(definitionVal) > -1);

            if (matchAcronym && matchLabel && matchDefinition) {
                // On marque temporairement la ligne comme "valide selon le filtre" via un dataset
                row.dataset.filteredMatch = "true";
            } else {
                row.dataset.filteredMatch = "false";
            }
        }
    });

    // Reset à la première page après un filtrage et application de la pagination visuelle
    currentPage = 1;
    applyPagination();
}

// 2. Réinitialisation des inputs lors de l'usage du filtre A-Z général
function filterMainTableAZ(letter) {
    document.getElementById('filterAcronym').value = '';
    document.getElementById('filterLabel').value = '';
    document.getElementById('filterDefinition').value = '';

    var rows = document.querySelectorAll('#mainGlossaryTable tbody .main-term-row');
    var targetLetter = letter.toUpperCase();

    rows.forEach(function(row) {
        var acronymAttr = row.getAttribute('data-acronym') || '';

        if (targetLetter === '' || acronymAttr.startsWith(targetLetter)) {
            row.dataset.filteredMatch = "true";
        } else {
            row.dataset.filteredMatch = "false";
        }
    });

    currentPage = 1;
    applyPagination();
}

// --- NOUVELLES FONCTIONS DE GESTION DE LA PAGINATION ---

function applyPagination() {
    var selectValue = document.getElementById('pageSizeSelect').value;
    var rows = document.querySelectorAll('#mainGlossaryTable tbody .main-term-row');

    // Étape A : Isoler uniquement les lignes qui passent les filtres actifs
    var visibleRows = Array.from(rows).filter(function(row) {
        // Si aucun filtrage n'a encore été lancé, dataset.filteredMatch n'existe pas, on considère true
        return row.dataset.filteredMatch !== "false";
    });

    // Si "Tout afficher" est sélectionné
    if (selectValue === 'all') {
        visibleRows.forEach(function(row) { row.style.display = ''; });
        // Masquer ou désactiver les contrôles devenus inutiles
        document.getElementById('pageIndicator').innerText = 'Tout affiché';
        document.getElementById('btnPrevPage').disabled = true;
        document.getElementById('btnNextPage').disabled = true;
        return;
    }

    pageSize = parseInt(selectValue, 10);
    var totalRows = visibleRows.length;
    var totalPages = Math.ceil(totalRows / pageSize) || 1;

    // Ajustement de sécurité de la page courante
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // Calcul des index de découpage
    var startIndex = (currentPage - 1) * pageSize;
    var endIndex = startIndex + pageSize;

    // Étape B : Cacher toutes les lignes de la table d'abord
    rows.forEach(function(row) { row.style.display = 'none'; });

    // Étape C : Afficher uniquement les lignes de la page active parmi celles filtrées
    visibleRows.forEach(function(row, index) {
        if (index >= startIndex && index < endIndex) {
            row.style.display = '';
        }
    });

    // Étape D : Mise à jour de l'interface utilisateur
    document.getElementById('pageIndicator').innerText = "Page " + currentPage + " / " + totalPages;
    document.getElementById('btnPrevPage').disabled = (currentPage === 1);
    document.getElementById('btnNextPage').disabled = (currentPage === totalPages);
}

function navigatePage(direction) {
    currentPage += direction;
    applyPagination();
}

function changePageSize() {
    currentPage = 1; // On revient à la première page lors d'un changement de taille
    applyPagination();
}

// 3. Gestionnaire d'analyse pour l'affichage de la popup d'action générée par vos boutons
function openActionModal(title, text) {
    document.getElementById('feedbackModalTitle').innerText = title;
    document.getElementById('feedbackModalBodyText').innerText = text;
    jQuery('#actionFeedbackModal').modal('show');
}

// 4. Gestionnaire d'analyse de la saisie avec logique OU croisée (Pour la création de la popup droite)
function triggerGlobalFilter() {
    var acronymField = document.getElementById('acronymeInputField');
    var libelleField = document.getElementById('libelleInputField');

    if (!acronymField || !libelleField) return;

    var acronymValue = acronymField.value.toUpperCase();
    var libelleValue = libelleField.value.toUpperCase();
    var rows = document.querySelectorAll('#popupCheckTable .term-row');

    rows.forEach(function(row) {
        var acronymCell = row.querySelector('.term-acronym');
        var labelCell = row.querySelector('.term-label');

        if (acronymCell && labelCell) {
            var acronymText = (acronymCell.textContent || acronymCell.innerText).toUpperCase();
            var labelText = (labelCell.textContent || labelCell.innerText).toUpperCase(); var matchAcronym = false; var matchLibelle = false;
            if (acronymValue !== '') {
                if (acronymText.indexOf(acronymValue) > -1)
                    matchAcronym = true;
            }
            if (libelleValue !== '') {
                if (labelText.indexOf(libelleValue) > -1)
                    matchLibelle = true;
            }
            if (acronymValue === '' && libelleValue === '') {
                row.style.display = '';
            } else if ((acronymValue !== '' && matchAcronym) || (libelleValue !== '' && matchLibelle)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}
