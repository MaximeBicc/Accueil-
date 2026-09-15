// Adaptation des fonctions du Glossaire à la page Liens existante.
// Ce fichier complète les extensions existantes sans remplacer l'architecture Mes Liens / Liens Communs.
(function () {
  'use strict';

  var liensState = { userId: '', isManager: false };
  var selectedPersonal = new Set();
  var selectedCommon = new Set();
  var excelRows = [];

  function getCsrf() {
    var table = document.getElementById('mainGlossaryTable') || document.getElementById('secondaryGlossaryTable');
    return table ? table.getAttribute('data-csrf') : '';
  }

  async function postLiens(fields) {
    var data = new FormData();
    Object.keys(fields).forEach(function (key) { data.append(key, fields[key] == null ? '' : fields[key]); });
    data.append('form_token', getCsrf());
    var response = await fetch(urlLienData + '?xpage=plain', {
      method: 'POST', body: data, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    return response.text();
  }

  function cleanServerLine(line) {
    return String(line || '').replace(/<[^>]+>/g, '').trim();
  }

  async function loadVisibleLinks() {
    var text = await postLiens({ action: 'listVisible' });
    var rows = [];
    text.split(/\r?\n/).forEach(function (rawLine) {
      var line = cleanServerLine(rawLine);
      if (line.indexOf('LIEN_ROW|') !== -1) {
        line = line.substring(line.indexOf('LIEN_ROW|'));
        var p = line.split('|');
        rows.push({ ref: p[1] || '', acronym: p[2] || '', label: p[3] || '', definition: p[4] || '', type: p[5] || '', owner: p[6] || '' });
      } else if (line.indexOf('LIEN_LIST_OK|') !== -1) {
        line = line.substring(line.indexOf('LIEN_LIST_OK|'));
        var s = line.split('|');
        liensState.userId = s[1] || '';
        liensState.isManager = String(s[2]).toLowerCase() === 'true';
      }
    });
    return rows;
  }

  async function refreshExistingPopup() {
    var tbody = document.querySelector('#popupCheckTable tbody');
    if (!tbody) return;
    try {
      var rows = await loadVisibleLinks();
      tbody.innerHTML = '';
      rows.sort(function (a, b) { return a.acronym.localeCompare(b.acronym, 'fr', { sensitivity: 'base', numeric: true }); });
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

  function hideCommonActionsForNonManager() {
    var table = document.getElementById('secondaryGlossaryTable');
    if (!table || liensState.isManager) return;
    Array.from(table.rows).forEach(function (row) {
      if (row.cells.length) row.cells[row.cells.length - 1].style.display = 'none';
    });
  }

  function applyManagerUi() {
    hideCommonActionsForNonManager();
    var commonOption = document.querySelector('#glossaryModal select[name="type"] option[value="commun"]');
    if (commonOption && !liensState.isManager) commonOption.disabled = true;
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
      return textFor(a, tableKind, column).trim().localeCompare(textFor(b, tableKind, column).trim(), 'fr', { sensitivity: 'base', numeric: true }) * (direction === 'desc' ? -1 : 1);
    });
    rows.forEach(function (row) { tbody.appendChild(row); });
    if (tableKind === 'personal' && typeof applyPagination === 'function') applyPagination();
    if (tableKind === 'common' && typeof applyPagination2 === 'function') applyPagination2();
  }

  function installSortButtons(tableId, rowClass, tableKind, columns) {
    var table = document.getElementById(tableId);
    if (!table || !table.tHead || table.tHead.rows.length < 2) return;
    var filterRow = table.tHead.rows[1];
    columns.forEach(function (column, index) {
      var cell = filterRow.cells[index];
      if (!cell || cell.querySelector('.liens-sort-btn')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-default btn-xs liens-sort-btn';
      button.textContent = 'A→Z';
      button.dataset.direction = 'asc';
      button.style.marginLeft = '5px';
      button.addEventListener('click', function () {
        var next = button.dataset.direction === 'asc' ? 'desc' : 'asc';
        sortTable(tableId, rowClass, tableKind, column, button.dataset.direction);
        button.textContent = button.dataset.direction === 'asc' ? 'Z→A' : 'A→Z';
        button.dataset.direction = next;
      });
      cell.appendChild(button);
    });
  }

  function addSelectionColumn(tableId, rowClass, set, allowed) {
    var table = document.getElementById(tableId);
    if (!table || !allowed || table.dataset.bulkReady === 'true') return;
    table.dataset.bulkReady = 'true';
    Array.from(table.tHead.rows).forEach(function (row, idx) {
      var th = document.createElement('th');
      if (idx === 0) {
        var all = document.createElement('input');
        all.type = 'checkbox';
        all.title = 'Sélectionner les lignes affichées';
        all.addEventListener('change', function () {
          Array.from(table.querySelectorAll('tbody .' + rowClass)).forEach(function (tr) {
            if (tr.style.display === 'none') return;
            var cb = tr.querySelector('.liens-row-select');
            if (cb) { cb.checked = all.checked; cb.dispatchEvent(new Event('change')); }
          });
        });
        th.appendChild(all);
      }
      row.insertBefore(th, row.firstChild);
    });
    Array.from(table.querySelectorAll('tbody .' + rowClass)).forEach(function (tr) {
      var td = document.createElement('td');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'liens-row-select';
      cb.addEventListener('change', function () {
        var ref = tr.getAttribute('data-full-ref');
        if (cb.checked) set.add(ref); else set.delete(ref);
      });
      td.appendChild(cb); tr.insertBefore(td, tr.firstChild);
    });
    var bar = document.createElement('div');
    bar.style.margin = '8px 0';
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'btn btn-danger btn-sm'; del.textContent = 'Supprimer la sélection';
    del.addEventListener('click', async function () {
      if (!set.size) return alert('Aucun lien sélectionné.');
      if (!window.confirm('Supprimer définitivement ' + set.size + ' lien(s) ?')) return;
      var refs = Array.from(set); var errors = 0;
      for (var i = 0; i < refs.length; i++) {
        var result = await postLiens({ action: 'delete', targetRef: refs[i] });
        if (result.indexOf('GLOSSAIRE_OK') !== -1) {
          var row = table.querySelector('tr[data-full-ref="' + CSS.escape(refs[i]) + '"]');
          if (row) row.remove();
          set.delete(refs[i]);
        } else errors++;
      }
      if (tableKindFromId(tableId) === 'personal' && typeof applyPagination === 'function') applyPagination();
      if (tableKindFromId(tableId) === 'common' && typeof applyPagination2 === 'function') applyPagination2();
      refreshExistingPopup();
      if (errors) alert(errors + ' suppression(s) refusée(s) ou en erreur.');
    });
    bar.appendChild(del); table.parentNode.insertBefore(bar, table);
  }

  function tableKindFromId(id) { return id === 'mainGlossaryTable' ? 'personal' : 'common'; }

  function normalizeHeader(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/[^a-z0-9]/g, '');
  }

  function headerType(value) {
    var h = normalizeHeader(value);
    if (['acronyme','acronym','sigle','nom','nomlien'].indexOf(h) >= 0) return 'acronym';
    if (['libelle','label','lien','libellecomplet'].indexOf(h) >= 0) return 'label';
    if (['definition','def','description'].indexOf(h) >= 0) return 'definition';
    if (['type','visibilite','onglet'].indexOf(h) >= 0) return 'type';
    if (['auteur','author','proprietaire','createur'].indexOf(h) >= 0) return 'author';
    return '';
  }

  function detectColumns(firstRow) {
    var map = {}, used = {};
    firstRow.forEach(function (cell, index) { var t = headerType(cell); if (t && map[t] == null) { map[t] = index; used[index] = true; } });
    var canonical = ['acronym','label','definition','type','author'];
    canonical.forEach(function (t) {
      if (map[t] != null) return;
      for (var i = 0; i < Math.max(firstRow.length, 5); i++) if (!used[i]) { map[t] = i; used[i] = true; break; }
    });
    return { map: map, detected: Object.keys(map).some(function (k) { return headerType(firstRow[map[k]]) === k; }) };
  }

  function ensureSheetJS() {
    if (window.XLSX && typeof window.XLSX.read === 'function') return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.onload = function () { resolve(window.XLSX); };
      script.onerror = function () { reject(new Error('Impossible de charger SheetJS.')); };
      document.head.appendChild(script);
    });
  }

  function renderExcelPreview() {
    var body = document.getElementById('liensExcelPreviewBody'); if (!body) return;
    body.innerHTML = '';
    excelRows.forEach(function (row, index) {
      var tr = document.createElement('tr');
      ['acronym','label','definition','type','author'].forEach(function (field) {
        var td = document.createElement('td'); var input = document.createElement('input');
        input.className = 'form-control input-sm'; input.value = row[field] || '';
        if (field === 'type' && !liensState.isManager) { input.value = 'personnel'; input.disabled = true; }
        if (field === 'author' && !liensState.isManager) { input.value = liensState.userId; input.disabled = true; }
        input.addEventListener('change', function () { row[field] = input.value; });
        td.appendChild(input); tr.appendChild(td);
      });
      var td = document.createElement('td'); var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-xs btn-danger'; b.textContent = '×';
      b.addEventListener('click', function () { excelRows.splice(index, 1); renderExcelPreview(); }); td.appendChild(b); tr.appendChild(td);
      body.appendChild(tr);
    });
  }

  function buildExcelModal() {
    if (document.getElementById('liensExcelModal')) return;
    var modal = document.createElement('div'); modal.id = 'liensExcelModal'; modal.className = 'modal fade'; modal.tabIndex = -1;
    modal.innerHTML = '<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header"><button type="button" class="close" data-dismiss="modal">&times;</button><h4>Importer un Excel</h4></div><div class="modal-body"><input id="liensExcelFile" type="file" accept=".xlsx,.xls,.csv" class="form-control"><p class="help-block">Colonnes reconnues : Acronyme, Libellé, Définition, Type, Auteur. Type = personnel et Auteur = utilisateur courant par défaut.</p><div class="table-responsive"><table class="table table-bordered table-condensed"><thead><tr><th>Acronyme</th><th>Libellé</th><th>Définition</th><th>Type</th><th>Auteur</th><th></th></tr></thead><tbody id="liensExcelPreviewBody"></tbody></table></div></div><div class="modal-footer"><button class="btn btn-default" data-dismiss="modal">Annuler</button><button id="liensExcelImportConfirm" class="btn btn-primary" type="button">Ajouter les lignes</button></div></div></div>';
    document.body.appendChild(modal);
    document.getElementById('liensExcelFile').addEventListener('change', async function () {
      if (!this.files || !this.files[0]) return;
      try {
        var XLSX = await ensureSheetJS(); var buffer = await this.files[0].arrayBuffer(); var book = XLSX.read(buffer, { type: 'array' });
        var sheet = book.Sheets[book.SheetNames[0]]; var raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!raw.length) return;
        var info = detectColumns(raw[0]); var start = info.detected ? 1 : 0; excelRows = [];
        for (var i = start; i < raw.length; i++) {
          var r = raw[i] || []; var item = {
            acronym: String(r[info.map.acronym] || '').trim(), label: String(r[info.map.label] || '').trim(), definition: String(r[info.map.definition] || '').trim(),
            type: String(r[info.map.type] || 'personnel').trim().toLowerCase() || 'personnel', author: String(r[info.map.author] || liensState.userId).trim() || liensState.userId
          };
          if (!item.acronym && !item.label && !item.definition) continue;
          if (!liensState.isManager) { item.type = 'personnel'; item.author = liensState.userId; }
          excelRows.push(item);
        }
        renderExcelPreview();
      } catch (e) { alert(e.message || e); }
    });
    document.getElementById('liensExcelImportConfirm').addEventListener('click', async function () {
      var ok = 0, errors = [];
      for (var i = 0; i < excelRows.length; i++) {
        var row = excelRows[i]; if (!row.acronym || !row.label || !row.definition) { errors.push('Ligne ' + (i + 1) + ' incomplète'); continue; }
        var result = await postLiens({ action:'create', acronym:row.acronym, label:row.label, definition:row.definition, type:row.type || 'personnel', proprietaire:row.author || liensState.userId });
        if (result.indexOf('GLOSSAIRE_OK') !== -1) ok++; else errors.push(row.acronym + ' : ' + cleanServerLine(result));
      }
      alert(ok + ' élément(s) ajouté(s).' + (errors.length ? '\n' + errors.join('\n') : ''));
      if (!errors.length) jQuery('#liensExcelModal').modal('hide');
      if (ok) window.location.reload();
    });
  }

  function installExcelButton() {
    var toolbar = document.querySelector('.row .col-md-6'); if (!toolbar || document.getElementById('liensExcelButton')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'liensExcelButton'; b.className = 'btn btn-default'; b.style.marginLeft = '8px'; b.textContent = 'Importer Excel';
    b.addEventListener('click', function () { buildExcelModal(); jQuery('#liensExcelModal').modal('show'); }); toolbar.appendChild(b);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    installSortButtons('mainGlossaryTable', 'main-term-row', 'personal', ['acronym','label','definition','type']);
    installSortButtons('secondaryGlossaryTable', 'secondary-term-row', 'common', ['acronym','label','definition','author','type']);
    installExcelButton(); buildExcelModal();
    await refreshExistingPopup();
    addSelectionColumn('mainGlossaryTable', 'main-term-row', selectedPersonal, true);
    addSelectionColumn('secondaryGlossaryTable', 'secondary-term-row', selectedCommon, liensState.isManager);
    applyManagerUi();
    var addModal = document.getElementById('glossaryModal'); if (addModal) jQuery(addModal).on('show.bs.modal', refreshExistingPopup);
  });
})();
