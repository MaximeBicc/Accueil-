// Extension JavaScript de page pour le glossaire.
// Tout le comportement ajouté au WebHome est centralisé ici.

var glossarySheetJSLibrary = null;
var excelImportFileName = '';
var excelImportHeaderInfo = null;
var glossaryBulkDeleteMode = false;

function getGlossaryXWikiIcon(name) {
    var table = document.getElementById('mainGlossaryTable');
    if (!table) return '';
    return table.getAttribute('data-icon-' + name) || '';
}

function updateGlossarySortButtons() {
    var buttons = document.querySelectorAll('.sort-column-btn');
    var arrow = getGlossaryXWikiIcon('right');

    buttons.forEach(function(button) {
        var column = button.getAttribute('data-column');
        var label = button.querySelector('.sort-label');
        var isActive = column === currentSortColumn;
        var direction = isActive ? currentSortDirection : 'asc';

        button.setAttribute('data-sort-active', isActive ? 'true' : 'false');
        button.setAttribute('data-sort-direction', direction);
        button.classList.toggle('active', isActive);

        if (label) {
            label.innerHTML = direction === 'desc'
                ? 'Z ' + arrow + ' A'
                : 'A ' + arrow + ' Z';
        }
    });
}

function isGlossarySheetJSLibrary(candidate) {
    return !!candidate &&
        typeof candidate.read === 'function' &&
        candidate.utils &&
        typeof candidate.utils.sheet_to_json === 'function';
}

function fixedEnsureSheetJSLoaded() {
    if (isGlossarySheetJSLibrary(glossarySheetJSLibrary)) {
        return Promise.resolve(glossarySheetJSLibrary);
    }

    if (isGlossarySheetJSLibrary(window.XLSX)) {
        glossarySheetJSLibrary = window.XLSX;
        return Promise.resolve(glossarySheetJSLibrary);
    }

    return new Promise(function(resolve, reject) {
        var previousXLSX = window.XLSX;
        var previousDefine = window.define;
        var previousDefineWasAMD = !!(previousDefine && previousDefine.amd);

        try {
            if (previousDefineWasAMD) window.define = undefined;
            window.XLSX = undefined;
        } catch (e) {}

        var existingScript = document.getElementById('sheetJsGlossaryLibrary');
        if (existingScript && existingScript.parentNode) {
            existingScript.parentNode.removeChild(existingScript);
        }

        var script = document.createElement('script');
        script.id = 'sheetJsGlossaryLibrary';
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        script.type = 'text/javascript';

        function restoreRequireJS() {
            if (previousDefineWasAMD) window.define = previousDefine;
        }

        script.onload = function() {
            restoreRequireJS();
            if (isGlossarySheetJSLibrary(window.XLSX)) {
                glossarySheetJSLibrary = window.XLSX;
                resolve(glossarySheetJSLibrary);
                return;
            }

            window.XLSX = previousXLSX;
            reject(new Error('SheetJS est chargé mais read() / utils.sheet_to_json() ne sont pas disponibles.'));
        };

        script.onerror = function() {
            restoreRequireJS();
            window.XLSX = previousXLSX;
            reject(new Error('Impossible de charger SheetJS depuis cdn.sheetjs.com.'));
        };

        document.head.appendChild(script);
    });
}

function fixedDetectExcelHeader(firstRow) {
    var map = {};
    var usedIndexes = {};
    var recognizedTypes = [];
    var canonicalTypes = ['acronym', 'label', 'definition'];

    firstRow.forEach(function(cell, index) {
        var type = findHeaderType(cell);
        if (type && map[type] == null) {
            map[type] = index;
            usedIndexes[index] = true;
            recognizedTypes.push(type);
        }
    });

    if (!recognizedTypes.length) {
        return {
            detected: false,
            map: { acronym: 0, label: 1, definition: 2 },
            recognizedTypes: [],
            inferredTypes: []
        };
    }

    var missingTypes = canonicalTypes.filter(function(type) {
        return map[type] == null;
    });

    var availableIndexes = [];
    for (var i = 0; i < 3; i++) {
        if (!usedIndexes[i]) availableIndexes.push(i);
    }
    for (var j = 3; j < firstRow.length; j++) {
        if (!usedIndexes[j]) availableIndexes.push(j);
    }

    var nextIndex = firstRow.length;
    while (availableIndexes.length < missingTypes.length) {
        if (!usedIndexes[nextIndex]) availableIndexes.push(nextIndex);
        nextIndex++;
    }

    missingTypes.forEach(function(type) {
        map[type] = availableIndexes.shift();
    });

    return {
        detected: true,
        map: map,
        recognizedTypes: recognizedTypes,
        inferredTypes: missingTypes
    };
}

function fixedRecomputeExcelDuplicateFlags(rows) {
    var existing = getExistingGlossaryKeys();
    var seenAcronyms = Object.create(null);
    var seenLabels = Object.create(null);

    rows.forEach(function(row) {
        var acronymKey = normalizeDuplicateKey(row.acronym);
        var labelKey = normalizeDuplicateKey(row.label);

        row.invalid = !row.acronym || !row.label;
        row.duplicateAcronymGlossary = !!(acronymKey && existing.acronyms[acronymKey]);
        row.duplicateLabelGlossary = !!(labelKey && existing.labels[labelKey]);
        row.duplicateAcronymFile = !!(acronymKey && seenAcronyms[acronymKey]);
        row.duplicateLabelFile = !!(labelKey && seenLabels[labelKey]);
        row.duplicateAcronym = row.duplicateAcronymGlossary || row.duplicateAcronymFile;
        row.duplicateLabel = row.duplicateLabelGlossary || row.duplicateLabelFile;

        if (acronymKey && !seenAcronyms[acronymKey]) seenAcronyms[acronymKey] = true;
        if (labelKey && !seenLabels[labelKey]) seenLabels[labelKey] = true;
    });

    return rows;
}

function fixedAnalyzeExcelRows(rawRows, headerInfo) {
    var startIndex = headerInfo.detected ? 1 : 0;
    var result = [];

    for (var i = startIndex; i < rawRows.length; i++) {
        var sourceRow = rawRows[i] || [];
        var acronym = String(sourceRow[headerInfo.map.acronym] == null ? '' : sourceRow[headerInfo.map.acronym]).trim();
        var label = String(sourceRow[headerInfo.map.label] == null ? '' : sourceRow[headerInfo.map.label]).trim();
        var definition = String(sourceRow[headerInfo.map.definition] == null ? '' : sourceRow[headerInfo.map.definition]).trim();

        if (!acronym && !label && !definition) continue;

        result.push({
            sourceLine: i + 1,
            acronym: acronym,
            label: label,
            definition: definition
        });
    }

    return fixedRecomputeExcelDuplicateFlags(result);
}

function fixedEditExcelImportRow(rowIndex, field, value) {
    if (!canImportGlossary() || glossaryImportBusy) return;
    if (!excelImportRows[rowIndex]) return;
    excelImportRows[rowIndex][field] = String(value == null ? '' : value).trim();
    fixedRecomputeExcelDuplicateFlags(excelImportRows);
    fixedRenderExcelImportPreview(excelImportFileName);
}

function fixedDeleteExcelImportRow(rowIndex) {
    if (!canImportGlossary() || glossaryImportBusy) return;
    if (rowIndex < 0 || rowIndex >= excelImportRows.length) return;
    excelImportRows.splice(rowIndex, 1);
    fixedRecomputeExcelDuplicateFlags(excelImportRows);
    fixedRenderExcelImportPreview(excelImportFileName);
}

function fixedRenderExcelImportPreview(fileName) {
    excelImportFileName = fileName || excelImportFileName || '';
    fixedRecomputeExcelDuplicateFlags(excelImportRows);

    var previewBody = document.getElementById('excelImportPreviewBody');
    var duplicatesBody = document.getElementById('excelImportDuplicatesBody');
    var info = document.getElementById('excelImportInfo');
    if (!previewBody || !duplicatesBody || !info) return;

    previewBody.innerHTML = '';
    duplicatesBody.innerHTML = '';

    var headerInfo = excelImportHeaderInfo || {};
    var columnDescription;

    if (excelImportHeaderDetected) {
        var inferredLabels = (headerInfo.inferredTypes || []).map(function(type) {
            if (type === 'acronym') return 'Acronyme';
            if (type === 'label') return 'Libellé';
            return 'Définition';
        });

        columnDescription = 'Entête détectée dès qu’au moins un champ est reconnu.';
        if (inferredLabels.length) {
            columnDescription += ' Colonne(s) déduite(s) par élimination : ' + inferredLabels.join(', ') + '.';
        }
    } else {
        columnDescription = 'Aucun entête reconnu : colonnes 1, 2 et 3 utilisées dans cet ordre.';
    }

    info.textContent = excelImportFileName + '. Feuille : ' + excelImportSheetName + '. ' + columnDescription;

    var duplicateCount = 0;
    var invalidCount = 0;

    excelImportRows.forEach(function(row, rowIndex) {
        var tr = document.createElement('tr');

        var lineCell = document.createElement('td');
        lineCell.textContent = row.sourceLine;
        tr.appendChild(lineCell);

        function addEditableCell(field, value, isDanger, isDefinition) {
            var td = document.createElement('td');
            if (isDanger) td.classList.add('danger');

            var input = isDefinition ? document.createElement('textarea') : document.createElement('input');
            if (isDefinition) input.rows = 2;
            else input.type = 'text';

            input.className = 'form-control input-sm excel-import-input';
            input.value = value;
            input.addEventListener('change', function() {
                fixedEditExcelImportRow(rowIndex, field, this.value);
            });

            td.appendChild(input);
            tr.appendChild(td);
        }

        addEditableCell('acronym', row.acronym, row.duplicateAcronym || !row.acronym, false);
        addEditableCell('label', row.label, row.duplicateLabel || !row.label, false);
        addEditableCell('definition', row.definition, false, true);

        var actionCell = document.createElement('td');
        actionCell.className = 'excel-import-action-cell';
        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-xs btn-danger';
        deleteButton.title = 'Supprimer cette ligne de l’import';
        deleteButton.innerHTML = getGlossaryXWikiIcon('trash');
        deleteButton.addEventListener('click', function() {
            fixedDeleteExcelImportRow(rowIndex);
        });
        actionCell.appendChild(deleteButton);
        tr.appendChild(actionCell);
        previewBody.appendChild(tr);

        if (row.invalid) invalidCount++;

        if (row.duplicateAcronym || row.duplicateLabel) {
            duplicateCount++;
            var duplicateRow = document.createElement('tr');
            var reasons = [];

            var existingSource = canManageGlossary() ? 'glossaire' : 'glossaire ou mes propositions en attente';
            if (row.duplicateAcronymGlossary) reasons.push('Acronyme : ' + existingSource);
            if (row.duplicateAcronymFile) reasons.push('Acronyme : fichier Excel');
            if (row.duplicateLabelGlossary) reasons.push('Libellé : ' + existingSource);
            if (row.duplicateLabelFile) reasons.push('Libellé : fichier Excel');

            duplicateRow.innerHTML = '<td>' + row.sourceLine + '</td><td></td><td></td><td></td>';
            if (row.duplicateAcronym) duplicateRow.children[1].classList.add('danger');
            if (row.duplicateLabel) duplicateRow.children[2].classList.add('danger');
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

    document.querySelectorAll('[data-excel-invalid-warning="true"]').forEach(function(element) {
        element.remove();
    });

    if (invalidCount) {
        var warning = document.createElement('div');
        warning.className = 'alert alert-warning excel-import-warning';
        warning.textContent = invalidCount + ' ligne(s) incomplète(s) seront ignorées. Vous pouvez les corriger directement dans le tableau.';
        warning.setAttribute('data-excel-invalid-warning', 'true');
        info.parentNode.insertBefore(warning, info.nextSibling);
    }

    updateExcelImportSelectionSummary();
}

async function fixedReadGlossaryExcelFile(file) {
    if (!canImportGlossary() || glossaryImportBusy) return;
    var xlsxLibrary;

    try {
        xlsxLibrary = await fixedEnsureSheetJSLoaded();
    } catch (error) {
        console.error(error);
        showGlossaryToast('La bibliothèque Excel n\'a pas pu être chargée correctement : ' + error.message, true);
        return;
    }

    try {
        var buffer = await file.arrayBuffer();
        if (!isGlossarySheetJSLibrary(xlsxLibrary)) {
            throw new Error('La bibliothèque SheetJS chargée ne possède pas read()');
        }

        var workbook = xlsxLibrary.read(buffer, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            showGlossaryToast('Le fichier Excel ne contient aucune feuille lisible.', true);
            return;
        }

        excelImportSheetName = workbook.SheetNames[0];
        var worksheet = workbook.Sheets[excelImportSheetName];
        var rawRows = xlsxLibrary.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            defval: ''
        });

        if (!rawRows.length) {
            showGlossaryToast('La première feuille du fichier est vide.', true);
            return;
        }

        var headerInfo = fixedDetectExcelHeader(rawRows[0] || []);
        excelImportHeaderInfo = headerInfo;
        excelImportHeaderDetected = headerInfo.detected;
        excelImportColumnMap = headerInfo.map;
        excelImportRows = fixedAnalyzeExcelRows(rawRows, headerInfo);

        if (!excelImportRows.length) {
            showGlossaryToast('Aucune ligne de données n\'a été trouvée dans les trois colonnes attendues.', true);
            return;
        }

        var acceptAcronym = document.getElementById('excelAcceptDuplicateAcronyms');
        var acceptLabel = document.getElementById('excelAcceptDuplicateLabels');
        if (acceptAcronym) acceptAcronym.checked = false;
        if (acceptLabel) acceptLabel.checked = false;

        fixedRenderExcelImportPreview(file.name);
        jQuery('#excelGlossaryModal').modal('show');
    } catch (error) {
        console.error(error);
        showGlossaryToast('Impossible de lire ce fichier Excel : ' + error.message, true);
    }
}

function createExcelImportUi() {
    if (!canViewGlossary()) return;
    if (document.getElementById('excelExampleGlossaryModal')) return;

    var eyeIcon = getGlossaryXWikiIcon('eye');
    var downloadIcon = getGlossaryXWikiIcon('download');
    var crossIcon = getGlossaryXWikiIcon('cross');

    var toolbarRight = document.getElementById('glossaryImportToolbar');
    if (toolbarRight) {
        toolbarRight.innerHTML =
            '<button type="button" id="btnExcelExampleGlossary" class="btn btn-default">' +
                eyeIcon + ' Voir un exemple Excel' +
            '</button>' + (canImportGlossary() ?
            '<input type="file" id="excelGlossaryFileInput" accept=".xlsx,.xls,.xlsm,.xlsb" class="glossary-hidden-file-input">' +
            '<button type="button" id="btnImportExcelGlossary" class="btn btn-default">' +
                downloadIcon + ' Importer un Excel' +
            '</button>' : '');
    }

    var exampleModal = document.createElement('div');
    exampleModal.innerHTML =
        '<div class="modal fade" id="excelExampleGlossaryModal" tabindex="-1" role="dialog" aria-hidden="true">' +
          '<div class="modal-dialog modal-lg" role="document">' +
            '<div class="modal-content">' +
              '<div class="modal-header">' +
                '<button type="button" class="close" data-dismiss="modal" aria-label="Fermer">' + crossIcon + '</button>' +
                '<h4 class="modal-title">Exemple de fichier Excel</h4>' +
              '</div>' +
              '<div class="modal-body">' +
                '<p>Format conseillé : une première ligne d’entête, puis une ligne par terme du glossaire.</p>' +
                '<div class="table-responsive">' +
                  '<table class="table table-striped table-bordered">' +
                    '<thead><tr><th>Acronyme</th><th>Libellé</th><th>Définition</th></tr></thead>' +
                    '<tbody>' +
                      '<tr><td>API</td><td>Application Programming Interface</td><td>Interface permettant à plusieurs logiciels de communiquer entre eux.</td></tr>' +
                      '<tr><td>HTTP</td><td>HyperText Transfer Protocol</td><td>Protocole utilisé pour les échanges de données sur le Web.</td></tr>' +
                      '<tr><td>UX</td><td>User Experience</td><td>Ensemble des éléments qui composent l’expérience d’un utilisateur.</td></tr>' +
                    '</tbody>' +
                  '</table>' +
                '</div>' +
                '<div class="alert alert-info">' +
                  '<strong>A savoir :</strong> l’ordre des colonnes peut changer si leurs entêtes sont reconnues. ' +
                  'Si une seule entête est reconnue, la ligne est considérée comme une ligne d’entête et les colonnes restantes sont déduites par élimination. ' +
                  'Sans entête reconnue, les trois premières colonnes sont utilisées dans l’ordre Acronyme, Libellé, Définition.' +
                '</div>' +
              '</div>' +
              '<div class="modal-footer">' +
                '<button type="button" class="btn btn-default" data-dismiss="modal">Fermer</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    document.body.appendChild(exampleModal.firstChild);

    var exampleButton = document.getElementById('btnExcelExampleGlossary');
    if (exampleButton) {
        exampleButton.addEventListener('click', function() {
            jQuery('#excelExampleGlossaryModal').modal('show');
        });
    }
    if (!canImportGlossary()) return;
    var directImport = canManageGlossary();

    var modal = document.createElement('div');
    modal.innerHTML =
        '<div class="modal fade" id="excelGlossaryModal" tabindex="-1" role="dialog" aria-hidden="true">' +
          '<div class="modal-dialog modal-lg excel-import-dialog" role="document">' +
            '<div class="modal-content">' +
              '<div class="modal-header">' +
                '<button type="button" class="close" data-dismiss="modal" aria-label="Fermer">' + crossIcon + '</button>' +
                '<h4 class="modal-title">' + (directImport ? 'Import Excel du glossaire' : 'Proposer des acronymes depuis Excel') + '</h4>' +
              '</div>' +
              '<div class="modal-body">' +
                '<p id="excelImportPublicationHint" class="alert alert-info">' +
                  (directImport ? 'Chaque ligne retenue sera ajoutée directement au glossaire.' :
                    'Chaque ligne retenue sera envoyée comme proposition aux validateurs. Les acronymes apparaîtront dans le glossaire après validation. Vous pourrez suivre chaque proposition dans « Mes propositions ».') +
                '</p>' +
                '<div id="excelImportInfo" class="alert alert-info excel-import-info"></div>' +
                '<div class="row">' +
                  '<div class="col-md-7">' +
                    '<h5><strong>Données récupérées</strong></h5>' +
                    '<div class="excel-import-table-wrap excel-import-preview-wrap">' +
                      '<table class="table table-striped table-bordered table-condensed excel-import-table">' +
                        '<thead><tr><th class="excel-line-col">Ligne</th><th class="excel-acronym-col">Acronyme</th><th class="excel-label-col">Libellé</th><th>Définition</th><th class="excel-action-col">Action</th></tr></thead>' +
                        '<tbody id="excelImportPreviewBody"></tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>' +
                  '<div class="col-md-5">' +
                    '<h5><strong>Doublons détectés</strong></h5>' +
                    '<p class="text-muted">Rouge = champ en doublon. Vérification dans le glossaire' +
                      (directImport ? '' : ', vos propositions en attente') + ' et le fichier Excel.</p>' +
                    '<div class="excel-import-table-wrap excel-import-duplicates-wrap">' +
                      '<table class="table table-bordered table-condensed excel-import-table">' +
                        '<thead><tr><th>Ligne</th><th>Acronyme</th><th>Libellé</th><th>Motif</th></tr></thead>' +
                        '<tbody id="excelImportDuplicatesBody"></tbody>' +
                      '</table>' +
                    '</div>' +
                    '<div class="excel-import-options">' +
                      '<label><input type="checkbox" id="excelAcceptDuplicateAcronyms"> Accepter les acronymes en double</label>' +
                      '<label><input type="checkbox" id="excelAcceptDuplicateLabels"> Accepter les libellés en double</label>' +
                    '</div>' +
                    '<div id="excelImportSelectionSummary" class="text-muted excel-import-summary"></div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="modal-footer">' +
                '<button type="button" class="btn btn-default" data-dismiss="modal">Annuler</button>' +
                '<button type="button" id="btnExcelImportOnlyNew" class="btn btn-primary">' + (directImport ? 'Ajouter uniquement les nouveaux' : 'Proposer uniquement les nouveaux') + '</button>' +
                '<button type="button" id="btnExcelImportWithOptions" class="btn btn-success">' + (directImport ? 'Ajouter selon les options' : 'Proposer selon les options') + '</button>' +
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
            if (file) fixedReadGlossaryExcelFile(file);
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

function appendImportedGlossaryRow(data, fullRef, docName) {
    if (!canManageGlossary()) return;
    var tbody = document.querySelector('#mainGlossaryTable tbody');
    if (!tbody) return;
    var alreadyDisplayed = Array.from(tbody.querySelectorAll('.main-term-row')).some(function(row) {
        return row.getAttribute('data-full-ref') === fullRef;
    });
    if (alreadyDisplayed) return;

    var tr = document.createElement('tr');
    tr.className = 'main-term-row';
    tr.setAttribute('data-acronym', data.acronym.toUpperCase());
    tr.setAttribute('data-doc-name', docName);
    tr.setAttribute('data-full-ref', fullRef);
    tr.dataset.filteredMatch = 'true';

    tr.innerHTML =
        '<td class="main-acronym">' +
          '<span class="view-mode"><strong>' + escapeGlossaryHtml(data.acronym) + '</strong></span>' +
          '<input type="text" class="form-control edit-mode edit-acronym glossary-edit-field" value="' + escapeGlossaryHtml(data.acronym) + '">' +
        '</td>' +
        '<td class="main-label">' +
          '<span class="view-mode">' + escapeGlossaryHtml(data.label) + '</span>' +
          '<input type="text" class="form-control edit-mode edit-label glossary-edit-field" value="' + escapeGlossaryHtml(data.label) + '">' +
        '</td>' +
        '<td class="main-definition">' +
          '<span class="view-mode">' + escapeGlossaryHtml(data.definition) + '</span>' +
          '<textarea class="form-control edit-mode edit-definition glossary-edit-field" rows="2">' + escapeGlossaryHtml(data.definition) + '</textarea>' +
        '</td>' +
        '<td>' +
          '<div class="view-buttons">' +
            '<button type="button" class="btn btn-xs btn-primary custom-action-btn js-edit-row" aria-label="Modifier" title="Modifier">' + getGlossaryXWikiIcon('pencil') + '</button> ' +
            '<button type="button" class="btn btn-xs btn-danger custom-action-btn js-delete-row" aria-label="Supprimer" title="Supprimer">' + getGlossaryXWikiIcon('trash') + '</button>' +
          '</div>' +
          '<div class="edit-buttons glossary-edit-buttons">' +
            '<button type="button" class="btn btn-xs btn-success js-save-row">' + getGlossaryXWikiIcon('check') + ' Enregistrer</button> ' +
            '<button type="button" class="btn btn-xs btn-default js-cancel-row" aria-label="Annuler" title="Annuler">' + getGlossaryXWikiIcon('cross') + '</button>' +
          '</div>' +
        '</td>';

    tbody.appendChild(tr);
    ensureGlossaryBulkSelectCell(tr);

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

function ensureGlossaryBulkSelectCell(row) {
    if (!canManageGlossary()) return;
    if (!row || row.querySelector('.glossary-row-select')) return;

    var cell = document.createElement('td');
    cell.className = 'glossary-bulk-select-cell';
    if (!glossaryBulkDeleteMode) cell.classList.add('is-hidden');

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'glossary-row-select';
    checkbox.setAttribute('aria-label', 'Sélectionner cette ligne');
    checkbox.addEventListener('change', updateGlossaryBulkDeleteState);

    cell.appendChild(checkbox);
    row.insertBefore(cell, row.firstChild);
}

function getSelectedGlossaryRows() {
    return Array.from(document.querySelectorAll('#mainGlossaryTable tbody .main-term-row')).filter(function(row) {
        var checkbox = row.querySelector('.glossary-row-select');
        return !!checkbox && checkbox.checked;
    });
}

function getVisibleGlossaryRows() {
    return Array.from(document.querySelectorAll('#mainGlossaryTable tbody .main-term-row')).filter(function(row) {
        return row.style.display !== 'none';
    });
}

function updateGlossaryBulkDeleteState() {
    var selectedRows = getSelectedGlossaryRows();
    var button = document.getElementById('btnBulkDeleteGlossary');
    var selectAll = document.getElementById('glossarySelectAllVisible');

    if (button) {
        button.disabled = selectedRows.length === 0;
        button.innerHTML = getGlossaryXWikiIcon('trash') + ' Supprimer la sélection (' + selectedRows.length + ')';
    }

    if (selectAll) {
        var visibleRows = getVisibleGlossaryRows();
        var visibleSelected = visibleRows.filter(function(row) {
            var checkbox = row.querySelector('.glossary-row-select');
            return checkbox && checkbox.checked;
        }).length;

        selectAll.checked = visibleRows.length > 0 && visibleSelected === visibleRows.length;
        selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleRows.length;
    }
}

function toggleSelectVisibleGlossaryRows(masterCheckbox) {
    getVisibleGlossaryRows().forEach(function(row) {
        var checkbox = row.querySelector('.glossary-row-select');
        if (checkbox) checkbox.checked = masterCheckbox.checked;
    });
    updateGlossaryBulkDeleteState();
}

function setGlossaryBulkDeleteMode(enabled) {
    if (!canManageGlossary()) return;
    glossaryBulkDeleteMode = !!enabled;
    var table = document.getElementById('mainGlossaryTable');
    var modeButton = document.getElementById('btnBulkDeleteModeGlossary');
    var deleteButton = document.getElementById('btnBulkDeleteGlossary');
    if (!table) return;

    table.querySelectorAll('.glossary-bulk-select-cell, .glossary-bulk-select-header, .glossary-bulk-select-filter').forEach(function(cell) {
        cell.classList.toggle('is-hidden', !glossaryBulkDeleteMode);
    });

    if (!glossaryBulkDeleteMode) {
        table.querySelectorAll('.glossary-row-select').forEach(function(checkbox) {
            checkbox.checked = false;
        });
        var master = document.getElementById('glossarySelectAllVisible');
        if (master) {
            master.checked = false;
            master.indeterminate = false;
        }
    }

    if (modeButton) {
        modeButton.innerHTML = glossaryBulkDeleteMode
            ? getGlossaryXWikiIcon('cross') + ' Annuler la suppression multiple'
            : getGlossaryXWikiIcon('check') + ' Suppression multiple';
    }

    if (deleteButton) {
        deleteButton.classList.toggle('is-hidden', !glossaryBulkDeleteMode);
    }

    updateGlossaryBulkDeleteState();
}

function toggleGlossaryBulkDeleteMode() {
    setGlossaryBulkDeleteMode(!glossaryBulkDeleteMode);
}

function removeGlossaryPopupRowByReference(fullRef) {
    document.querySelectorAll('#popupCheckTable tbody .term-row').forEach(function(row) {
        if (row.getAttribute('data-full-ref') === fullRef) row.remove();
    });
}

async function executeBulkGlossaryDelete() {
    if (!canManageGlossary()) return;
    var selectedRows = getSelectedGlossaryRows();
    if (!selectedRows.length) return;

    var acronyms = selectedRows.map(function(row) {
        var cell = row.querySelector('.main-acronym .view-mode');
        return cell ? cell.textContent.trim() : '';
    }).filter(Boolean);

    var preview = acronyms.slice(0, 8).join(', ');
    if (acronyms.length > 8) preview += ', etc.';

    var message = 'Supprimer définitivement ' + selectedRows.length + ' ligne(s) sélectionnée(s) ainsi que leurs pages XWiki ?';
    if (preview) message += '\n\n' + preview;
    if (!window.confirm(message)) return;

    var table = document.getElementById('mainGlossaryTable');
    var csrfToken = table.getAttribute('data-csrf');
    var button = document.getElementById('btnBulkDeleteGlossary');
    var deletedCount = 0;
    var failed = [];

    if (button) {
        button.disabled = true;
        button.innerHTML = getGlossaryXWikiIcon('refresh') + ' Suppression...';
    }

    for (var i = 0; i < selectedRows.length; i++) {
        var row = selectedRows[i];
        var fullRef = row.getAttribute('data-full-ref');
        var acronymCell = row.querySelector('.main-acronym .view-mode');
        var acronym = acronymCell ? acronymCell.textContent.trim() : fullRef;

        var donnees = new FormData();
        donnees.append('action', 'delete');
        donnees.append('targetRef', fullRef);
        donnees.append('form_token', csrfToken);

        try {
            var response = await fetch(getGlossaryDataUrl(), {
                method: 'POST',
                body: donnees,
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            var result = await response.text();

            if (response.ok && getGlossaryResultLine(result, 'GLOSSAIRE_OK') === 'GLOSSAIRE_OK') {
                removeGlossaryPopupRowByReference(fullRef);
                row.remove();
                deletedCount++;
            } else {
                failed.push(acronym);
            }
        } catch (error) {
            console.error(error);
            failed.push(acronym);
        }
    }

    if (typeof applyCurrentSort === 'function') applyCurrentSort();
    if (typeof sortPopupTableAlphabetically === 'function') sortPopupTableAlphabetically();
    if (typeof applyPagination === 'function') applyPagination();

    if (!failed.length) setGlossaryBulkDeleteMode(false);
    else updateGlossaryBulkDeleteState();

    var resultMessage = deletedCount + ' ligne(s) supprimée(s).';
    if (failed.length) {
        resultMessage += '\n' + failed.length + ' suppression(s) ont échoué : ' + failed.join(', ');
    }
    showGlossaryToast(resultMessage, failed.length > 0);
}

function setupGlossaryBulkDeleteUi() {
    if (!canManageGlossary()) return;
    var table = document.getElementById('mainGlossaryTable');
    if (!table || document.getElementById('btnBulkDeleteModeGlossary')) return;

    var headerRows = table.querySelectorAll('thead tr');
    if (headerRows.length > 0) {
        var selectHeader = document.createElement('th');
        selectHeader.className = 'glossary-bulk-select-header is-hidden';
        selectHeader.title = 'Sélectionner les lignes visibles';
        selectHeader.innerHTML = '<input type="checkbox" id="glossarySelectAllVisible" aria-label="Sélectionner les lignes visibles">';
        headerRows[0].insertBefore(selectHeader, headerRows[0].firstChild);
        document.getElementById('glossarySelectAllVisible').addEventListener('change', function() {
            toggleSelectVisibleGlossaryRows(this);
        });
    }

    if (headerRows.length > 1) {
        var emptyFilterHeader = document.createElement('th');
        emptyFilterHeader.className = 'glossary-bulk-select-filter is-hidden';
        headerRows[1].insertBefore(emptyFilterHeader, headerRows[1].firstChild);
    }

    table.querySelectorAll('tbody .main-term-row').forEach(ensureGlossaryBulkSelectCell);

    var toolbarLeft = document.getElementById('glossaryToolbarLeft');
    if (toolbarLeft) {
        var modeButton = document.createElement('button');
        modeButton.type = 'button';
        modeButton.id = 'btnBulkDeleteModeGlossary';
        modeButton.className = 'btn btn-default glossary-toolbar-button';
        modeButton.innerHTML = getGlossaryXWikiIcon('check') + ' Suppression multiple';
        modeButton.addEventListener('click', toggleGlossaryBulkDeleteMode);
        toolbarLeft.appendChild(modeButton);

        var bulkButton = document.createElement('button');
        bulkButton.type = 'button';
        bulkButton.id = 'btnBulkDeleteGlossary';
        bulkButton.className = 'btn btn-danger glossary-toolbar-button is-hidden';
        bulkButton.disabled = true;
        bulkButton.innerHTML = getGlossaryXWikiIcon('trash') + ' Supprimer la sélection (0)';
        bulkButton.addEventListener('click', executeBulkGlossaryDelete);
        toolbarLeft.appendChild(bulkButton);
    }

    var tbody = table.querySelector('tbody');
    if (tbody && window.MutationObserver) {
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                Array.from(mutation.addedNodes || []).forEach(function(node) {
                    if (node.nodeType === 1 && node.classList.contains('main-term-row')) {
                        ensureGlossaryBulkSelectCell(node);
                    }
                });
            });
            updateGlossaryBulkDeleteState();
        });
        observer.observe(tbody, { childList: true });
    }

    if (!window.glossaryBulkPaginationWrapped && typeof window.applyPagination === 'function') {
        var originalApplyPagination = window.applyPagination;
        window.applyPagination = function() {
            var result = originalApplyPagination.apply(this, arguments);
            updateGlossaryBulkDeleteState();
            return result;
        };
        window.glossaryBulkPaginationWrapped = true;
    }

    updateGlossaryBulkDeleteState();
}

function bindGlossaryPageEvents() {
    var table = document.getElementById('mainGlossaryTable');
    if (!table) return;

    ['actionFeedbackModal', 'deleteConfirmModal', 'glossaryModal'].forEach(function(modalId) {
        var modal = document.getElementById(modalId);
        if (modal && modal.parentNode !== document.body) {
            document.body.appendChild(modal);
        }
    });

    window.urlGlossaireData = table.getAttribute('data-endpoint-url') || '';

    table.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;

        if (button.classList.contains('sort-column-btn')) {
            toggleColumnSort(button.getAttribute('data-column'), button);
            return;
        }
        if (!canManageGlossary()) return;

        if (button.classList.contains('js-edit-row')) {
            toggleEditMode(button, true);
        } else if (button.classList.contains('js-delete-row')) {
            openDeleteModal(button);
        } else if (button.classList.contains('js-save-row')) {
            saveRowEdition(button);
        } else if (button.classList.contains('js-cancel-row')) {
            toggleEditMode(button, false);
        }
    });

    var filterAcronym = document.getElementById('filterAcronym');
    var filterLabel = document.getElementById('filterLabel');
    var filterDefinition = document.getElementById('filterDefinition');
    [filterAcronym, filterLabel, filterDefinition].forEach(function(input) {
        if (input) input.addEventListener('input', filterMainTableColumns);
    });

    var pageSize = document.getElementById('pageSizeSelect');
    if (pageSize) pageSize.addEventListener('change', changePageSize);

    var prev = document.getElementById('btnPrevPage');
    var next = document.getElementById('btnNextPage');
    if (prev) prev.addEventListener('click', function() { navigatePage(-1); });
    if (next) next.addEventListener('click', function() { navigatePage(1); });

    var acronymInput = document.getElementById('acronymeInputField');
    var labelInput = document.getElementById('libelleInputField');
    if (acronymInput) acronymInput.addEventListener('input', triggerGlobalFilter);
    if (labelInput) labelInput.addEventListener('input', triggerGlobalFilter);

    var deleteConfirm = document.getElementById('btnConfirmDelete');
    if (deleteConfirm) deleteConfirm.addEventListener('click', executeRowDelete);
}

// Remplacements des fonctions de l'extension historique par les versions corrigées.
window.ensureSheetJSLoaded = fixedEnsureSheetJSLoaded;
window.detectExcelHeader = fixedDetectExcelHeader;
window.analyzeExcelRows = fixedAnalyzeExcelRows;
window.renderExcelImportPreview = fixedRenderExcelImportPreview;
window.readGlossaryExcelFile = fixedReadGlossaryExcelFile;
window.editExcelImportRow = fixedEditExcelImportRow;
window.deleteExcelImportRow = fixedDeleteExcelImportRow;
window.createExcelImportUi = createExcelImportUi;
window.appendImportedGlossaryRow = appendImportedGlossaryRow;
window.updateSortButtons = updateGlossarySortButtons;

// Création, propositions d'acronymes et décisions des validateurs.
// Les droits sont vérifiés à nouveau par l'endpoint XWiki à chaque requête.

function decodeGlossaryWorkflowValue(value) {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
}

async function requestGlossaryWorkflow(action, values) {
    var metadata = getGlossaryMetadata();
    if (!metadata || !metadata.getAttribute('data-endpoint-url')) {
        throw new Error('Le service des propositions est indisponible. Rechargez la page.');
    }

    var endpoint = getGlossaryDataUrl();
    var data = new FormData();
    data.append('action', action);
    data.append('form_token', metadata.getAttribute('data-csrf') || '');
    Object.keys(values).forEach(function(key) {
        data.append(key, values[key]);
    });

    var response = await fetch(endpoint, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    var result = await response.text();
    var error = getGlossaryResultLine(result, 'GLOSSAIRE_ERROR');
    if (error) {
        throw new Error(decodeGlossaryWorkflowValue(error.split('|')[1]) || 'La demande a échoué.');
    }
    var expectedCode = {
        create: 'GLOSSAIRE_OK',
        propose: 'GLOSSAIRE_PROPOSED',
        approve: 'GLOSSAIRE_APPROVED',
        restore: 'GLOSSAIRE_APPROVED',
        reject: 'GLOSSAIRE_REJECTED',
        trash: 'GLOSSAIRE_TRASHED',
        settings: 'GLOSSAIRE_SETTINGS_SAVED',
        purge: 'GLOSSAIRE_PURGED',
        migrate: 'GLOSSAIRE_MIGRATED'
    }[action];
    var success = expectedCode && getGlossaryResultLine(result, expectedCode);
    if (!response.ok || !success) {
        throw new Error('La demande n\'a pas abouti. Rechargez la page et réessayez.');
    }
    var parts = success.split('|');
    if ((action === 'create' && (parts.length !== 3 || !parts[1] || !parts[2])) ||
        (action === 'propose' && (parts.length !== 2 || !parts[1])) ||
        ((action === 'approve' || action === 'restore') && (parts.length !== 6 || !parts[1] || !parts[2] || !parts[3] || !parts[4])) ||
        ((action === 'reject' || action === 'trash') && (parts.length !== 4 || !parts[1] || !parts[2] || !/^\d+$/.test(decodeGlossaryWorkflowValue(parts[3])))) ||
        (action === 'settings' && parts.length !== 1) ||
        (action === 'purge' && (parts.length !== 2 || !/^\d+$/.test(parts[1]))) ||
        (action === 'migrate' && (parts.length !== 3 || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])))) {
        throw new Error('Réponse du service incomplète. Rechargez la page.');
    }
    return parts.slice(1).map(decodeGlossaryWorkflowValue);
}

function setGlossaryWorkflowBusy(form, busy) {
    form.dataset.workflowBusy = busy ? 'true' : 'false';
    if (busy) {
        form.querySelectorAll('input, textarea, select, button').forEach(function(control) {
            control.dataset.workflowWasDisabled = control.disabled ? 'true' : 'false';
            control.disabled = true;
        });
    } else {
        form.querySelectorAll('[data-workflow-was-disabled]').forEach(function(control) {
            control.disabled = control.dataset.workflowWasDisabled === 'true';
            delete control.dataset.workflowWasDisabled;
        });
    }
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function showGlossaryWorkflowError(element, message) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-hidden', !message);
}

function appendOwnGlossaryProposal(values, reference, state) {
    var list = document.getElementById('glossaryOwnProposals');
    if (!list) return;
    var alreadyDisplayed = Array.from(list.querySelectorAll('.glossary-proposal-status-card')).some(function(card) {
        return card.getAttribute('data-proposal-ref') === reference;
    });
    if (alreadyDisplayed) return;
    state = state || {};
    var proposalStatus = state.status || 'pending';
    var card = document.createElement('article');
    card.className = 'glossary-proposal-status-card';
    card.setAttribute('data-proposal-ref', reference);
    card.setAttribute('data-proposal-status', proposalStatus);
    card.setAttribute('data-proposal-acronym', values.acronym);
    card.setAttribute('data-proposal-label', values.label);
    if (state.expiresAt) card.setAttribute('data-expires-at', String(state.expiresAt));
    var title = document.createElement('h3');
    title.textContent = values.acronym + ' — ' + values.label;
    var date = document.createElement('p');
    date.className = 'glossary-proposal-meta text-muted';
    date.textContent = values.submittedAt ? 'Envoyée le ' + values.submittedAt : 'Proposition envoyée à l’instant';
    var status = document.createElement('p');
    var label = document.createElement('strong');
    label.textContent = proposalStatus === 'rejected' ? 'Refusée — dans la corbeille' :
        (proposalStatus === 'trashed' ? 'Retirée — dans la corbeille' : 'En attente de validation');
    status.appendChild(label);
    card.appendChild(title);
    card.appendChild(date);
    card.appendChild(status);
    if (state.comment) {
        var comment = document.createElement('p');
        comment.className = 'glossary-proposal-comment';
        comment.textContent = state.comment;
        card.appendChild(comment);
    }
    list.insertBefore(card, list.firstChild);
    updateOwnGlossaryProposalsEmpty();
}

function updateOwnGlossaryProposalsEmpty() {
    var list = document.getElementById('glossaryOwnProposals');
    var empty = document.getElementById('glossaryOwnProposalsEmpty');
    if (list && empty) empty.classList.toggle('is-hidden', !!list.querySelector('.glossary-proposal-status-card'));
}

function removeOwnGlossaryProposal(reference) {
    document.querySelectorAll('#glossaryOwnProposals .glossary-proposal-status-card').forEach(function(card) {
        if (card.getAttribute('data-proposal-ref') === reference) card.remove();
    });
    updateOwnGlossaryProposalsEmpty();
}

async function submitGlossaryProposal(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var table = document.getElementById('mainGlossaryTable');
    if (!table || (!canProposeGlossary() && !canAddGlossary()) ||
        form.dataset.workflowBusy === 'true') return;
    var feedback = form.querySelector('.glossary-proposal-feedback');
    var values = {
        acronym: form.querySelector('[name="acronyme"]').value.trim(),
        label: form.querySelector('[name="libelle"]').value.trim(),
        definition: form.querySelector('[name="definition"]').value.trim()
    };
    if (!values.acronym || !values.label) {
        showGlossaryWorkflowError(feedback, 'L’acronyme et le libellé sont obligatoires.');
        return;
    }
    if (!form.reportValidity()) return;
    showGlossaryWorkflowError(feedback, '');
    setGlossaryWorkflowBusy(form, true);
    try {
        var managing = canAddGlossary();
        var result = await requestGlossaryWorkflow(managing ? 'create' : 'propose', values);
        if (managing) {
            appendImportedGlossaryRow(values, result[0], result[1]);
            applyCurrentSort();
            filterMainTableColumns(false);
            sortPopupTableAlphabetically();
        } else {
            appendOwnGlossaryProposal(values, result[0]);
        }
        form.reset();
        if (typeof triggerGlobalFilter === 'function') triggerGlobalFilter();
        jQuery('#glossaryModal').modal('hide');
        showGlossaryToast(managing ? 'L’acronyme a été ajouté au glossaire.' : 'Votre proposition a été envoyée aux validateurs.');
    } catch (error) {
        showGlossaryWorkflowError(feedback, error.message || 'Impossible d’enregistrer le terme.');
    } finally {
        setGlossaryWorkflowBusy(form, false);
    }
}

function updateGlossaryProposalCount() {
    var list = document.getElementById('glossaryPendingProposals');
    if (!list) return;
    var count = list.querySelectorAll('.glossary-proposal-card').length;
    var badge = document.getElementById('glossaryProposalCount');
    var label = document.getElementById('glossaryProposalCountLabel');
    var empty = document.getElementById('glossaryProposalsEmpty');
    if (badge) badge.textContent = String(count);
    if (label) label.textContent = count + ' proposition(s) en attente';
    if (empty) empty.classList.toggle('is-hidden', count !== 0);
}

var glossaryTrashDynamicIndex = 0;

function appendGlossaryTrashProposal(values, reference, version, deletedMillis, status, comment) {
    var list = document.getElementById('glossaryTrashProposals');
    if (!list) return;
    var alreadyDisplayed = Array.from(list.querySelectorAll('.glossary-trash-card')).some(function(card) {
        return card.getAttribute('data-proposal-ref') === reference;
    });
    if (alreadyDisplayed) return;
    var card = document.createElement('form');
    var expiresAt = Number(deletedMillis) + 604800000;
    card.className = 'glossary-trash-card';
    card.setAttribute('data-proposal-ref', reference);
    card.setAttribute('data-expected-version', version);
    card.setAttribute('data-deleted-at', String(deletedMillis));
    card.setAttribute('data-expires-at', String(expiresAt));
    card.setAttribute('data-proposal-author', values.author || '');
    card.innerHTML =
        '<h5></h5><p><strong class="glossary-trash-status"></strong></p>' +
        '<p class="text-muted glossary-proposal-meta glossary-trash-author"></p>' +
        '<p class="text-muted glossary-proposal-meta glossary-trash-date"></p>' +
        '<p class="glossary-proposal-comment"></p>' +
        '<div class="form-group"><label data-field-label="acronym">Acronyme ou sigle</label>' +
          '<input name="acronym" class="form-control" maxlength="255" required></div>' +
        '<div class="form-group"><label data-field-label="label">Libellé complet</label>' +
          '<input name="label" class="form-control" maxlength="255" required></div>' +
        '<div class="form-group"><label data-field-label="definition">Définition (facultatif)</label>' +
          '<textarea name="definition" class="form-control" rows="3"></textarea></div>' +
        '<div class="form-group"><label data-field-label="comment">Commentaire de revalidation (facultatif)</label>' +
          '<textarea name="comment" class="form-control" rows="2"></textarea></div>' +
        '<p class="glossary-proposal-feedback text-danger is-hidden" role="alert"></p>' +
        '<button type="button" class="btn btn-success" data-review-action="restore">Revalider et publier</button>';
    card.querySelector('h5').textContent = values.acronym + ' — ' + values.label;
    card.querySelector('.glossary-trash-status').textContent = status === 'rejected' ? 'Proposition refusée' : 'Proposition retirée';
    card.querySelector('.glossary-trash-author').textContent = 'Proposé par ' + (values.author || '') +
        (values.submittedAt ? ' le ' + values.submittedAt : '');
    card.querySelector('.glossary-trash-date').textContent = 'Mise à la corbeille le ' + new Date(Number(deletedMillis)).toLocaleString('fr-FR') +
        '. Suppression après le ' + new Date(expiresAt).toLocaleString('fr-FR') + '.';
    card.querySelector('.glossary-proposal-comment').textContent = comment || '';
    var prefix = 'glossaryTrashDynamic' + (++glossaryTrashDynamicIndex);
    ['acronym', 'label', 'definition', 'comment'].forEach(function(field) {
        var control = card.querySelector('[name="' + field + '"]');
        control.id = prefix + field;
        control.value = field === 'comment' ? '' : values[field];
        control.defaultValue = control.value;
        card.querySelector('[data-field-label="' + field + '"]').htmlFor = control.id;
    });
    list.insertBefore(card, list.firstChild);
}

function updateGlossaryTrashCount() {
    var list = document.getElementById('glossaryTrashProposals');
    if (!list) return;
    var count = list.querySelectorAll('.glossary-trash-card').length;
    var badge = document.getElementById('glossaryTrashCount');
    var label = document.getElementById('glossaryTrashCountLabel');
    var empty = document.getElementById('glossaryTrashEmpty');
    if (badge) badge.textContent = String(count);
    if (label) label.textContent = count + ' proposition(s) dans la corbeille';
    if (empty) empty.classList.toggle('is-hidden', count !== 0);
}

async function reviewGlossaryProposal(card, action) {
    if (!canReviewGlossary() || !card || card.dataset.workflowBusy === 'true' ||
        ['approve', 'reject', 'trash', 'restore'].indexOf(action) === -1) return;
    var feedback = card.querySelector('.glossary-proposal-feedback');
    var values = {
        targetRef: card.getAttribute('data-proposal-ref') || '',
        expectedVersion: card.getAttribute('data-expected-version') || '',
        acronym: card.querySelector('[name="acronym"]').value.trim(),
        label: card.querySelector('[name="label"]').value.trim(),
        definition: card.querySelector('[name="definition"]').value.trim(),
        comment: card.querySelector('[name="comment"]').value.trim()
    };
    var originalValues = {
        acronym: card.querySelector('[name="acronym"]').defaultValue,
        label: card.querySelector('[name="label"]').defaultValue,
        definition: card.querySelector('[name="definition"]').defaultValue,
        author: card.getAttribute('data-proposal-author') || '',
        submittedAt: card.getAttribute('data-proposal-submitted-at') || ''
    };
    if (action === 'reject' && !values.comment) {
        showGlossaryWorkflowError(feedback, 'Indiquez un motif pour refuser cette proposition.');
        card.querySelector('[name="comment"]').focus();
        return;
    }
    var publishes = action === 'approve' || action === 'restore';
    if (publishes && (!values.acronym || !values.label)) {
        showGlossaryWorkflowError(feedback, 'L’acronyme et le libellé sont obligatoires.');
        return;
    }
    if (publishes && !card.reportValidity()) return;
    showGlossaryWorkflowError(feedback, '');
    setGlossaryWorkflowBusy(card, true);
    try {
        var result = await requestGlossaryWorkflow(action, values);
        if (publishes) {
            appendImportedGlossaryRow({ acronym: result[2], label: result[3], definition: result[4] }, result[0], result[1]);
            applyCurrentSort();
            filterMainTableColumns(false);
            if (typeof sortPopupTableAlphabetically === 'function') sortPopupTableAlphabetically();
        } else {
            var status = action === 'reject' ? 'rejected' : 'trashed';
            appendGlossaryTrashProposal(originalValues, result[0], result[1], result[2], status, values.comment);
            var bootstrap = document.getElementById('glossaryBootstrap');
            if (bootstrap && bootstrap.getAttribute('data-current-author') === originalValues.author) {
                removeOwnGlossaryProposal(values.targetRef);
                appendOwnGlossaryProposal(originalValues, result[0], {
                    status: status, comment: values.comment, expiresAt: Number(result[2]) + 604800000
                });
            }
        }
        if (publishes) removeOwnGlossaryProposal(values.targetRef);
        card.remove();
        updateGlossaryProposalCount();
        updateGlossaryTrashCount();
        showGlossaryToast(publishes ? 'L’acronyme a été validé et ajouté au glossaire.' :
            (action === 'reject' ? 'La proposition a été refusée et mise à la corbeille pour 7 jours.' : 'La proposition a été mise à la corbeille pour 7 jours.'));
    } catch (error) {
        showGlossaryWorkflowError(feedback, error.message || 'Impossible de traiter cette proposition.');
    } finally {
        setGlossaryWorkflowBusy(card, false);
    }
}

function reloadGlossaryAfterSettings() {
    window.location.reload();
}

async function saveGlossarySettings(event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (!canConfigureGlossary() || form.dataset.workflowBusy === 'true') return;
    var feedback = form.querySelector('.glossary-settings-feedback');
    var rows = Array.from(form.querySelectorAll('.glossary-permission-row'));
    var values = { expectedVersion: form.getAttribute('data-expected-version') || '', groupCount: String(rows.length) };
    rows.forEach(function(row, index) {
        values['group_' + index] = row.getAttribute('data-group-ref');
        values['level_' + index] = row.querySelector('.glossary-role-select').value;
    });
    showGlossaryWorkflowError(feedback, '');
    setGlossaryWorkflowBusy(form, true);
    try {
        await requestGlossaryWorkflow('settings', values);
        reloadGlossaryAfterSettings();
    } catch (error) {
        showGlossaryWorkflowError(feedback, error.message || 'Impossible d’enregistrer les autorisations.');
    } finally {
        setGlossaryWorkflowBusy(form, false);
    }
}

async function migrateGlossaryReferences() {
    var form = document.getElementById('glossarySettingsForm');
    var countElement = document.getElementById('glossaryLegacyCount');
    if (!canConfigureGlossary() || !form || form.dataset.workflowBusy === 'true') return;
    var count = countElement ? Number(countElement.textContent) : 0;
    if (!Number.isInteger(count) || count < 1) return;
    if (!window.confirm('Convertir les adresses des ' + count + ' fiches existantes ? Les liens internes seront mis à jour.')) return;
    var feedback = form.querySelector('.glossary-settings-feedback');
    showGlossaryWorkflowError(feedback, '');
    setGlossaryWorkflowBusy(form, true);
    try {
        var result = await requestGlossaryWorkflow('migrate', {});
        window.alert(result[0] + ' fiche(s) convertie(s), ' + result[1] + ' échec(s).');
        reloadGlossaryAfterSettings();
    } catch (error) {
        showGlossaryWorkflowError(feedback, error.message || 'Impossible de convertir les adresses.');
    } finally {
        setGlossaryWorkflowBusy(form, false);
    }
}

async function purgeGlossaryTrashOnVisit() {
    var metadata = getGlossaryMetadata();
    if (!metadata || (!canViewGlossary() && !canConfigureGlossary()) || metadata.dataset.purgeStarted === 'true') return;
    metadata.dataset.purgeStarted = 'true';
    try {
        await requestGlossaryWorkflow('purge', {});
    } catch (error) {
        // La purge sera retentée lors de la prochaine visite ; les opérations serveur
        // vérifient toujours elles-mêmes l'échéance de chaque proposition.
        metadata.dataset.purgeStarted = 'false';
    }
}

function initGlossaryWorkflow() {
    if (!getGlossaryMetadata()) return;
    ['glossaryProposalsModal', 'glossaryTrashModal', 'glossarySettingsModal'].forEach(function(id) {
        var modal = document.getElementById(id);
        if (modal && modal.parentNode !== document.body) document.body.appendChild(modal);
    });
    document.querySelectorAll('.glossary-trash-expiration[data-expires-at]').forEach(function(element) {
        element.textContent = 'Suppression après le ' + new Date(Number(element.getAttribute('data-expires-at'))).toLocaleString('fr-FR') + '.';
    });

    var createForm = document.getElementById('glossaryCreateForm');
    if (createForm && createForm.dataset.workflowBound !== 'true') {
        createForm.dataset.workflowBound = 'true';
        var feedback = document.createElement('p');
        feedback.className = 'glossary-proposal-feedback text-danger is-hidden';
        feedback.setAttribute('role', 'alert');
        var body = createForm.querySelector('.modal-body');
        if (body) body.insertBefore(feedback, body.firstChild);
        createForm.addEventListener('submit', submitGlossaryProposal);
    }
    ['glossaryPendingProposals', 'glossaryTrashProposals'].forEach(function(id) {
        var list = document.getElementById(id);
        if (!canReviewGlossary() || !list || list.dataset.workflowBound === 'true') return;
        list.dataset.workflowBound = 'true';
        list.addEventListener('submit', function(event) { event.preventDefault(); });
        list.addEventListener('click', function(event) {
            var button = event.target.closest('[data-review-action]');
            if (!button || !list.contains(button)) return;
            reviewGlossaryProposal(button.closest('.glossary-proposal-card, .glossary-trash-card'), button.getAttribute('data-review-action'));
        });
    });
    var settings = document.getElementById('glossarySettingsForm');
    if (settings && canConfigureGlossary() && settings.dataset.workflowBound !== 'true') {
        settings.dataset.workflowBound = 'true';
        settings.addEventListener('submit', saveGlossarySettings);
        var migrate = document.getElementById('btnMigrateGlossary');
        if (migrate) migrate.addEventListener('click', migrateGlossaryReferences);
    }
    updateGlossaryProposalCount();
    updateGlossaryTrashCount();
    purgeGlossaryTrashOnVisit();
}


document.addEventListener('DOMContentLoaded', function() {
    bindGlossaryPageEvents();
    createExcelImportUi();
    setupGlossaryBulkDeleteUi();
    initGlossaryWorkflow();
    updateGlossarySortButtons();
});
