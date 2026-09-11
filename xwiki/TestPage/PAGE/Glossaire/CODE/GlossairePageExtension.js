// Extension JavaScript de page pour le glossaire.
// Tout le comportement ajouté au WebHome est centralisé ici.

var glossarySheetJSLibrary = null;
var excelImportFileName = '';
var excelImportHeaderInfo = null;
var glossaryBulkDeleteMode = false;

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
    var seenAcronyms = {};
    var seenLabels = {};

    rows.forEach(function(row) {
        var acronymKey = normalizeDuplicateKey(row.acronym);
        var labelKey = normalizeDuplicateKey(row.label);

        row.invalid = !row.acronym || !row.label || !row.definition;
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
    if (!excelImportRows[rowIndex]) return;
    excelImportRows[rowIndex][field] = String(value == null ? '' : value).trim();
    fixedRecomputeExcelDuplicateFlags(excelImportRows);
    fixedRenderExcelImportPreview(excelImportFileName);
}

function fixedDeleteExcelImportRow(rowIndex) {
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

    info.textContent = excelImportFileName + ' — feuille « ' + excelImportSheetName + ' » — ' + columnDescription;

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
        addEditableCell('definition', row.definition, !row.definition, true);

        var actionCell = document.createElement('td');
        actionCell.className = 'excel-import-action-cell';
        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-xs btn-danger';
        deleteButton.title = 'Supprimer cette ligne de l’import';
        deleteButton.innerHTML = '<span class="glyphicon glyphicon-trash"></span>';
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

            if (row.duplicateAcronymGlossary) reasons.push('Acronyme : glossaire');
            if (row.duplicateAcronymFile) reasons.push('Acronyme : fichier Excel');
            if (row.duplicateLabelGlossary) reasons.push('Libellé : glossaire');
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
    var xlsxLibrary;

    try {
        xlsxLibrary = await fixedEnsureSheetJSLoaded();
    } catch (error) {
        console.error(error);
        alert('La bibliothèque Excel n\'a pas pu être chargée correctement : ' + error.message);
        return;
    }

    try {
        var buffer = await file.arrayBuffer();
        if (!isGlossarySheetJSLibrary(xlsxLibrary)) {
            throw new Error('La bibliothèque SheetJS chargée ne possède pas read()');
        }

        var workbook = xlsxLibrary.read(buffer, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            alert('Le fichier Excel ne contient aucune feuille lisible.');
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
            alert('La première feuille du fichier est vide.');
            return;
        }

        var headerInfo = fixedDetectExcelHeader(rawRows[0] || []);
        excelImportHeaderInfo = headerInfo;
        excelImportHeaderDetected = headerInfo.detected;
        excelImportColumnMap = headerInfo.map;
        excelImportRows = fixedAnalyzeExcelRows(rawRows, headerInfo);

        if (!excelImportRows.length) {
            alert('Aucune ligne de données n\'a été trouvée dans les trois colonnes attendues.');
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
        alert('Impossible de lire ce fichier Excel : ' + error.message);
    }
}

function createExcelImportUi() {
    if (document.getElementById('excelGlossaryModal')) return;

    var toolbarRight = document.getElementById('glossaryToolbarRight');
    if (toolbarRight) {
        toolbarRight.innerHTML =
            '<input type="file" id="excelGlossaryFileInput" accept=".xlsx,.xls,.xlsm,.xlsb" class="glossary-hidden-file-input">' +
            '<button type="button" id="btnImportExcelGlossary" class="btn btn-default">' +
                '<span class="glyphicon glyphicon-import"></span> Importer un Excel' +
            '</button>';
    }

    var modal = document.createElement('div');
    modal.innerHTML =
        '<div class="modal fade" id="excelGlossaryModal" tabindex="-1" role="dialog" aria-hidden="true">' +
          '<div class="modal-dialog modal-lg excel-import-dialog" role="document">' +
            '<div class="modal-content">' +
              '<div class="modal-header">' +
                '<button type="button" class="close" data-dismiss="modal" aria-label="Fermer"><span aria-hidden="true">&times;</span></button>' +
                '<h4 class="modal-title">Import Excel du glossaire</h4>' +
              '</div>' +
              '<div class="modal-body">' +
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
                    '<p class="text-muted">Rouge = champ en doublon. Le motif précise s’il existe déjà dans le glossaire ou dans le fichier Excel.</p>' +
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
            '<button type="button" class="btn btn-xs btn-primary custom-action-btn js-edit-row"><span class="glyphicon glyphicon-pencil"></span></button> ' +
            '<button type="button" class="btn btn-xs btn-danger custom-action-btn js-delete-row"><span class="glyphicon glyphicon-trash"></span></button>' +
          '</div>' +
          '<div class="edit-buttons glossary-edit-buttons">' +
            '<button type="button" class="btn btn-xs btn-success js-save-row"><span class="glyphicon glyphicon-ok"></span> Sauver</button> ' +
            '<button type="button" class="btn btn-xs btn-default js-cancel-row"><span class="glyphicon glyphicon-remove"></span></button>' +
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
        button.innerHTML = '<span class="glyphicon glyphicon-trash"></span> Supprimer la sélection (' + selectedRows.length + ')';
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
            ? '<span class="glyphicon glyphicon-remove"></span> Annuler la suppression multiple'
            : '<span class="glyphicon glyphicon-check"></span> Suppression multiple';
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
    var selectedRows = getSelectedGlossaryRows();
    if (!selectedRows.length) return;

    var acronyms = selectedRows.map(function(row) {
        var cell = row.querySelector('.main-acronym .view-mode');
        return cell ? cell.textContent.trim() : '';
    }).filter(Boolean);

    var preview = acronyms.slice(0, 8).join(', ');
    if (acronyms.length > 8) preview += ', …';

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
        button.innerHTML = '<span class="glyphicon glyphicon-refresh"></span> Suppression...';
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
            var response = await fetch(urlGlossaireData + '?xpage=plain', {
                method: 'POST',
                body: donnees,
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            var result = await response.text();

            if (result.indexOf('GLOSSAIRE_OK') !== -1) {
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
    alert(resultMessage);
}

function setupGlossaryBulkDeleteUi() {
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
        modeButton.innerHTML = '<span class="glyphicon glyphicon-check"></span> Suppression multiple';
        modeButton.addEventListener('click', toggleGlossaryBulkDeleteMode);
        toolbarLeft.appendChild(modeButton);

        var bulkButton = document.createElement('button');
        bulkButton.type = 'button';
        bulkButton.id = 'btnBulkDeleteGlossary';
        bulkButton.className = 'btn btn-danger glossary-toolbar-button is-hidden';
        bulkButton.disabled = true;
        bulkButton.innerHTML = '<span class="glyphicon glyphicon-trash"></span> Supprimer la sélection (0)';
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

    window.urlGlossaireData = table.getAttribute('data-endpoint-url') || '';

    document.querySelectorAll('.glossary-status-alert').forEach(function(alertElement) {
        setTimeout(function() {
            alertElement.classList.add('hidden');
        }, 7000);
    });

    table.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;

        if (button.classList.contains('js-edit-row')) {
            toggleEditMode(button, true);
        } else if (button.classList.contains('js-delete-row')) {
            openDeleteModal(button);
        } else if (button.classList.contains('js-save-row')) {
            saveRowEdition(button);
        } else if (button.classList.contains('js-cancel-row')) {
            toggleEditMode(button, false);
        } else if (button.classList.contains('sort-column-btn')) {
            toggleColumnSort(button.getAttribute('data-column'), button);
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

document.addEventListener('DOMContentLoaded', function() {
    bindGlossaryPageEvents();
    createExcelImportUi();
    setupGlossaryBulkDeleteUi();
});
