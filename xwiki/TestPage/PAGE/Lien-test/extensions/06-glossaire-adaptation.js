// Adaptation ciblée des fonctions du Glossaire à la page Liens existante.
// Conserve l'architecture Mes Liens / Liens Communs.
(function () {
  'use strict';

  var liensState = { userId: '', isManager: false };
  var visibleLinksCache = [];
  var bulkDeleteMode = false;
  var bulkDeleteTableKind = 'personal';
  var liensSheetJSLibrary = null;
  var excelRows = [];
  var excelHeaderInfo = null;
  var excelFileName = '';
  var excelSheetName = '';
  var liensSortState = {
    personal: { column: 'acronym', direction: 'asc' },
    common: { column: 'acronym', direction: 'asc' }
  };

  function getLiensXWikiIcon(name) {
    var table = document.getElementById('mainGlossaryTable') || document.getElementById('secondaryGlossaryTable');
    if (!table) return '';
    return table.getAttribute('data-icon-' + name) || '';
  }

  function getCsrf() {
    var table = document.getElementById('mainGlossaryTable') || document.getElementById('secondaryGlossaryTable');
    return table ? table.getAttribute('data-csrf') : '';
  }

  async function postLiens(fields) {
    var data = new FormData();
    Object.keys(fields).forEach(function (key) {
      data.append(key, fields[key] == null ? '' : fields[key]);
    });
    data.append('form_token', getCsrf());
    var response = await fetch(urlLienData + '?xpage=plain', {
      method: 'POST',
      body: data,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    return response.text();
  }

  function cleanServerLine(line) {
    return String(line || '').replace(/<[^>]+>/g, '').trim();
  }

  function detectManagerFromExistingPage() {
    var commonOption = document.querySelector('#glossaryModal select[name="type"] option[value="commun"]');
    if (commonOption && !commonOption.disabled) liensState.isManager = true;
  }

  async function loadVisibleLinks() {
    detectManagerFromExistingPage();
    var text = await postLiens({ action: 'listVisible' });
    var rows = [];
    text.split(/\r?\n/).forEach(function (rawLine) {
      var line = cleanServerLine(rawLine);
      if (line.indexOf('LIEN_ROW|') !== -1) {
        line = line.substring(line.indexOf('LIEN_ROW|'));
        var p = line.split('|');
        rows.push({
          ref: p[1] || '', acronym: p[2] || '', label: p[3] || '', definition: p[4] || '',
          type: p[5] || '', owner: p[6] || ''
        });
      } else if (line.indexOf('LIEN_LIST_OK|') !== -1) {
        line = line.substring(line.indexOf('LIEN_LIST_OK|'));
        var s = line.split('|');
        liensState.userId = s[1] || liensState.userId;
        liensState.isManager = liensState.isManager || String(s[2]).toLowerCase() === 'true';
      }
    });
    visibleLinksCache = rows;
    return rows;
  }

  async function refreshExistingPopup() {
    var tbody = document.querySelector('#popupCheckTable tbody');
    if (!tbody) return;
    try {
      var rows = await loadVisibleLinks();
      tbody.innerHTML = '';
      rows.sort(function (a, b) {
        return a.acronym.localeCompare(b.acronym, 'fr', { sensitivity: 'base', numeric: true });
      });
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.className = 'term-row';
        tr.setAttribute('data-full-ref', row.ref);
        tr.innerHTML = '<td class="term-acronym"></td><td class="term-label"></td>';
        tr.querySelector('.term-acronym').textContent = row.acronym;
        tr.querySelector('.term-label').textContent = row.label;
        tbody.appendChild(tr);
      });
      if (typeof triggerGlobalFilter === 'function') triggerGlobalFilter();
      applyManagerUi();
    } catch (e) {
      console.error('Impossible de recharger les liens visibles', e);
    }
  }

  function applyManagerUi() {
    var table = document.getElementById('secondaryGlossaryTable');
    if (table) {
      Array.from(table.rows).forEach(function (row) {
        if (!row.cells.length) return;
        row.cells[row.cells.length - 1].style.display = liensState.isManager ? '' : 'none';
      });
    }

    document.querySelectorAll('#glossaryModal option[value="commun"], #secondaryGlossaryTable .edit-type-input option').forEach(function (option) {
      if (option.value === 'commun' || option.value === 'personnel') {
        option.disabled = !liensState.isManager && option.value === 'commun';
      }
    });

    updateToolbarForCurrentTab();
  }

  function textFor(row, tableKind, column) {
    var prefix = tableKind === 'personal' ? 'main-' : 'secondary-';
    if (column === 'acronym') return row.getAttribute('data-acronym') || '';
    if (column === 'label') return (row.querySelector('.' + prefix + 'label .view-mode') || {}).textContent || '';
    if (column === 'definition') return (row.querySelector('.' + prefix + 'definition .view-mode') || {}).textContent || '';
    if (column === 'author') return (row.querySelector('.secondary-proprietaire .view-mode') || {}).textContent || '';
    if (column === 'type') return (row.querySelector('.' + prefix + 'type .view-mode') || {}).textContent || '';
    return '';
  }

  function sortTable(tableId, rowClass, tableKind, column, direction) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('.' + rowClass));
    rows.sort(function (a, b) {
      return textFor(a, tableKind, column).trim().localeCompare(
        textFor(b, tableKind, column).trim(), 'fr', { sensitivity: 'base', numeric: true }
      ) * (direction === 'desc' ? -1 : 1);
    });
    rows.forEach(function (row) { tbody.appendChild(row); });
    if (tableKind === 'personal' && typeof applyPagination === 'function') applyPagination();
    if (tableKind === 'common' && typeof applyPagination2 === 'function') applyPagination2();
  }

  function updateLiensSortButtons(tableId, tableKind) {
    var table = document.getElementById(tableId);
    if (!table) return;

    var state = liensSortState[tableKind] || { column: 'acronym', direction: 'asc' };
    var arrow = getLiensXWikiIcon('right');

    table.querySelectorAll('.liens-sort-btn').forEach(function (button) {
      var column = button.getAttribute('data-column');
      var label = button.querySelector('.sort-label');
      var isActive = column === state.column;
      var direction = isActive ? state.direction : 'asc';

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

  function applyLiensSort(tableId, rowClass, tableKind) {
    var state = liensSortState[tableKind] || { column: 'acronym', direction: 'asc' };
    sortTable(tableId, rowClass, tableKind, state.column, state.direction);
    updateLiensSortButtons(tableId, tableKind);
  }

  function installSortButtons(tableId, rowClass, tableKind, columns) {
    var table = document.getElementById(tableId);
    if (!table || !table.tHead || table.tHead.rows.length < 2) return;
    var filterRow = table.tHead.rows[1];

    columns.forEach(function (column, index) {
      var cell = filterRow.cells[index];
      if (!cell || cell.querySelector('.liens-sort-btn')) return;

      var wrapper = cell.querySelector('.liens-filter-layout');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'liens-filter-layout';
        while (cell.firstChild) wrapper.appendChild(cell.firstChild);
        cell.appendChild(wrapper);
      }

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-default btn-xs liens-sort-btn';
      button.setAttribute('data-column', column);
      button.setAttribute('data-sort-active', 'false');
      button.setAttribute('data-sort-direction', 'asc');
      button.title = 'Trier cette colonne';

      var label = document.createElement('span');
      label.className = 'sort-label';
      button.appendChild(label);

      button.addEventListener('click', function () {
        var state = liensSortState[tableKind];

        // Même logique que le Glossaire :
        // - clic sur la colonne déjà active => inverse A-Z / Z-A ;
        // - clic sur une autre colonne => elle devient active en A-Z.
        if (state.column === column) {
          state.direction = state.direction === 'asc' ? 'desc' : 'asc';
        } else {
          state.column = column;
          state.direction = 'asc';
        }

        applyLiensSort(tableId, rowClass, tableKind);
      });

      wrapper.appendChild(button);
    });

    // Comme dans le Glossaire, Acronyme A-Z est sélectionné par défaut.
    applyLiensSort(tableId, rowClass, tableKind);
  }

  function currentTableKind() {
    var tab2 = document.getElementById('Tab2');
    if (tab2 && tab2.style.display !== 'none' && window.getComputedStyle(tab2).display !== 'none') return 'common';
    return 'personal';
  }

  function tableConfig(kind) {
    return kind === 'common'
      ? { id: 'secondaryGlossaryTable', rowClass: 'secondary-term-row', pagination: 'applyPagination2' }
      : { id: 'mainGlossaryTable', rowClass: 'main-term-row', pagination: 'applyPagination' };
  }

  function ensureBulkCells(kind) {
    var cfg = tableConfig(kind);
    var table = document.getElementById(cfg.id);
    if (!table || table.dataset.bulkCellsReady === 'true') return;
    table.dataset.bulkCellsReady = 'true';

    var headerRows = table.querySelectorAll('thead tr');
    if (headerRows.length > 0) {
      var selectHeader = document.createElement('th');
      selectHeader.className = 'glossary-bulk-select-header is-hidden';
      var master = document.createElement('input');
      master.type = 'checkbox';
      master.className = 'liens-select-all-visible';
      master.setAttribute('data-kind', kind);
      master.title = 'Sélectionner les lignes affichées';
      master.addEventListener('change', function () {
        table.querySelectorAll('tbody .' + cfg.rowClass).forEach(function (row) {
          if (row.style.display === 'none') return;
          var checkbox = row.querySelector('.liens-row-select');
          if (checkbox) checkbox.checked = master.checked;
        });
        updateBulkDeleteState();
      });
      selectHeader.appendChild(master);
      headerRows[0].insertBefore(selectHeader, headerRows[0].firstChild);
    }

    if (headerRows.length > 1) {
      var selectFilter = document.createElement('th');
      selectFilter.className = 'glossary-bulk-select-filter is-hidden';
      headerRows[1].insertBefore(selectFilter, headerRows[1].firstChild);
    }

    table.querySelectorAll('tbody .' + cfg.rowClass).forEach(function (row) {
      var cell = document.createElement('td');
      cell.className = 'glossary-bulk-select-cell is-hidden';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'liens-row-select';
      checkbox.setAttribute('aria-label', 'Sélectionner cette ligne');
      checkbox.addEventListener('change', updateBulkDeleteState);
      cell.appendChild(checkbox);
      row.insertBefore(cell, row.firstChild);
    });
  }

  function selectedBulkRows() {
    var cfg = tableConfig(bulkDeleteTableKind);
    var table = document.getElementById(cfg.id);
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody .' + cfg.rowClass)).filter(function (row) {
      var checkbox = row.querySelector('.liens-row-select');
      return checkbox && checkbox.checked;
    });
  }

  function updateBulkDeleteState() {
    var selected = selectedBulkRows();
    var deleteButton = document.getElementById('btnBulkDeleteLiens');
    if (deleteButton) {
      deleteButton.disabled = selected.length === 0;
      deleteButton.innerHTML = getLiensXWikiIcon('trash') + ' Supprimer la sélection (' + selected.length + ')';
    }
  }

  function setBulkDeleteMode(enabled) {
    var kind = currentTableKind();
    if (enabled && kind === 'common' && !liensState.isManager) {
      alert('La suppression multiple des liens communs est réservée aux managers.');
      return;
    }

    if (enabled) bulkDeleteTableKind = kind;
    bulkDeleteMode = !!enabled;
    ensureBulkCells('personal');
    ensureBulkCells('common');

    ['personal', 'common'].forEach(function (candidate) {
      var cfg = tableConfig(candidate);
      var table = document.getElementById(cfg.id);
      if (!table) return;
      var show = bulkDeleteMode && candidate === bulkDeleteTableKind;
      table.querySelectorAll('.glossary-bulk-select-cell, .glossary-bulk-select-header, .glossary-bulk-select-filter').forEach(function (cell) {
        cell.classList.toggle('is-hidden', !show);
      });
      if (!show) {
        table.querySelectorAll('.liens-row-select, .liens-select-all-visible').forEach(function (checkbox) {
          checkbox.checked = false;
          checkbox.indeterminate = false;
        });
      }
    });

    var modeButton = document.getElementById('btnBulkDeleteModeLiens');
    var deleteButton = document.getElementById('btnBulkDeleteLiens');
    if (modeButton) {
      modeButton.innerHTML = bulkDeleteMode
        ? getLiensXWikiIcon('cross') + ' Annuler la suppression multiple'
        : getLiensXWikiIcon('check') + ' Suppression multiple';
    }
    if (deleteButton) deleteButton.classList.toggle('is-hidden', !bulkDeleteMode);
    updateBulkDeleteState();
  }

  async function executeBulkDelete() {
    var rows = selectedBulkRows();
    if (!rows.length) return;
    var preview = rows.slice(0, 8).map(function (row) {
      return '• ' + (row.getAttribute('data-acronym') || row.getAttribute('data-doc-name') || 'Lien');
    }).join('\n');
    if (!window.confirm('Supprimer définitivement ' + rows.length + ' lien(s) ?\n\n' + preview)) return;

    var failed = [];
    for (var i = 0; i < rows.length; i++) {
      var ref = rows[i].getAttribute('data-full-ref');
      var result = await postLiens({ action: 'delete', targetRef: ref });
      if (result.indexOf('GLOSSAIRE_OK') !== -1) rows[i].remove();
      else failed.push(ref);
    }

    setBulkDeleteMode(false);
    var cfg = tableConfig(bulkDeleteTableKind);
    if (typeof window[cfg.pagination] === 'function') window[cfg.pagination]();
    await refreshExistingPopup();
    if (failed.length) alert(failed.length + ' suppression(s) ont été refusées ou ont échoué.');
  }

  function updateToolbarForCurrentTab() {
    var modeButton = document.getElementById('btnBulkDeleteModeLiens');
    if (!modeButton) return;
    var common = currentTableKind() === 'common';
    modeButton.style.display = common && !liensState.isManager ? 'none' : '';
    if (bulkDeleteMode && bulkDeleteTableKind !== currentTableKind()) setBulkDeleteMode(false);
  }

  function setupToolbar() {
    var addButton = document.querySelector('button[data-target="#glossaryModal"]');
    if (!addButton) return;
    var left = addButton.parentNode;
    var row = left.parentNode;
    if (!left.id) left.id = 'liensToolbarLeft';
    row.classList.add('glossary-toolbar');
    left.classList.add('glossary-toolbar-left');

    if (!document.getElementById('btnBulkDeleteModeLiens')) {
      var modeButton = document.createElement('button');
      modeButton.type = 'button';
      modeButton.id = 'btnBulkDeleteModeLiens';
      modeButton.className = 'btn btn-default glossary-toolbar-button';
      modeButton.innerHTML = getLiensXWikiIcon('check') + ' Suppression multiple';
      modeButton.addEventListener('click', function () { setBulkDeleteMode(!bulkDeleteMode); });
      left.appendChild(modeButton);

      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.id = 'btnBulkDeleteLiens';
      deleteButton.className = 'btn btn-danger glossary-toolbar-button is-hidden';
      deleteButton.disabled = true;
      deleteButton.innerHTML = getLiensXWikiIcon('trash') + ' Supprimer la sélection (0)';
      deleteButton.addEventListener('click', executeBulkDelete);
      left.appendChild(deleteButton);
    }

    var right = document.getElementById('liensToolbarRight');
    if (!right) {
      right = document.createElement('div');
      right.id = 'liensToolbarRight';
      right.className = 'col-md-6 glossary-toolbar-right';
      row.appendChild(right);
    }

    right.innerHTML =
      '<button type="button" id="btnExcelExampleLiens" class="btn btn-default">' +
        getLiensXWikiIcon('eye') + ' Voir un exemple Excel' +
      '</button>' +
      '<input type="file" id="excelLiensFileInput" accept=".xlsx,.xls,.xlsm,.xlsb" class="glossary-hidden-file-input">' +
      '<button type="button" id="btnImportExcelLiens" class="btn btn-default">' +
        getLiensXWikiIcon('download') + ' Importer un Excel' +
      '</button>';
  }

  function isLiensSheetJSLibrary(candidate) {
    return !!candidate && typeof candidate.read === 'function' && candidate.utils && typeof candidate.utils.sheet_to_json === 'function';
  }

  function ensureLiensSheetJSLoaded() {
    if (isLiensSheetJSLibrary(liensSheetJSLibrary)) return Promise.resolve(liensSheetJSLibrary);
    if (isLiensSheetJSLibrary(window.XLSX)) {
      liensSheetJSLibrary = window.XLSX;
      return Promise.resolve(liensSheetJSLibrary);
    }

    return new Promise(function (resolve, reject) {
      var previousXLSX = window.XLSX;
      var previousDefine = window.define;
      var previousDefineWasAMD = !!(previousDefine && previousDefine.amd);

      try {
        if (previousDefineWasAMD) window.define = undefined;
        window.XLSX = undefined;
      } catch (e) {}

      var existingScript = document.getElementById('sheetJsLiensLibrary');
      if (existingScript && existingScript.parentNode) existingScript.parentNode.removeChild(existingScript);

      var script = document.createElement('script');
      script.id = 'sheetJsLiensLibrary';
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.type = 'text/javascript';

      function restoreRequireJS() {
        if (previousDefineWasAMD) window.define = previousDefine;
      }

      script.onload = function () {
        restoreRequireJS();
        if (isLiensSheetJSLibrary(window.XLSX)) {
          liensSheetJSLibrary = window.XLSX;
          resolve(liensSheetJSLibrary);
          return;
        }
        window.XLSX = previousXLSX;
        reject(new Error('SheetJS est chargé mais read() / utils.sheet_to_json() ne sont pas disponibles.'));
      };

      script.onerror = function () {
        restoreRequireJS();
        window.XLSX = previousXLSX;
        reject(new Error('Impossible de charger SheetJS depuis cdn.sheetjs.com.'));
      };

      document.head.appendChild(script);
    });
  }

  function normalizeHeader(value) {
    return String(value == null ? '' : value).toLowerCase()
      .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/[^a-z0-9]/g, '');
  }

  function headerType(value) {
    var h = normalizeHeader(value);
    if (['acronyme', 'acronym', 'sigle', 'nom', 'nomlien'].indexOf(h) >= 0) return 'acronym';
    if (['libelle', 'label', 'lien', 'libellecomplet'].indexOf(h) >= 0) return 'label';
    if (['definition', 'def', 'description'].indexOf(h) >= 0) return 'definition';
    if (['type', 'visibilite', 'onglet'].indexOf(h) >= 0) return 'type';
    if (['auteur', 'author', 'proprietaire', 'createur'].indexOf(h) >= 0) return 'author';
    return '';
  }

  function detectColumns(firstRow) {
    var map = {};
    var used = {};
    var recognized = [];
    var canonical = ['acronym', 'label', 'definition', 'type', 'author'];

    firstRow.forEach(function (cell, index) {
      var type = headerType(cell);
      if (type && map[type] == null) {
        map[type] = index;
        used[index] = true;
        recognized.push(type);
      }
    });

    if (!recognized.length) {
      return { detected: false, map: { acronym: 0, label: 1, definition: 2, type: 3, author: 4 }, inferred: [] };
    }

    var missing = canonical.filter(function (type) { return map[type] == null; });
    var available = [];
    for (var i = 0; i < Math.max(firstRow.length, 5); i++) if (!used[i]) available.push(i);
    var next = Math.max(firstRow.length, 5);
    while (available.length < missing.length) available.push(next++);
    missing.forEach(function (type) { map[type] = available.shift(); });
    return { detected: true, map: map, inferred: missing };
  }

  function duplicateKeys() {
    var acronyms = {};
    var labels = {};
    visibleLinksCache.forEach(function (row) {
      if (row.acronym) acronyms[normalizeHeader(row.acronym)] = true;
      if (row.label) labels[normalizeHeader(row.label)] = true;
    });
    return { acronyms: acronyms, labels: labels };
  }

  function recomputeExcelFlags() {
    var existing = duplicateKeys();
    var seenAcronyms = {};
    var seenLabels = {};
    excelRows.forEach(function (row) {
      var a = normalizeHeader(row.acronym);
      var l = normalizeHeader(row.label);
      row.invalid = !row.acronym || !row.label || !row.definition;
      row.duplicateAcronymExisting = !!(a && existing.acronyms[a]);
      row.duplicateLabelExisting = !!(l && existing.labels[l]);
      row.duplicateAcronymFile = !!(a && seenAcronyms[a]);
      row.duplicateLabelFile = !!(l && seenLabels[l]);
      row.duplicateAcronym = row.duplicateAcronymExisting || row.duplicateAcronymFile;
      row.duplicateLabel = row.duplicateLabelExisting || row.duplicateLabelFile;
      if (a && !seenAcronyms[a]) seenAcronyms[a] = true;
      if (l && !seenLabels[l]) seenLabels[l] = true;
    });
  }

  function editableCell(tr, row, index, field, danger, textarea) {
    var td = document.createElement('td');
    if (danger) td.classList.add('danger');
    var input;

    if (field === 'type') {
      input = document.createElement('select');
      input.className = 'form-control input-sm excel-import-input';
      var personal = document.createElement('option'); personal.value = 'personnel'; personal.textContent = 'Personnel';
      var common = document.createElement('option'); common.value = 'commun'; common.textContent = 'Commun'; common.disabled = !liensState.isManager;
      input.appendChild(personal); input.appendChild(common);
      input.value = row.type || 'personnel';
    } else {
      input = textarea ? document.createElement('textarea') : document.createElement('input');
      if (textarea) input.rows = 2; else input.type = 'text';
      input.className = 'form-control input-sm excel-import-input';
      input.value = row[field] || '';
      if (field === 'author' && !liensState.isManager) input.disabled = true;
    }

    input.addEventListener('change', function () {
      row[field] = String(input.value || '').trim();
      if (!liensState.isManager) {
        row.type = 'personnel';
        row.author = liensState.userId;
      }
      recomputeExcelFlags();
      renderExcelPreview();
    });
    td.appendChild(input);
    tr.appendChild(td);
  }

  function renderExcelPreview() {
    recomputeExcelFlags();
    var previewBody = document.getElementById('excelLiensPreviewBody');
    var duplicatesBody = document.getElementById('excelLiensDuplicatesBody');
    var info = document.getElementById('excelLiensInfo');
    if (!previewBody || !duplicatesBody || !info) return;
    previewBody.innerHTML = '';
    duplicatesBody.innerHTML = '';

    var inferred = (excelHeaderInfo && excelHeaderInfo.inferred) || [];
    var description = excelHeaderInfo && excelHeaderInfo.detected
      ? 'Entête détectée. Les colonnes manquantes ont été déduites par élimination.'
      : 'Aucun entête reconnu : colonnes 1 à 5 utilisées dans l’ordre Acronyme, Libellé, Définition, Type, Auteur.';
    if (!inferred.length && excelHeaderInfo && excelHeaderInfo.detected) description = 'Entête détectée.';
    info.textContent = excelFileName + ' — feuille « ' + excelSheetName + ' » — ' + description;

    var duplicateCount = 0;
    var invalidCount = 0;
    excelRows.forEach(function (row, index) {
      var tr = document.createElement('tr');
      var line = document.createElement('td'); line.textContent = row.sourceLine; tr.appendChild(line);
      editableCell(tr, row, index, 'acronym', row.duplicateAcronym || !row.acronym, false);
      editableCell(tr, row, index, 'label', row.duplicateLabel || !row.label, false);
      editableCell(tr, row, index, 'definition', !row.definition, true);
      editableCell(tr, row, index, 'type', false, false);
      editableCell(tr, row, index, 'author', false, false);
      var action = document.createElement('td'); action.className = 'excel-import-action-cell';
      var del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-xs btn-danger'; del.innerHTML = getLiensXWikiIcon('trash');
      del.addEventListener('click', function () { excelRows.splice(index, 1); renderExcelPreview(); });
      action.appendChild(del); tr.appendChild(action); previewBody.appendChild(tr);

      if (row.invalid) invalidCount++;
      if (row.duplicateAcronym || row.duplicateLabel) {
        duplicateCount++;
        var duplicate = document.createElement('tr');
        var reasons = [];
        if (row.duplicateAcronymExisting) reasons.push('Acronyme : liens existants');
        if (row.duplicateAcronymFile) reasons.push('Acronyme : fichier Excel');
        if (row.duplicateLabelExisting) reasons.push('Libellé : liens existants');
        if (row.duplicateLabelFile) reasons.push('Libellé : fichier Excel');
        duplicate.innerHTML = '<td></td><td></td><td></td><td></td>';
        duplicate.children[0].textContent = row.sourceLine;
        duplicate.children[1].textContent = row.acronym;
        duplicate.children[2].textContent = row.label;
        duplicate.children[3].textContent = reasons.join(' ; ');
        if (row.duplicateAcronym) duplicate.children[1].classList.add('danger');
        if (row.duplicateLabel) duplicate.children[2].classList.add('danger');
        duplicatesBody.appendChild(duplicate);
      }
    });

    if (!duplicateCount) {
      var empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="4" class="text-success">Aucun doublon détecté.</td>';
      duplicatesBody.appendChild(empty);
    }

    var summary = document.getElementById('excelLiensSelectionSummary');
    if (summary) {
      summary.textContent = excelRows.length + ' ligne(s) détectée(s)' + (invalidCount ? ' — ' + invalidCount + ' incomplète(s)' : '') + '.';
    }
  }

  async function readExcelFile(file) {
    var xlsxLibrary;
    try {
      xlsxLibrary = await ensureLiensSheetJSLoaded();
    } catch (error) {
      console.error(error);
      alert('La bibliothèque Excel n\'a pas pu être chargée correctement : ' + error.message);
      return;
    }

    try {
      var buffer = await file.arrayBuffer();
      if (!isLiensSheetJSLibrary(xlsxLibrary)) throw new Error('La bibliothèque SheetJS chargée ne possède pas read()');
      var workbook = xlsxLibrary.read(buffer, { type: 'array' });
      if (!workbook.SheetNames || !workbook.SheetNames.length) {
        alert('Le fichier Excel ne contient aucune feuille lisible.');
        return;
      }
      excelSheetName = workbook.SheetNames[0];
      var worksheet = workbook.Sheets[excelSheetName];
      var rawRows = xlsxLibrary.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      if (!rawRows.length) {
        alert('La première feuille du fichier est vide.');
        return;
      }

      excelHeaderInfo = detectColumns(rawRows[0] || []);
      var start = excelHeaderInfo.detected ? 1 : 0;
      excelRows = [];
      for (var i = start; i < rawRows.length; i++) {
        var source = rawRows[i] || [];
        var item = {
          sourceLine: i + 1,
          acronym: String(source[excelHeaderInfo.map.acronym] == null ? '' : source[excelHeaderInfo.map.acronym]).trim(),
          label: String(source[excelHeaderInfo.map.label] == null ? '' : source[excelHeaderInfo.map.label]).trim(),
          definition: String(source[excelHeaderInfo.map.definition] == null ? '' : source[excelHeaderInfo.map.definition]).trim(),
          type: String(source[excelHeaderInfo.map.type] == null ? 'personnel' : source[excelHeaderInfo.map.type]).trim().toLowerCase() || 'personnel',
          author: String(source[excelHeaderInfo.map.author] == null ? liensState.userId : source[excelHeaderInfo.map.author]).trim() || liensState.userId
        };
        if (!item.acronym && !item.label && !item.definition) continue;
        if (item.type !== 'commun') item.type = 'personnel';
        if (!liensState.isManager) { item.type = 'personnel'; item.author = liensState.userId; }
        excelRows.push(item);
      }
      excelFileName = file.name;
      renderExcelPreview();
      jQuery('#excelLiensModal').modal('show');
    } catch (error) {
      console.error(error);
      alert('Impossible de lire ce fichier Excel : ' + error.message);
    }
  }

  async function importExcelRows() {
    var acceptAcronym = document.getElementById('excelLiensAcceptDuplicateAcronyms');
    var acceptLabel = document.getElementById('excelLiensAcceptDuplicateLabels');
    var allowA = !!(acceptAcronym && acceptAcronym.checked);
    var allowL = !!(acceptLabel && acceptLabel.checked);
    recomputeExcelFlags();

    var candidates = excelRows.filter(function (row) {
      if (row.invalid) return false;
      if (row.duplicateAcronym && !allowA) return false;
      if (row.duplicateLabel && !allowL) return false;
      return true;
    });
    if (!candidates.length) {
      alert('Aucune ligne ne peut être importée avec les options actuelles.');
      return;
    }

    var success = 0;
    var errors = [];
    for (var i = 0; i < candidates.length; i++) {
      var row = candidates[i];
      var result = await postLiens({
        action: 'create', acronym: row.acronym, label: row.label, definition: row.definition,
        type: row.type || 'personnel', proprietaire: row.author || liensState.userId
      });
      if (result.indexOf('GLOSSAIRE_OK') !== -1) success++;
      else errors.push('Ligne ' + row.sourceLine + ' : ' + cleanServerLine(result));
    }

    jQuery('#excelLiensModal').modal('hide');
    await refreshExistingPopup();
    alert(success + ' élément(s) ajouté(s).' + (errors.length ? '\n' + errors.length + ' erreur(s).' : ''));
    if (success) window.location.reload();
  }

  function createExcelUi() {
    if (document.getElementById('excelLiensModal')) return;

    var exampleModal = document.createElement('div');
    exampleModal.innerHTML =
      '<div class="modal fade" id="excelExampleLiensModal" tabindex="-1" role="dialog" aria-hidden="true">' +
        '<div class="modal-dialog modal-lg" role="document"><div class="modal-content">' +
          '<div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-label="Fermer" title="Fermer">' + getLiensXWikiIcon('cross') + '</button><h4 class="modal-title">Exemple de fichier Excel</h4></div>' +
          '<div class="modal-body"><p>Format conseillé : une première ligne d’entête, puis une ligne par lien.</p>' +
            '<div class="table-responsive"><table class="table table-striped table-bordered">' +
              '<thead><tr><th>Acronyme</th><th>Libellé</th><th>Définition</th><th>Type</th><th>Auteur</th></tr></thead>' +
              '<tbody><tr><td>API</td><td>Application Programming Interface</td><td>Interface de programmation</td><td>personnel</td><td>' + (liensState.userId || 'DOE') + '</td></tr>' +
              '<tr><td>VPN</td><td>Virtual Private Network</td><td>Réseau privé virtuel</td><td>commun</td><td>' + (liensState.userId || 'DOE') + '</td></tr></tbody>' +
            '</table></div>' +
            '<p class="text-muted">Auteur est facultatif : s’il est vide, l’utilisateur qui importe est utilisé. Un non-manager est toujours forcé en Personnel avec lui-même comme auteur.</p>' +
          '</div><div class="modal-footer"><button type="button" class="btn btn-default" data-dismiss="modal">Fermer</button></div>' +
        '</div></div></div>';
    document.body.appendChild(exampleModal.firstChild);

    var modal = document.createElement('div');
    modal.innerHTML =
      '<div class="modal fade" id="excelLiensModal" tabindex="-1" role="dialog" aria-hidden="true">' +
        '<div class="modal-dialog modal-lg excel-import-dialog" role="document"><div class="modal-content">' +
          '<div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-label="Fermer" title="Fermer">' + getLiensXWikiIcon('cross') + '</button><h4 class="modal-title">Import Excel des liens</h4></div>' +
          '<div class="modal-body">' +
            '<div id="excelLiensInfo" class="text-muted excel-import-info"></div>' +
            '<div class="row">' +
              '<div class="col-md-8"><h5><strong>Données récupérées</strong></h5><div class="excel-import-table-wrap excel-import-preview-wrap">' +
                '<table class="table table-striped table-bordered table-condensed excel-import-table"><thead><tr>' +
                  '<th class="excel-line-col">Ligne</th><th>Acronyme</th><th>Libellé</th><th>Définition</th><th>Type</th><th>Auteur</th><th class="excel-action-col">Action</th>' +
                '</tr></thead><tbody id="excelLiensPreviewBody"></tbody></table></div></div>' +
              '<div class="col-md-4"><h5><strong>Doublons détectés</strong></h5>' +
                '<p class="text-muted">Rouge = champ en doublon. Le motif indique s’il existe déjà dans les liens visibles ou dans le fichier Excel.</p>' +
                '<div class="excel-import-table-wrap excel-import-duplicates-wrap"><table class="table table-bordered table-condensed excel-import-table">' +
                  '<thead><tr><th>Ligne</th><th>Acronyme</th><th>Libellé</th><th>Motif</th></tr></thead><tbody id="excelLiensDuplicatesBody"></tbody>' +
                '</table></div>' +
                '<div class="excel-import-options">' +
                  '<label><input type="checkbox" id="excelLiensAcceptDuplicateAcronyms"> Accepter les acronymes en double</label>' +
                  '<label><input type="checkbox" id="excelLiensAcceptDuplicateLabels"> Accepter les libellés en double</label>' +
                '</div><div id="excelLiensSelectionSummary" class="text-muted excel-import-summary"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer"><button type="button" class="btn btn-default" data-dismiss="modal">Annuler</button><button type="button" id="btnConfirmExcelLiensImport" class="btn btn-primary">Ajouter les éléments</button></div>' +
        '</div></div></div>';
    document.body.appendChild(modal.firstChild);

    document.getElementById('btnExcelExampleLiens').addEventListener('click', function () {
      jQuery('#excelExampleLiensModal').modal('show');
    });
    document.getElementById('btnImportExcelLiens').addEventListener('click', function () {
      document.getElementById('excelLiensFileInput').click();
    });
    document.getElementById('excelLiensFileInput').addEventListener('change', function () {
      if (this.files && this.files[0]) readExcelFile(this.files[0]);
      this.value = '';
    });
    document.getElementById('btnConfirmExcelLiensImport').addEventListener('click', importExcelRows);
  }

  function installTabWatcher() {
    document.querySelectorAll('.tablinks').forEach(function (button) {
      button.addEventListener('click', function () {
        if (bulkDeleteMode) setBulkDeleteMode(false);
        setTimeout(updateToolbarForCurrentTab, 0);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    setupToolbar();
    createExcelUi();
    installSortButtons('mainGlossaryTable', 'main-term-row', 'personal', ['acronym', 'label', 'definition', 'type']);
    installSortButtons('secondaryGlossaryTable', 'secondary-term-row', 'common', ['acronym', 'label', 'definition', 'author', 'type']);
    ensureBulkCells('personal');
    ensureBulkCells('common');
    installTabWatcher();
    detectManagerFromExistingPage();
    try { await refreshExistingPopup(); } catch (e) { console.error(e); }
    applyManagerUi();
    setBulkDeleteMode(false);
  });
})();
