var rowToDelete = null;
var currentSortColumn = 'acronym';
var currentSortDirection = 'asc';

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

function getSortValue(row, column) {
    if (column === 'acronym') {
        return (row.getAttribute('data-acronym') || '').trim();
    }

    if (column === 'label') {
        var label = row.querySelector('.main-label .view-mode');
        return label ? label.textContent.trim() : '';
    }

    if (column === 'definition') {
        var definition = row.querySelector('.main-definition .view-mode');
        return definition ? definition.textContent.trim() : '';
    }

    return '';
}

// Trie le tableau principal sur la colonne demandée en A→Z ou Z→A.
function sortMainTableByColumn(column, direction) {
    var tbody = document.querySelector('#mainGlossaryTable tbody');
    if (!tbody) return;

    var rows = Array.from(tbody.querySelectorAll('.main-term-row'));
    var multiplier = direction === 'desc' ? -1 : 1;

    rows.sort(function(a, b) {
        var valueA = getSortValue(a, column);
        var valueB = getSortValue(b, column);
        return valueA.localeCompare(valueB, 'fr', {
            sensitivity: 'base',
            numeric: true
        }) * multiplier;
    });

    rows.forEach(function(row) {
        tbody.appendChild(row);
    });
}

function updateSortButtons() {
    var buttons = document.querySelectorAll('.sort-column-btn');

    buttons.forEach(function(button) {
        var column = button.getAttribute('data-column');
        var label = button.querySelector('.sort-label');
        var isActive = column === currentSortColumn;

        button.setAttribute('data-sort-active', isActive ? 'true' : 'false');
        button.setAttribute('data-sort-direction', isActive ? currentSortDirection : 'asc');

        if (isActive) {
            button.classList.add('active');
            if (label) {
                label.textContent = currentSortDirection === 'asc' ? 'A→Z' : 'Z→A';
            }
        } else {
            button.classList.remove('active');
            if (label) {
                label.textContent = 'A→Z';
            }
        }
    });
}

function applyCurrentSort() {
    sortMainTableByColumn(currentSortColumn, currentSortDirection);
    updateSortButtons();
}

// Un clic sur le bouton d'une colonne trie A→Z. Un second clic inverse en Z→A.
function toggleColumnSort(column, button) {
    var isSameColumn = currentSortColumn === column;

    if (isSameColumn) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    applyCurrentSort();
    currentPage = 1;
    applyPagination();
}

// Compatibilité avec le tri alphabétique initial historique.
function sortMainTableAlphabetically() {
    currentSortColumn = 'acronym';
    currentSortDirection = 'asc';
    applyCurrentSort();
}

// Même ordre alphabétique dans le tableau de vérification de la modale.
function sortPopupTableAlphabetically() {
    var tbody = document.querySelector('#popupCheckTable tbody');
    if (!tbody) return;

    var rows = Array.from(tbody.querySelectorAll('.term-row'));
    rows.sort(function(a, b) {
        var acronymCellA = a.querySelector('.term-acronym');
        var acronymCellB = b.querySelector('.term-acronym');
        var acronymA = acronymCellA ? acronymCellA.textContent.trim() : '';
        var acronymB = acronymCellB ? acronymCellB.textContent.trim() : '';
        return acronymA.localeCompare(acronymB, 'fr', { sensitivity: 'base', numeric: true });
    });

    rows.forEach(function(row) {
        tbody.appendChild(row);
    });
}

// 1. ENVOI DU POST POUR SAUVEGARDE (VIA FETCH)
async function saveRowEdition(button) {
    var row = button.closest('.main-term-row');
    var table = document.getElementById('mainGlossaryTable');

    var fullRef = row.getAttribute('data-full-ref');
    var className = table.getAttribute('data-class-path');
    var csrfToken = table.getAttribute('data-csrf');

    var newAcronym = row.querySelector('.edit-acronym').value.trim();
    var newLabel = row.querySelector('.edit-label').value.trim();
    var newDefinition = row.querySelector('.edit-definition').value.trim();

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
            // La page DATA renvoie : GLOSSAIRE_OK|nouvelleReference|nouveauNomDocument
            var ligneResultat = resultat.split(/\r?\n/).find(function(line) {
                return line.indexOf('GLOSSAIRE_OK') !== -1;
            }) || resultat.trim();
            var resultatParts = ligneResultat.trim().split('|');
            var updatedFullRef = resultatParts.length > 1 && resultatParts[1] ? resultatParts[1].trim() : fullRef;
            var updatedDocName = resultatParts.length > 2 && resultatParts[2] ? resultatParts[2].trim() : row.getAttribute('data-doc-name');

            // Mise à jour du tableau principal
            row.querySelector('.main-acronym .view-mode strong').textContent = newAcronym;
            row.querySelector('.main-label .view-mode').textContent = newLabel;
            row.querySelector('.main-definition .view-mode').textContent = newDefinition;
            row.setAttribute('data-acronym', newAcronym.toUpperCase());
            row.setAttribute('data-full-ref', updatedFullRef);
            row.setAttribute('data-doc-name', updatedDocName);

            // Mise à jour du tableau de la modal et de sa référence après renommage XWiki.
            var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
            if (modalRow) {
                var modalAcronymCell = modalRow.querySelector('.term-acronym');
                var modalLabelCell = modalRow.querySelector('.term-label');

                modalRow.setAttribute('data-full-ref', updatedFullRef);
                if (modalAcronymCell) modalAcronymCell.textContent = newAcronym;
                if (modalLabelCell) modalLabelCell.textContent = newLabel;
            }

            // On conserve le tri actuellement choisi, même après modification.
            applyCurrentSort();
            sortPopupTableAlphabetically();

            // Force le déclenchement du filtre global si la modal est ouverte pour recalculer la pertinence
            if (typeof triggerGlobalFilter === 'function') {
                triggerGlobalFilter();
            }

            toggleEditMode(button, false);
            applyPagination();
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

            // Suppression dans le tableau de la modal
            var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
            if (modalRow) {
                modalRow.remove();
            }

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

// Initialisation au chargement de la page : Acronyme A→Z puis pagination.
document.addEventListener("DOMContentLoaded", function() {
    applyCurrentSort();
    sortPopupTableAlphabetically();
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
        rows.forEach(function(row) { row.style.display = 'none'; });
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
            var labelText = (labelCell.textContent || labelCell.innerText).toUpperCase();
            var matchAcronym = false;
            var matchLibelle = false;

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

// ============================================================================
// IMPORT EXCEL
// ============================================================================

var excelImportRows = [];
var excelImportSheetName = '';
var excelImportHeaderDetected = false;
var excelImportColumnMap = null;
var SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

function normalizeExcelText(value) {
    return String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeDuplicateKey(value) {
    return normalizeExcelText(value).replace(/\s+/g, ' ');
}

function findHeaderType(value) {
    var normalized = normalizeExcelText(value);

    var acronymAliases = [
        'acronyme', 'acronymes', 'sigle', 'sigles', 'abreviation', 'abreviations',
        'acronyme sigle', 'sigle acronyme'
    ];
    var labelAliases = [
        'libelle', 'libelle complet', 'libelle long', 'intitule', 'intitule complet',
        'nom complet', 'designation'
    ];
    var definitionAliases = [
        'definition', 'definitions', 'description', 'descriptif'
    ];

    if (acronymAliases.indexOf(normalized) !== -1) return 'acronym';
    if (labelAliases.indexOf(normalized) !== -1) return 'label';
    if (definitionAliases.indexOf(normalized) !== -1) return 'definition';
    return null;
}

function detectExcelHeader(firstRow) {
    var map = {};

    firstRow.forEach(function(cell, index) {
        var type = findHeaderType(cell);
        if (type && map[type] == null) {
            map[type] = index;
        }
    });

    if (map.acronym != null && map.label != null && map.definition != null) {
        return {
            detected: true,
            map: map
        };
    }

    return {
        detected: false,
        map: { acronym: 0, label: 1, definition: 2 }
    };
}

function getExistingGlossaryKeys() {
    var acronymKeys = {};
    var labelKeys = {};

    document.querySelectorAll('#mainGlossaryTable tbody .main-term-row').forEach(function(row) {
        var acronymCell = row.querySelector('.main-acronym .view-mode');
        var labelCell = row.querySelector('.main-label .view-mode');
        var acronym = acronymCell ? acronymCell.textContent.trim() : '';
        var label = labelCell ? labelCell.textContent.trim() : '';

        var acronymKey = normalizeDuplicateKey(acronym);
        var labelKey = normalizeDuplicateKey(label);

        if (acronymKey) acronymKeys[acronymKey] = true;
        if (labelKey) labelKeys[labelKey] = true;
    });

    return { acronyms: acronymKeys, labels: labelKeys };
}

function analyzeExcelRows(rawRows, headerInfo) {
    var existing = getExistingGlossaryKeys();
    var seenAcronyms = {};
    var seenLabels = {};
    var startIndex = headerInfo.detected ? 1 : 0;
    var result = [];

    for (var i = startIndex; i < rawRows.length; i++) {
        var sourceRow = rawRows[i] || [];
        var acronym = String(sourceRow[headerInfo.map.acronym] == null ? '' : sourceRow[headerInfo.map.acronym]).trim();
        var label = String(sourceRow[headerInfo.map.label] == null ? '' : sourceRow[headerInfo.map.label]).trim();
        var definition = String(sourceRow[headerInfo.map.definition] == null ? '' : sourceRow[headerInfo.map.definition]).trim();

        // Ignore uniquement une ligne totalement vide.
        if (!acronym && !label && !definition) continue;

        var acronymKey = normalizeDuplicateKey(acronym);
        var labelKey = normalizeDuplicateKey(label);

        var rowInfo = {
            sourceLine: i + 1,
            acronym: acronym,
            label: label,
            definition: definition,
            invalid: !acronym || !label || !definition,
            duplicateAcronymGlossary: !!(acronymKey && existing.acronyms[acronymKey]),
            duplicateLabelGlossary: !!(labelKey && existing.labels[labelKey]),
            duplicateAcronymFile: !!(acronymKey && seenAcronyms[acronymKey]),
            duplicateLabelFile: !!(labelKey && seenLabels[labelKey])
        };

        rowInfo.duplicateAcronym = rowInfo.duplicateAcronymGlossary || rowInfo.duplicateAcronymFile;
        rowInfo.duplicateLabel = rowInfo.duplicateLabelGlossary || rowInfo.duplicateLabelFile;

        result.push(rowInfo);

        // Le premier exemplaire du fichier reste importable ; les suivants sont
        // signalés comme doublons internes.
        if (acronymKey && !seenAcronyms[acronymKey]) seenAcronyms[acronymKey] = true;
        if (labelKey && !seenLabels[labelKey]) seenLabels[labelKey] = true;
    }

    return result;
}

function ensureSheetJSLoaded() {
    if (window.XLSX) return Promise.resolve();

    return new Promise(function(resolve, reject) {
        var existingScript = document.getElementById('sheetJsGlossaryLibrary');
        if (existingScript) {
            existingScript.addEventListener('load', resolve, { once: true });
            existingScript.addEventListener('error', reject, { once: true });
            return;
        }

        var script = document.createElement('script');
        script.id = 'sheetJsGlossaryLibrary';
        script.src = SHEETJS_URL;
        script.type = 'text/javascript';
        script.onload = function() { resolve(); };
        script.onerror = function() { reject(new Error('Impossible de charger SheetJS')); };
        document.head.appendChild(script);
    });
}

function createExcelImportUi() {
    if (document.getElementById('btnImportExcelGlossary')) return;

    var addButton = document.querySelector('button[data-target="#glossaryModal"]');
    if (addButton) {
        var addRow = addButton.closest('.row');
        if (addRow) {
            var rightColumn = document.createElement('div');
            rightColumn.className = 'col-md-6 text-right';
            rightColumn.innerHTML =
                '<input type="file" id="excelGlossaryFileInput" accept=".xlsx,.xls,.xlsm,.xlsb" style="display:none;">' +
                '<button type="button" id="btnImportExcelGlossary" class="btn btn-default">' +
                    '<span class="glyphicon glyphicon-import"></span> Importer un Excel' +
                '</button>';
            addRow.appendChild(rightColumn);
        }
    }

    var modal = document.createElement('div');
    modal.innerHTML =
        '<div class="modal fade" id="excelGlossaryModal" tabindex="-1" role="dialog" aria-hidden="true">' +
          '<div class="modal-dialog modal-lg" role="document" style="width:95%; max-width:1400px;">' +
            '<div class="modal-content">' +
              '<div class="modal-header">' +
                '<button type="button" class="close" data-dismiss="modal" aria-label="Fermer"><span aria-hidden="true">&times;</span></button>' +
                '<h4 class="modal-title">Import Excel du glossaire</h4>' +
              '</div>' +
              '<div class="modal-body">' +
                '<div id="excelImportInfo" class="alert alert-info" style="margin-bottom:12px;"></div>' +
                '<div class="row">' +
                  '<div class="col-md-7">' +
                    '<h5><strong>Données récupérées</strong></h5>' +
                    '<div style="max-height:430px; overflow:auto; border:1px solid #ddd;">' +
                      '<table class="table table-striped table-bordered table-condensed" style="margin-bottom:0;">' +
                        '<thead><tr><th style="width:70px;">Ligne</th><th style="width:18%;">Acronyme</th><th style="width:32%;">Libellé</th><th>Définition</th></tr></thead>' +
                        '<tbody id="excelImportPreviewBody"></tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>' +
                  '<div class="col-md-5">' +
                    '<h5><strong>Doublons détectés</strong></h5>' +
                    '<p class="text-muted">Rouge = champ en doublon. La colonne Motif indique s\'il existe déjà dans le glossaire ou plus haut dans le fichier Excel.</p>' +
                    '<div style="max-height:330px; overflow:auto; border:1px solid #ddd;">' +
                      '<table class="table table-bordered table-condensed" style="margin-bottom:0;">' +
                        '<thead><tr><th>Ligne</th><th>Acronyme</th><th>Libellé</th><th>Motif</th></tr></thead>' +
                        '<tbody id="excelImportDuplicatesBody"></tbody>' +
                      '</table>' +
                    '</div>' +
                    '<div style="margin-top:15px; padding:12px; background:#f7f7f7; border:1px solid #ddd; border-radius:4px;">' +
                      '<label style="display:block;"><input type="checkbox" id="excelAcceptDuplicateAcronyms"> Accepter les acronymes en double</label>' +
                      '<label style="display:block; margin-bottom:0;"><input type="checkbox" id="excelAcceptDuplicateLabels"> Accepter les libellés en double</label>' +
                    '</div>' +
                    '<div id="excelImportSelectionSummary" class="text-muted" style="margin-top:10px;"></div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="modal-footer">' +
                '<button type="button" class="btn btn-default" data-dismiss="modal">Annuler</button>' +
                '<button type="button" id="btnExcelImportOnlyNew" class="btn btn-primary">Ajouter uniquement les nouveaux</button>' +
                '<button type="button" id="btnExcelImportWithOptions" class="btn btn-success">Ajouter selon les options</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

    document.body.appendChild(modal.firstChild);

    var importButton = document.getElementById('btnImportExcelGlossary');
    var fileInput = document.getElementById('excelGlossaryFileInput');

    if (importButton && fileInput) {
        importButton.addEventListener('click', function() {
            fileInput.value = '';
            fileInput.click();
        });

        fileInput.addEventListener('change', function(event) {
            var file = event.target.files && event.target.files[0];
            if (file) readGlossaryExcelFile(file);
        });
    }

    document.getElementById('excelAcceptDuplicateAcronyms').addEventListener('change', updateExcelImportSelectionSummary);
    document.getElementById('excelAcceptDuplicateLabels').addEventListener('change', updateExcelImportSelectionSummary);
    document.getElementById('btnExcelImportOnlyNew').addEventListener('click', function() {
        prepareExcelImport('newOnly');
    });
    document.getElementById('btnExcelImportWithOptions').addEventListener('click', function() {
        prepareExcelImport('options');
    });
}

async function readGlossaryExcelFile(file) {
    try {
        await ensureSheetJSLoaded();
    } catch (error) {
        alert('La bibliothèque Excel n\'a pas pu être chargée. Vérifiez que le wiki peut accéder à cdn.sheetjs.com.');
        return;
    }

    try {
        var buffer = await file.arrayBuffer();
        var workbook = XLSX.read(buffer, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            alert('Le fichier Excel ne contient aucune feuille lisible.');
            return;
        }

        excelImportSheetName = workbook.SheetNames[0];
        var worksheet = workbook.Sheets[excelImportSheetName];
        var rawRows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            defval: ''
        });

        if (!rawRows.length) {
            alert('La première feuille du fichier est vide.');
            return;
        }

        var headerInfo = detectExcelHeader(rawRows[0] || []);
        excelImportHeaderDetected = headerInfo.detected;
        excelImportColumnMap = headerInfo.map;
        excelImportRows = analyzeExcelRows(rawRows, headerInfo);

        if (!excelImportRows.length) {
            alert('Aucune ligne de données n\'a été trouvée dans les trois colonnes attendues.');
            return;
        }

        renderExcelImportPreview(file.name);
        jQuery('#excelGlossaryModal').modal('show');
    } catch (error) {
        console.error(error);
        alert('Impossible de lire ce fichier Excel : ' + error.message);
    }
}

function renderExcelImportPreview(fileName) {
    var previewBody = document.getElementById('excelImportPreviewBody');
    var duplicatesBody = document.getElementById('excelImportDuplicatesBody');
    var info = document.getElementById('excelImportInfo');
    previewBody.innerHTML = '';
    duplicatesBody.innerHTML = '';

    var columnDescription;
    if (excelImportHeaderDetected) {
        columnDescription = 'Entête reconnue : colonnes retrouvées par leur nom (Acronyme, Libellé, Définition).';
    } else {
        columnDescription = 'Aucune entête complète reconnue : les colonnes 1, 2 et 3 sont utilisées dans cet ordre.';
    }

    info.textContent = fileName + ' — feuille « ' + excelImportSheetName + ' » — ' + columnDescription;

    var duplicateCount = 0;
    var invalidCount = 0;

    excelImportRows.forEach(function(row) {
        var tr = document.createElement('tr');
        var acronymDanger = row.duplicateAcronym || !row.acronym;
        var labelDanger = row.duplicateLabel || !row.label;
        var definitionDanger = !row.definition;

        tr.innerHTML =
            '<td>' + row.sourceLine + '</td>' +
            '<td' + (acronymDanger ? ' class="danger"' : '') + '></td>' +
            '<td' + (labelDanger ? ' class="danger"' : '') + '></td>' +
            '<td' + (definitionDanger ? ' class="danger"' : '') + '></td>';
        tr.children[1].textContent = row.acronym;
        tr.children[2].textContent = row.label;
        tr.children[3].textContent = row.definition;
        previewBody.appendChild(tr);

        if (row.invalid) invalidCount++;

        if (row.duplicateAcronym || row.duplicateLabel) {
            duplicateCount++;
            var duplicateRow = document.createElement('tr');
            var reasons = [];

            if (row.duplicateAcronymGlossary) reasons.push('Acronyme : glossaire');
            if (row.duplicateAcronymFile) reasons.push('Acronyme : fichier Excel');
            if (row.duplicateLabelGlossary) reasons.push('Libellé : glossaire');
            if (row.duplicateLabelFile) reasons.push('Libellé : fichier Excel');

            duplicateRow.innerHTML =
                '<td>' + row.sourceLine + '</td>' +
                '<td' + (row.duplicateAcronym ? ' class="danger"' : '') + '></td>' +
                '<td' + (row.duplicateLabel ? ' class="danger"' : '') + '></td>' +
                '<td></td>';
            duplicateRow.children[1].textContent = row.acronym;
            duplicateRow.children[2].textContent = row.label;
            duplicateRow.children[3].textContent = reasons.join(' ; ');
            duplicatesBody.appendChild(duplicateRow);
        }
    });

    if (!duplicateCount) {
        var emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="4" class="text-success">Aucun doublon détecté.</td>';
        duplicatesBody.appendChild(emptyRow);
    }

    if (invalidCount) {
        var warning = document.createElement('div');
        warning.className = 'alert alert-warning';
        warning.style.marginTop = '10px';
        warning.style.marginBottom = '0';
        warning.textContent = invalidCount + ' ligne(s) incomplète(s) seront ignorées. Les cellules manquantes sont affichées en rouge.';
        info.parentNode.insertBefore(warning, info.nextSibling);
        warning.setAttribute('data-excel-invalid-warning', 'true');
    }

    var oldWarnings = document.querySelectorAll('[data-excel-invalid-warning="true"]');
    if (!invalidCount) {
        oldWarnings.forEach(function(element) { element.remove(); });
    } else if (oldWarnings.length > 1) {
        for (var i = 0; i < oldWarnings.length - 1; i++) oldWarnings[i].remove();
    }

    document.getElementById('excelAcceptDuplicateAcronyms').checked = false;
    document.getElementById('excelAcceptDuplicateLabels').checked = false;
    updateExcelImportSelectionSummary();
}

function getRowsForExcelImport(mode) {
    var allowAcronymDuplicates = document.getElementById('excelAcceptDuplicateAcronyms').checked;
    var allowLabelDuplicates = document.getElementById('excelAcceptDuplicateLabels').checked;

    return excelImportRows.filter(function(row) {
        if (row.invalid) return false;

        if (mode === 'newOnly') {
            return !row.duplicateAcronym && !row.duplicateLabel;
        }

        if (row.duplicateAcronym && !allowAcronymDuplicates) return false;
        if (row.duplicateLabel && !allowLabelDuplicates) return false;
        return true;
    });
}

function updateExcelImportSelectionSummary() {
    var summary = document.getElementById('excelImportSelectionSummary');
    if (!summary) return;

    var newOnlyCount = getRowsForExcelImport('newOnly').length;
    var withOptionsCount = getRowsForExcelImport('options').length;
    summary.textContent = newOnlyCount + ' ligne(s) strictement nouvelles ; ' + withOptionsCount + ' ligne(s) importables avec les options actuelles.';
}

function prepareExcelImport(mode) {
    var rows = getRowsForExcelImport(mode);
    if (!rows.length) {
        alert('Aucune ligne ne correspond aux règles d\'import sélectionnées.');
        return;
    }

    var allowAcronymDuplicates = mode === 'options' && document.getElementById('excelAcceptDuplicateAcronyms').checked;
    var allowLabelDuplicates = mode === 'options' && document.getElementById('excelAcceptDuplicateLabels').checked;
    var skipped = excelImportRows.length - rows.length;

    var message = 'Confirmer l\'ajout de ' + rows.length + ' terme(s) ?';
    if (skipped > 0) {
        message += '\n' + skipped + ' ligne(s) seront ignorées selon les règles choisies.';
    }
    if (allowAcronymDuplicates) message += '\n- Acronymes en double : acceptés';
    if (allowLabelDuplicates) message += '\n- Libellés en double : acceptés';

    if (!window.confirm(message)) return;

    executeExcelImport(rows, allowAcronymDuplicates, allowLabelDuplicates);
}

function extractGlossaryServerText(responseText) {
    var holder = document.createElement('div');
    holder.innerHTML = responseText;
    var text = (holder.textContent || holder.innerText || '').trim();
    return text || responseText.trim();
}

async function executeExcelImport(rows, allowAcronymDuplicates, allowLabelDuplicates) {
    var table = document.getElementById('mainGlossaryTable');
    var csrfToken = table.getAttribute('data-csrf');
    var importButton = document.getElementById('btnExcelImportWithOptions');
    var newOnlyButton = document.getElementById('btnExcelImportOnlyNew');

    var donnees = new FormData();
    donnees.append('action', 'import');
    donnees.append('form_token', csrfToken);
    donnees.append('rowCount', String(rows.length));
    donnees.append('allowAcronymDuplicates', allowAcronymDuplicates ? 'true' : 'false');
    donnees.append('allowLabelDuplicates', allowLabelDuplicates ? 'true' : 'false');

    rows.forEach(function(row, index) {
        donnees.append('acronym_' + index, row.acronym);
        donnees.append('label_' + index, row.label);
        donnees.append('definition_' + index, row.definition);
    });

    importButton.disabled = true;
    newOnlyButton.disabled = true;

    try {
        var response = await fetch(urlGlossaireData + '?xpage=plain', {
            method: 'POST',
            body: donnees,
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        var rawResult = await response.text();
        var plainResult = extractGlossaryServerText(rawResult);

        if (plainResult.indexOf('GLOSSAIRE_IMPORT_OK') === -1) {
            alert('Erreur d\'import : ' + plainResult);
            return;
        }

        var lines = plainResult.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
        var created = 0;
        var skipped = 0;

        lines.forEach(function(line) {
            if (line.indexOf('ROW_OK|') === 0) {
                var parts = line.split('|');
                var rowIndex = parseInt(parts[1], 10);
                var fullRef = parts[2] || '';
                var docName = parts[3] || '';
                if (!isNaN(rowIndex) && rows[rowIndex]) {
                    appendImportedGlossaryRow(rows[rowIndex], fullRef, docName);
                    created++;
                }
            } else if (line.indexOf('ROW_SKIP|') === 0 || line.indexOf('ROW_ERROR|') === 0) {
                skipped++;
            }
        });

        applyCurrentSort();
        sortPopupTableAlphabetically();
        filterMainTableColumns();
        jQuery('#excelGlossaryModal').modal('hide');

        alert('Import terminé : ' + created + ' terme(s) ajouté(s)' + (skipped ? ', ' + skipped + ' ligne(s) ignorée(s).' : '.'));
    } catch (error) {
        console.error(error);
        alert('Impossible de joindre la page DATA pendant l\'import : ' + error);
    } finally {
        importButton.disabled = false;
        newOnlyButton.disabled = false;
    }
}

function escapeGlossaryHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function appendImportedGlossaryRow(data, fullRef, docName) {
    var tbody = document.querySelector('#mainGlossaryTable tbody');
    if (!tbody) return;

    var tr = document.createElement('tr');
    tr.className = 'main-term-row';
    tr.setAttribute('data-acronym', data.acronym.toUpperCase());
    tr.setAttribute('data-doc-name', docName);
    tr.setAttribute('data-full-ref', fullRef);
    tr.dataset.filteredMatch = 'true';

    tr.innerHTML =
        '<td class="main-acronym">' +
          '<span class="view-mode"><strong>' + escapeGlossaryHtml(data.acronym) + '</strong></span>' +
          '<input type="text" class="form-control edit-mode edit-acronym" value="' + escapeGlossaryHtml(data.acronym) + '" style="display:none; width:100%;">' +
        '</td>' +
        '<td class="main-label">' +
          '<span class="view-mode">' + escapeGlossaryHtml(data.label) + '</span>' +
          '<input type="text" class="form-control edit-mode edit-label" value="' + escapeGlossaryHtml(data.label) + '" style="display:none; width:100%;">' +
        '</td>' +
        '<td class="main-definition">' +
          '<span class="view-mode">' + escapeGlossaryHtml(data.definition) + '</span>' +
          '<textarea class="form-control edit-mode edit-definition" style="display:none; width:100%;" rows="2">' + escapeGlossaryHtml(data.definition) + '</textarea>' +
        '</td>' +
        '<td>' +
          '<div class="view-buttons">' +
            '<button type="button" class="btn btn-xs btn-primary custom-action-btn" onclick="toggleEditMode(this, true);"><span class="glyphicon glyphicon-pencil"></span></button> ' +
            '<button type="button" class="btn btn-xs btn-danger custom-action-btn" onclick="openDeleteModal(this);"><span class="glyphicon glyphicon-trash"></span></button>' +
          '</div>' +
          '<div class="edit-buttons" style="display:none; gap:5px;">' +
            '<button type="button" class="btn btn-xs btn-success" onclick="saveRowEdition(this);"><span class="glyphicon glyphicon-ok"></span> Sauver</button> ' +
            '<button type="button" class="btn btn-xs btn-default" onclick="toggleEditMode(this, false);"><span class="glyphicon glyphicon-remove"></span></button>' +
          '</div>' +
        '</td>';

    tbody.appendChild(tr);

    var popupBody = document.querySelector('#popupCheckTable tbody');
    if (popupBody) {
        var popupRow = document.createElement('tr');
        popupRow.className = 'term-row';
        popupRow.setAttribute('data-full-ref', fullRef);
        popupRow.innerHTML = '<td class="term-acronym"></td><td class="term-label"></td>';
        popupRow.children[0].textContent = data.acronym;
        popupRow.children[1].textContent = data.label;
        popupBody.appendChild(popupRow);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    createExcelImportUi();
});
