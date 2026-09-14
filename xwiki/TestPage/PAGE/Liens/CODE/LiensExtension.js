/* Liens v2. XWiki.JavaScriptExtension : parser le contenu = NON.
 * Une seule extension autonome ; ne pas charger les anciens scripts du glossaire/Lien-test.
 */
(function (root, factory) {
  'use strict';
  var app = factory();
  if (typeof module === 'object' && module.exports) module.exports = app;
  if (root && root.document) {
    root.LiensApp = app;
    var start = function () { var host = root.document.getElementById('liens-app'); if (host) app.mount(host, root); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
    else start();
    if (root.document.observe) root.document.observe('xwiki:dom:loaded', start);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var fields = ['acronym', 'label', 'definition', 'type', 'author'];
  var labels = ['Acronyme', 'Libellé', 'Définition', 'Type', 'Auteur'];
  function clean(v) { return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }
  function fold(v) { return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
  function key(v) { return clean(v).toUpperCase(); }
  function headerType(v) {
    var word = fold(v).replace(/[^A-Z0-9]/g, '');
    var aliases = {
      acronym: ['ACRONYME', 'ACRONYM', 'SIGLE', 'NOM', 'NOMLIEN', 'NOMDULIEN'],
      label: ['LIBELLE', 'LIBELLECOMPLET', 'LABEL', 'LIEN', 'URL'],
      definition: ['DEFINITION', 'DEF', 'DESCRIPTION'],
      type: ['TYPE', 'VISIBILITE', 'COMMUNPERSONNEL', 'PERSONNELCOMMUN'],
      author: ['AUTEUR', 'AUTHOR', 'PROPRIETAIRE', 'CREATEUR', 'UTILISATEUR']
    };
    return fields.find(function (f) { return aliases[f].indexOf(word) !== -1; });
  }
  function detectHeader(row) {
    var map = {}, used = new Set(), inferred = [];
    row.forEach(function (v, i) { var f = headerType(v); if (f && map[f] == null) { map[f] = i; used.add(i); } });
    var detected = used.size > 0;
    if (!detected) return { detected: false, map: { acronym: 0, label: 1, definition: 2, type: row.length > 3 ? 3 : -1, author: row.length > 4 ? 4 : -1 }, inferred: [] };
    fields.forEach(function (f, i) {
      if (map[f] != null) return;
      var available = row.map(function (_, n) { return n; }).filter(function (n) { return !used.has(n); });
      if (available.length) { map[f] = available[0]; used.add(map[f]); inferred.push(f); }
      else map[f] = -1;
    });
    return { detected: true, map: map, inferred: inferred };
  }
  function readRows(raw, header, defaults, offset) {
    var result = [];
    raw.forEach(function (source, index) {
      if (index === 0 && header.detected) return;
      var row = { sourceLine: index + 1 + (offset || 0) };
      fields.forEach(function (f) { row[f] = clean(source[header.map[f]]); });
      if (fields.every(function (f) { return !row[f]; })) return;
      row.type = fold(row.type) === 'COMMUN' ? 'commun' : fold(row.type) === 'PERSONNEL' ? 'personnel' : row.type || defaults.type;
      row.author = row.author || defaults.author;
      result.push(row);
    });
    return result;
  }
  function visible(row, user) { return row.type === 'commun' || (row.type === 'personnel' && row.author === user); }
  function editable(row, user, manager) { return row.type === 'commun' ? !!manager : row.type === 'personnel' && row.author === user; }
  function errors(row, user, manager) {
    var result = [];
    if (!clean(row.acronym) || !clean(row.label) || !clean(row.definition)) result.push('Acronyme, libellé et définition obligatoires');
    if (/[\x00-\x1f\x7f/\\${}:|]/.test(row.acronym) || ['.', '..', 'WebHome', 'WebPreferences'].indexOf(row.acronym) >= 0) result.push('Nom de fiche invalide');
    if (row.acronym.length > 150 || row.label.length > 2000 || row.definition.length > 20000) result.push('Valeur trop longue');
    if (!/^[\p{L}\p{N}_@.-]{1,100}$/u.test(row.author) || ['.', '..', 'XWikiGuest'].indexOf(row.author) >= 0) result.push('Auteur : identifiant XWiki attendu');
    if (row.type !== 'commun' && row.type !== 'personnel') result.push('Type : personnel ou commun attendu');
    if (!manager && row.type !== 'personnel') result.push('Commun réservé aux managers');
    if (!manager && row.author !== user) result.push('Un non-manager ne peut pas choisir un autre auteur');
    return result;
  }
  function scope(row) { return JSON.stringify([row.type, row.type === 'commun' ? '' : row.author]); }
  function importPlan(rows, existing, user, manager, allowAcronym, allowLabel) {
    var knownA = new Set(), knownL = new Set(), seenA = new Set(), seenL = new Set();
    existing.filter(function (r) { return visible(r, user); }).forEach(function (r) {
      knownA.add(scope(r) + key(r.acronym)); knownL.add(scope(r) + key(r.label));
    });
    return rows.map(function (row) {
      var a = scope(row) + key(row.acronym), l = scope(row) + key(row.label), reason = errors(row, user, manager);
      var dupA = knownA.has(a) || seenA.has(a), dupL = knownL.has(l) || seenL.has(l);
      if (knownA.has(a)) reason.push('Acronyme : liens existants');
      if (seenA.has(a)) reason.push('Acronyme : fichier Excel');
      if (knownL.has(l)) reason.push('Libellé : liens existants');
      if (seenL.has(l)) reason.push('Libellé : fichier Excel');
      var eligible = !row.done && !errors(row, user, manager).length && (allowAcronym || !dupA) && (allowLabel || !dupL);
      if (eligible) { seenA.add(a); seenL.add(l); }
      return { row: row, eligible: eligible, reasons: reason, duplicateAcronym: dupA, duplicateLabel: dupL };
    });
  }
  var collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  function sorted(rows, field, direction) {
    return rows.slice().sort(function (a, b) { return direction * collator.compare(a[field] || '', b[field] || '') || collator.compare(a.ref || '', b.ref || ''); });
  }
  function filtered(rows, filters) {
    return rows.filter(function (r) { return fields.every(function (f) { return fold(r[f]).indexOf(fold(filters[f])) !== -1; }); });
  }
  function pageRows(rows, page, size) {
    var pages = size === 'all' ? 1 : Math.max(1, Math.ceil(rows.length / Number(size)));
    page = Math.min(pages, Math.max(1, page));
    return { rows: size === 'all' ? rows : rows.slice((page - 1) * Number(size), page * Number(size)), page: page, pages: pages };
  }
  async function sequential(items, submit, progress) {
    var report = { saved: 0, skipped: 0, failed: 0, uncertain: false };
    for (var i = 0; i < items.length; i++) {
      var result;
      try { result = await submit(items[i]); }
      catch (error) { report.failed++; report.uncertain = true; progress(items[i], { ok: false, uncertain: true, message: error.message }, report); break; }
      if (!result.ok) report.failed++;
      else if (result.skipped) report.skipped++;
      else report.saved++;
      progress(items[i], result, report);
      if (['SERVER', 'UNCERTAIN', 'RECOVERY_REQUIRED'].indexOf(result.code) !== -1) { report.uncertain = true; break; }
    }
    return report;
  }

  function mount(host, win) {
    if (host.dataset.mounted) return;
    host.dataset.mounted = 'true';
    var doc = win.document, user = '', manager = false, records = [], active = 'personnel', busy = false;
    var states = { personnel: { filters: {}, sort: 'acronym', dir: 1, page: 1 }, commun: { filters: {}, sort: 'acronym', dir: 1, page: 1 } };
    var selected = new Set(), preview = [], book = null, libraryPromise = null, xlsx = null, rawRows = [], header = null, rowOffset = 0;
    var previewTab = 'all', editing = null, lastFocus = null;
    var recoveryKey = 'liens-v2-pending:' + host.dataset.endpoint;
    function q(selector) { return host.querySelector(selector); }
    function el(tag, text, className) { var node = doc.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
    function button(text, fn, className) { var b = el('button', text, className || 'btn btn-default'); b.type = 'button'; b.disabled = busy; b.addEventListener('click', fn); return b; }
    function notice(text, bad) { q('[data-notice]').textContent = text; q('[data-notice]').className = bad ? 'alert alert-danger' : 'alert alert-info'; }
    function uniqueId() { return win.crypto.randomUUID ? win.crypto.randomUUID() : Array.from(win.crypto.getRandomValues(new Uint32Array(6))).map(function (x) { return x.toString(16); }).join('-'); }
    function setBusy(value) { busy = value; host.setAttribute('aria-busy', String(value)); host.querySelectorAll('button,input,select,textarea').forEach(function (n) { n.disabled = value || n.dataset.locked === 'true' || (!user && !n.matches('[data-refresh],[data-resume]')); }); }
    function open(dialog) { lastFocus = doc.activeElement; dialog.showModal(); }
    function close(dialog) { if (!busy) { dialog.close(); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); } }
    async function api(action, payload, id) {
      var data = new URLSearchParams();
      data.set('action', action); data.set('form_token', host.dataset.csrf);
      if (id) data.set('operationId', id);
      Object.keys(payload || {}).forEach(function (k) { data.set(k, payload[k] == null ? '' : String(payload[k])); });
      var response = await win.fetch(host.dataset.endpoint, { method: 'POST', body: data, credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      var text = await response.text(), result;
      try { result = JSON.parse(text); } catch (_) { throw new Error('Réponse DATA non JSON. Vérifiez la page DATA et son URL ; aucune relance automatique.'); }
      if (result.schema !== 'liens-v2') throw new Error('La page DATA ne correspond pas à Liens v2.');
      if (!response.ok && result.ok) throw new Error('Erreur HTTP ' + response.status);
      return result;
    }
    function remember(value) { try { if (value) win.sessionStorage.setItem(recoveryKey, JSON.stringify(value)); else win.sessionStorage.removeItem(recoveryKey); } catch (_) {} }
    async function mutate(action, payload, id) {
      var request = { action: action, payload: payload, id: id || uniqueId() };
      var previous;
      try { previous = JSON.parse(win.sessionStorage.getItem(recoveryKey) || 'null'); } catch (_) {}
      if (previous && previous.id !== request.id) throw new Error('Une opération reste à vérifier. Utilisez « Vérifier / reprendre » avant toute autre écriture.');
      remember(request);
      var result = await api(action, payload, request.id);
      for (var n = 0; result.pending && n < 240; n++) {
        await new Promise(function (resolve) { win.setTimeout(resolve, 500); });
        result = await api('finish', {}, request.id);
      }
      if (result.pending) throw new Error('XWiki travaille encore. Utilisez « Vérifier / reprendre » ; ne recréez pas la fiche.');
      if (['SERVER', 'UNCERTAIN', 'RECOVERY_REQUIRED'].indexOf(result.code) === -1) remember(null);
      return result;
    }
    async function load() {
      var result = await api('list', {});
      if (!result.ok) throw new Error(result.message);
      user = result.user; manager = result.isManager === true;
      // Seconde barrière d'affichage ; la vraie confidentialité est appliquée par DATA.
      records = result.records.filter(function (r) { return visible(r, user); });
      q('[data-role-info]').textContent = manager ? 'Manager — ' + result.managerGroup : 'Liens communs en lecture seule. Import personnel uniquement.';
      render();
    }
    function replaceRecord(result, oldRef) {
      records = records.filter(function (r) { return r.ref !== oldRef && r.ref !== result.ref; });
      if (result.record && visible(result.record, user)) records.push(result.record);
      selected.delete(oldRef); render();
    }

    host.innerHTML = '<div data-notice role="status" aria-live="polite">Chargement des liens…</div>' +
      '<p data-role-info></p><div class="liens-toolbar"><button type="button" data-tab="personnel" class="btn btn-primary">Mes liens personnels</button><button type="button" data-tab="commun" class="btn btn-default">Liens communs</button></div>' +
      '<div class="liens-toolbar"><button type="button" data-add class="btn btn-success">Ajouter un acronyme</button><button type="button" data-import class="btn btn-default">Importer un Excel</button><button type="button" data-example class="btn btn-default">Exemple Excel</button><button type="button" data-refresh class="btn btn-default">Actualiser</button><button type="button" data-resume class="btn btn-default">Vérifier / reprendre</button><button type="button" data-bulk class="btn btn-danger">Supprimer la sélection</button></div>' +
      '<div data-drop tabindex="0" class="liens-drop">Déposez un fichier Excel ici ou utilisez « Importer un Excel ».</div><input data-file type="file" accept=".xlsx,.xls,.xlsm,.xlsb" hidden>' +
      '<div class="liens-toolbar"><label>Éléments par page <select data-size><option>5</option><option selected>10</option><option>25</option><option>50</option><option value="all">Tout afficher</option></select></label><button type="button" data-prev class="btn btn-default">Précédent</button><span data-page></span><button type="button" data-next class="btn btn-default">Suivant</button></div>' +
      '<div class="liens-table-wrap"><table class="table table-striped table-bordered liens-table" data-table><thead></thead><tbody></tbody></table></div>' +
      '<dialog data-editor class="liens-dialog"><form data-editor-form><h3 data-editor-title></h3><div data-editor-fields class="liens-form-grid"></div><p>Un auteur est un identifiant XWiki. Changer l’auteur ou l’acronyme déplace aussi la fiche dans LIENDATA.</p><div data-existing-wrap><h4>Liens déjà existants</h4><p>Vos liens personnels et les liens communs uniquement.</p><div class="liens-table-wrap"><table class="table table-striped"><thead><tr><th>Acronyme</th><th>Libellé</th><th>Type</th><th>Auteur</th></tr></thead><tbody data-existing></tbody></table></div></div><p data-editor-error role="alert"></p><div class="liens-toolbar"><button type="submit" class="btn btn-success">Enregistrer</button><button type="button" data-editor-close class="btn btn-default">Annuler</button></div></form></dialog>' +
      '<dialog data-excel class="liens-dialog liens-wide"><h3>Import Excel des liens</h3><div class="liens-toolbar"><label>Feuille <select data-sheet></select></label><label><input data-header type="checkbox"> Première ligne = en-tête</label><label>Type par défaut <select data-default-type></select></label><label>Auteur par défaut <input data-default-author></label></div><p data-file-info></p><div data-mapping class="liens-toolbar"></div><div class="liens-toolbar"><button type="button" data-preview-tab="all" class="btn btn-default">Tout</button><button type="button" data-preview-tab="personnel" class="btn btn-default">Personnel</button><button type="button" data-preview-tab="commun" class="btn btn-default">Commun</button></div><p>Modifiez les cellules avant l’import. Les lignes communes d’un non-manager restent signalées et ne sont pas importées.</p><div class="liens-table-wrap"><table class="table table-bordered"><thead><tr><th>Ligne</th><th>Acronyme</th><th>Libellé</th><th>Définition</th><th>Type</th><th>Auteur</th><th>Motif / résultat</th><th>Action</th></tr></thead><tbody data-preview></tbody></table></div><div class="liens-toolbar"><label><input data-allow-acronym type="checkbox"> Accepter les acronymes en double</label><label><input data-allow-label type="checkbox"> Accepter les libellés en double</label></div><p data-import-summary role="status"></p><div class="liens-toolbar"><button type="button" data-import-new class="btn btn-primary">Ajouter uniquement les nouveaux</button><button type="button" data-import-options class="btn btn-success">Ajouter selon les options</button><button type="button" data-excel-close class="btn btn-default">Fermer</button></div></dialog>';

    function currentRows() { var state = states[active]; return sorted(filtered(records.filter(function (r) { return r.type === active && visible(r, user); }), state.filters), state.sort, state.dir); }
    function selectionCount() { var count = selected.size; q('[data-bulk]').textContent = 'Supprimer la sélection (' + count + ')'; q('[data-bulk]').disabled = busy || count === 0; }
    function renderBody() {
      var state = states[active], filteredRows = currentRows(), paging = pageRows(filteredRows, state.page, q('[data-size]').value);
      state.page = paging.page;
      var tbody = q('[data-table] tbody'); tbody.replaceChildren();
      var canAct = active === 'personnel' || manager;
      paging.rows.forEach(function (r) {
        var tr = el('tr'); tr.dataset.ref = r.ref;
        if (canAct) {
          var td = el('td'), check = el('input'); check.type = 'checkbox'; check.disabled = busy; check.checked = selected.has(r.ref); check.setAttribute('aria-label', 'Sélectionner ' + r.acronym);
          check.addEventListener('change', function () { if (check.checked) selected.add(r.ref); else selected.delete(r.ref); selectionCount(); }); td.appendChild(check); tr.appendChild(td);
        }
        fields.forEach(function (f) { var cell = el('td', r[f]); cell.className = 'liens-' + f; tr.appendChild(cell); });
        if (canAct) {
          var actions = el('td'); actions.appendChild(button('Modifier', function () { edit(r); }, 'btn btn-xs btn-primary'));
          actions.appendChild(button('Supprimer', function () { remove([r]); }, 'btn btn-xs btn-danger')); tr.appendChild(actions);
        }
        tbody.appendChild(tr);
      });
      if (!paging.rows.length) { var tr = el('tr'), td = el('td', 'Aucun lien ne correspond.'); td.colSpan = canAct ? 7 : 5; tr.appendChild(td); tbody.appendChild(tr); }
      q('[data-page]').textContent = 'Page ' + paging.page + ' / ' + paging.pages + ' — ' + filteredRows.length + ' lien(s)';
      q('[data-prev]').disabled = busy || paging.page === 1;
      q('[data-next]').disabled = busy || paging.page === paging.pages;
      selectionCount();
    }
    function render() {
      var canAct = active === 'personnel' || manager, thead = q('[data-table] thead'), state = states[active]; thead.replaceChildren();
      q('[data-bulk]').hidden = !canAct;
      host.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === active)); b.className = b.dataset.tab === active ? 'btn btn-primary' : 'btn btn-default'; });
      var hr = el('tr'), fr = el('tr');
      if (canAct) {
        var th = el('th'), all = el('input'); all.type = 'checkbox'; all.disabled = busy; all.setAttribute('aria-label', 'Sélectionner tous les résultats filtrés, toutes pages confondues');
        all.addEventListener('change', function () { selected.clear(); if (all.checked) currentRows().forEach(function (r) { selected.add(r.ref); }); renderBody(); });
        th.appendChild(all); hr.appendChild(th); fr.appendChild(el('th'));
      }
      fields.forEach(function (f, i) {
        var th = el('th'); th.setAttribute('aria-sort', state.sort === f ? state.dir === 1 ? 'ascending' : 'descending' : 'none');
        th.appendChild(button(labels[i] + (state.sort === f ? state.dir === 1 ? ' ↑' : ' ↓' : ' ↕'), function () { state.dir = state.sort === f ? -state.dir : 1; state.sort = f; state.page = 1; render(); }, 'liens-sort'));
        hr.appendChild(th);
        var ft = el('th'), input = el('input'); input.type = 'search'; input.disabled = busy; input.placeholder = 'Filtrer…'; input.value = state.filters[f] || ''; input.setAttribute('aria-label', 'Filtrer ' + labels[i]);
        input.addEventListener('input', function () { state.filters[f] = input.value; state.page = 1; selected.clear(); renderBody(); }); ft.appendChild(input); fr.appendChild(ft);
      });
      if (canAct) { hr.appendChild(el('th', 'Actions')); fr.appendChild(el('th')); }
      thead.append(hr, fr); renderBody();
    }
    function typeSelect(value) {
      var select = el('select'); select.appendChild(new win.Option('Personnel', 'personnel'));
      if (manager || value === 'commun') { var common = new win.Option(manager ? 'Commun' : 'Commun — non autorisé', 'commun'); common.disabled = !manager; select.appendChild(common); }
      if (value && value !== 'personnel' && value !== 'commun') select.appendChild(new win.Option(value + ' — invalide', value));
      select.value = value; return select;
    }
    function edit(row) {
      if (busy || (row && !editable(row, user, manager))) return;
      editing = row || null;
      var data = row || { acronym: '', label: '', definition: '', type: manager ? active : 'personnel', author: user };
      var wrap = q('[data-editor-fields]'); wrap.replaceChildren();
      q('[data-editor-title]').textContent = row ? 'Modifier le lien' : 'Ajouter un acronyme'; q('[data-editor-error]').textContent = '';
      fields.forEach(function (f, i) {
        var label = el('label', labels[i]), input = f === 'type' ? typeSelect(data[f]) : el(f === 'definition' ? 'textarea' : 'input');
        input.name = f; input.value = data[f]; input.required = true; input.className = 'form-control';
        if (f === 'author') { input.placeholder = 'Identifiant XWiki'; if (!manager) { input.readOnly = true; } }
        input.addEventListener('input', existingMatches); label.appendChild(input); wrap.appendChild(label);
      });
      existingMatches(); open(q('[data-editor]'));
    }
    function formFields() { var data = {}; fields.forEach(function (f) { data[f] = clean(q('[data-editor-fields] [name="' + f + '"]').value); }); return data; }
    function existingMatches() {
      if (!q('[data-editor-fields] [name="acronym"]')) return;
      var values = formFields(), body = q('[data-existing]'); body.replaceChildren();
      records.filter(function (r) { return visible(r, user) && ((!values.acronym && !values.label) || (values.acronym && fold(r.acronym).indexOf(fold(values.acronym)) >= 0) || (values.label && fold(r.label).indexOf(fold(values.label)) >= 0)); }).forEach(function (r) {
        var tr = el('tr'); ['acronym', 'label', 'type', 'author'].forEach(function (f) { tr.appendChild(el('td', r[f])); }); body.appendChild(tr);
      });
    }
    q('[data-editor-form]').addEventListener('submit', async function (event) {
      event.preventDefault(); if (busy) return;
      var data = formFields(), validation = errors(data, user, manager);
      if (validation.length) { q('[data-editor-error]').textContent = validation.join(' ; '); return; }
      if (editing) { data.targetRef = editing.ref; data.version = editing.version; }
      setBusy(true);
      try {
        var result = await mutate(editing ? 'save' : 'create', data);
        if (!result.ok) { q('[data-editor-error]').textContent = result.message; return; }
        replaceRecord(result, editing && editing.ref); q('[data-editor]').close();
        notice(result.visible ? 'Lien enregistré. Son emplacement XWiki est à jour.' : 'Lien enregistré dans le dossier du nouvel auteur. Il ne fait plus partie de vos liens personnels.');
      } catch (error) { q('[data-editor-error]').textContent = error.message; notice(error.message, true); }
      finally { setBusy(false); renderBody(); }
    });
    async function remove(rows) {
      if (busy || !rows.length || rows.some(function (r) { return !editable(r, user, manager); })) return;
      var lines = rows.map(function (r) { return r.acronym + ' — ' + r.author; }).join('\n');
      if (!win.confirm('Supprimer ces ' + rows.length + ' fiche(s) XWiki ?\n\n' + lines)) return;
      setBusy(true);
      var failures = [];
      try {
        var report = await sequential(rows, function (row) { return mutate('delete', { targetRef: row.ref, version: row.version }); }, function (row, result, progress) {
          if (result.ok) { records = records.filter(function (r) { return r.ref !== row.ref; }); selected.delete(row.ref); }
          else failures.push(row.acronym + ' : ' + result.message);
          renderBody(); notice(progress.saved + ' suppression(s) confirmée(s).');
        });
        notice(report.saved + ' suppression(s) confirmée(s), ' + report.failed + ' échec(s).' + (failures.length ? '\n' + failures.join('\n') : ''), failures.length > 0);
      } finally { setBusy(false); renderBody(); }
    }

    function loadLibrary() {
      if (libraryPromise) return libraryPromise;
      function valid(lib) { return lib && typeof lib.read === 'function' && lib.utils && typeof lib.utils.sheet_to_json === 'function'; }
      libraryPromise = new Promise(function (resolve, reject) {
        var url = host.dataset.xlsxUrl;
        if (valid(win.XLSX) && win.XLSX.version === '0.20.3') { resolve(win.XLSX); return; }
        var timer = win.setTimeout(function () { reject(new Error('Chargement Excel impossible. Attachez xlsx.full.min.js à la page LiensExtension si le CDN est bloqué.')); }, 30000);
        function done(lib) { win.clearTimeout(timer); if (valid(lib)) resolve(lib); else reject(new Error('Module Excel invalide (read / sheet_to_json absent).')); }
        function fail() { win.clearTimeout(timer); reject(new Error('Bibliothèque Excel indisponible. Vérifiez le fichier local ou l’accès au CDN SheetJS.')); }
        // Le module UMD SheetJS se nomme xlsx : ne pas désactiver window.define.
        if (win.requirejs && win.define && win.define.amd) {
          win.requirejs.config({ paths: { xlsx: url.replace(/\.js$/, '') }, waitSeconds: 30 });
          win.requirejs(['xlsx'], done, fail);
        } else {
          var script = doc.createElement('script'); script.src = url; script.onload = function () { done(win.XLSX); }; script.onerror = fail; doc.head.appendChild(script);
        }
      }).catch(function (error) { libraryPromise = null; throw error; });
      return libraryPromise;
    }
    function defaults() { return { type: q('[data-default-type]').value, author: clean(q('[data-default-author]').value) || user }; }
    function buildMapping() {
      var wrap = q('[data-mapping]'); wrap.replaceChildren();
      fields.forEach(function (f, i) {
        var label = el('label', labels[i]), select = el('select'); select.appendChild(new win.Option('Non fournie / défaut', '-1'));
        (rawRows[0] || []).forEach(function (v, column) { select.appendChild(new win.Option((column + 1) + ' : ' + clean(v), String(column))); }); select.value = String(header.map[f]);
        select.addEventListener('change', function () { header.map[f] = Number(select.value); rebuildPreview(); }); label.appendChild(select); wrap.appendChild(label);
      });
    }
    function rebuildPreview() {
      if (!header) { preview = []; renderPreview(); return; }
      header.detected = q('[data-header]').checked;
      preview = readRows(rawRows, header, defaults(), rowOffset);
      if (preview.length > 2000) { preview = []; q('[data-file-info]').textContent = 'Plus de 2 000 lignes : scindez le fichier.'; }
      renderPreview();
    }
    function chooseSheet() {
      preview = []; header = null; q('[data-preview]').replaceChildren();
      q('[data-import-summary]').textContent = 'Lecture de la feuille…';
      var worksheet = book.Sheets[q('[data-sheet]').value];
      rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '', blankrows: true });
      if (rawRows.length > 2001 || worksheet['!fullref']) throw new Error('Feuille trop grande : maximum 2 000 lignes de données. Scindez le fichier.');
      rowOffset = 0;
      while (rawRows.length && rawRows[0].every(function (v) { return !clean(v); })) { rawRows.shift(); rowOffset++; }
      header = detectHeader(rawRows[0] || []); q('[data-header]').checked = header.detected;
      q('[data-file-info]').textContent = 'En-têtes reconnus dès le premier champ identifié. Colonnes déduites : ' + header.inferred.map(function (f) { return labels[fields.indexOf(f)]; }).join(', ') + '. Vérifiez le mapping ci-dessous.';
      buildMapping(); rebuildPreview();
    }
    function plan(allowA, allowL) { return importPlan(preview, records, user, manager, allowA, allowL); }
    function renderPreview() {
      var body = q('[data-preview]'); body.replaceChildren();
      var planned = plan(q('[data-allow-acronym]').checked, q('[data-allow-label]').checked);
      planned.forEach(function (item) {
        var row = item.row; if (previewTab !== 'all' && row.type !== previewTab) return;
        var tr = el('tr'); tr.appendChild(el('td', row.sourceLine));
        fields.forEach(function (f) {
          var td = el('td'), input = f === 'type' ? typeSelect(row.type) : el(f === 'definition' ? 'textarea' : 'input');
          input.value = row[f]; input.setAttribute('aria-label', labels[fields.indexOf(f)] + ', ligne ' + row.sourceLine); input.className = 'form-control';
          input.disabled = busy || !!row.done; if (row.done) input.dataset.locked = 'true';
          if (f === 'author' && !manager) input.title = 'Seul votre identifiant ' + user + ' est autorisé';
          input.addEventListener('change', function () { row[f] = clean(input.value); row.requestId = null; row.result = ''; renderPreview(); });
          if ((f === 'acronym' && item.duplicateAcronym) || (f === 'label' && item.duplicateLabel)) td.className = 'danger';
          td.appendChild(input); tr.appendChild(td);
        });
        tr.appendChild(el('td', row.result || item.reasons.join(' ; ') || 'Prête'));
        var action = el('td'), erase = button('Retirer', function () { preview = preview.filter(function (r) { return r !== row; }); renderPreview(); }, 'btn btn-xs btn-danger'); erase.disabled = busy || !!row.done; if (row.done) erase.dataset.locked = 'true'; action.appendChild(erase); tr.appendChild(action); body.appendChild(tr);
      });
      var ready = planned.filter(function (p) { return p.eligible; }).length, done = preview.filter(function (r) { return r.done; }).length;
      // Ne jamais réinitialiser les lignes déjà confirmées en changeant la feuille ou le mapping.
      host.querySelectorAll('[data-sheet],[data-header],[data-default-type],[data-default-author],[data-mapping] select').forEach(function (control) { control.dataset.locked = String(done > 0); control.disabled = busy || done > 0; });
      q('[data-import-summary]').textContent = ready + ' ligne(s) admissible(s) selon les options ; ' + done + ' ajout(s) déjà confirmé(s) ; ' + preview.length + ' ligne(s) au total.';
    }
    async function readFile(file) {
      if (busy || !file) return;
      if (!/\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name)) { notice('Sélectionnez un fichier Excel.', true); return; }
      if (file.size > 20 * 1024 * 1024) { notice('Fichier trop grand : maximum 20 Mo.', true); return; }
      setBusy(true); preview = []; header = null; book = null;
      try {
        xlsx = await loadLibrary(); book = xlsx.read(await file.arrayBuffer(), { type: 'array', sheetRows: 2002, cellHTML: false, cellFormula: false, cellStyles: false });
        if (!book.SheetNames.length) throw new Error('Ce classeur ne contient aucune feuille.');
        q('[data-sheet]').replaceChildren(); book.SheetNames.forEach(function (name) { q('[data-sheet]').appendChild(new win.Option(name, name)); });
        var types = typeSelect(manager ? active : 'personnel'); q('[data-default-type]').replaceChildren.apply(q('[data-default-type]'), Array.from(types.options)); q('[data-default-type]').value = manager ? active : 'personnel';
        q('[data-default-author]').value = user; q('[data-default-author]').readOnly = !manager;
        q('[data-allow-acronym]').checked = false; q('[data-allow-label]').checked = false; previewTab = 'all'; chooseSheet(); open(q('[data-excel]'));
      } catch (error) { notice(error.message, true); }
      finally { setBusy(false); renderBody(); if (book && header) renderPreview(); }
    }
    async function importRows(withOptions) {
      if (busy) return;
      var allowA = withOptions && q('[data-allow-acronym]').checked, allowL = withOptions && q('[data-allow-label]').checked;
      var planned = plan(allowA, allowL), ready = planned.filter(function (item) { return item.eligible; }).map(function (item) { return item.row; });
      if (!ready.length) { q('[data-import-summary]').textContent = 'Aucune ligne admissible. Corrigez les motifs indiqués.'; return; }
      if (!win.confirm('Importer ' + ready.length + ' ligne(s) ? ' + (preview.length - ready.length) + ' ligne(s) non admissible(s) ou déjà importée(s) ne seront pas envoyées.')) return;
      setBusy(true);
      try {
        var report = await sequential(ready, function (row) {
          var data = {}; fields.forEach(function (f) { data[f] = row[f]; }); data.allowAcronymDuplicates = !!allowA; data.allowLabelDuplicates = !!allowL;
          row.requestId = row.requestId || uniqueId(); return mutate('import', data, row.requestId);
        }, function (row, result, progress) {
          if (result.ok && !result.skipped) { row.done = true; row.result = result.visible ? 'Ajout confirmé' : 'Ajout confirmé chez le nouvel auteur'; replaceRecord(result); }
          else if (result.skipped) row.result = 'Ignorée : doublon confirmé par le serveur';
          else row.result = (result.uncertain ? 'Résultat à vérifier : ' : 'Refusée : ') + result.message;
          renderPreview(); notice(progress.saved + ' ajout(s) confirmé(s), ' + progress.skipped + ' doublon(s) ignoré(s), ' + progress.failed + ' échec(s).');
        });
        notice(report.saved + ' ajout(s) confirmé(s), ' + report.skipped + ' doublon(s) ignoré(s), ' + report.failed + ' échec(s).' + (report.uncertain ? ' Import interrompu : utilisez Vérifier / reprendre.' : ''), report.failed > 0);
      } finally { setBusy(false); renderBody(); renderPreview(); }
    }
    async function recover() {
      if (busy) return;
      var saved;
      try { saved = JSON.parse(win.sessionStorage.getItem(recoveryKey) || 'null'); } catch (_) {}
      if (!saved) { notice('Aucune opération en attente dans ce navigateur.'); return; }
      setBusy(true);
      try { var result = await mutate(saved.action, saved.payload, saved.id); if (result.ok && !result.skipped) preview.forEach(function (row) { if (row.requestId === saved.id) { row.done = true; row.result = 'Ajout confirmé après reprise'; } }); await load(); if (preview.length) renderPreview(); notice(result.ok ? 'Résultat confirmé ; liste actualisée.' : result.message, !result.ok); }
      catch (error) { notice(error.message, true); }
      finally { setBusy(false); renderBody(); }
    }
    async function example() {
      if (busy) return; setBusy(true);
      try {
        var lib = await loadLibrary(), workbook = lib.utils.book_new();
        var sheet = lib.utils.aoa_to_sheet([labels, ['API', 'Application Programming Interface', 'Interface de communication entre logiciels.', 'personnel', ''], ['HTTP', 'HyperText Transfer Protocol', 'Protocole de communication du Web.', manager ? 'commun' : 'personnel', '']]);
        sheet['!cols'] = [{ wch: 20 }, { wch: 42 }, { wch: 64 }, { wch: 18 }, { wch: 26 }];
        lib.utils.book_append_sheet(workbook, sheet, 'Liens'); lib.writeFile(workbook, 'Exemple-Liens.xlsx');
        notice('Dans le modèle, Auteur vide = utilisateur qui importe. Type vide = type par défaut de l’aperçu.');
      } catch (error) { notice(error.message, true); }
      finally { setBusy(false); renderBody(); }
    }
    host.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { if (busy) return; active = b.dataset.tab; selected.clear(); render(); }); });
    host.querySelectorAll('[data-preview-tab]').forEach(function (b) { b.addEventListener('click', function () { if (busy) return; previewTab = b.dataset.previewTab; renderPreview(); }); });
    q('[data-add]').addEventListener('click', function () { edit(); });
    q('[data-bulk]').addEventListener('click', function () { remove(currentRows().filter(function (r) { return selected.has(r.ref); })); });
    q('[data-import]').addEventListener('click', function () { q('[data-file]').value = ''; q('[data-file]').click(); });
    q('[data-file]').addEventListener('change', function () { readFile(this.files[0]); });
    q('[data-example]').addEventListener('click', example);
    q('[data-resume]').addEventListener('click', recover);
    q('[data-refresh]').addEventListener('click', async function () { if (busy) return; selected.clear(); setBusy(true); try { await load(); notice('Liste actualisée.'); } catch (e) { notice(e.message, true); } finally { setBusy(false); renderBody(); } });
    q('[data-prev]').addEventListener('click', function () { states[active].page--; renderBody(); });
    q('[data-next]').addEventListener('click', function () { states[active].page++; renderBody(); });
    q('[data-size]').addEventListener('change', function () { states[active].page = 1; renderBody(); });
    q('[data-editor-close]').addEventListener('click', function () { close(q('[data-editor]')); });
    q('[data-excel-close]').addEventListener('click', function () { close(q('[data-excel]')); });
    host.querySelectorAll('dialog').forEach(function (d) { d.addEventListener('cancel', function (e) { if (busy) e.preventDefault(); }); });
    q('[data-sheet]').addEventListener('change', function () { try { chooseSheet(); } catch (error) { preview = []; header = null; renderPreview(); q('[data-file-info]').textContent = error.message; notice(error.message, true); } });
    ['[data-header]', '[data-default-type]', '[data-default-author]'].forEach(function (s) { q(s).addEventListener('change', rebuildPreview); });
    ['[data-allow-acronym]', '[data-allow-label]'].forEach(function (s) { q(s).addEventListener('change', renderPreview); });
    q('[data-import-new]').addEventListener('click', function () { importRows(false); });
    q('[data-import-options]').addEventListener('click', function () { importRows(true); });
    var drop = q('[data-drop]');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); if (!busy) drop.classList.add('liens-dragover'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('liens-dragover'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('liens-dragover'); if (!busy) readFile(e.dataTransfer.files[0]); });
    drop.addEventListener('keydown', function (e) { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); q('[data-import]').click(); } });
    setBusy(true);
    load().then(function () { notice('Liens chargés. Les tris portent sur tous les résultats filtrés, pas seulement la page affichée.'); }).catch(function (error) { notice(error.message, true); }).finally(function () { setBusy(false); renderBody(); });
  }
  return { clean: clean, fold: fold, detectHeader: detectHeader, readRows: readRows, visible: visible, editable: editable, errors: errors, importPlan: importPlan, sorted: sorted, filtered: filtered, pageRows: pageRows, sequential: sequential, mount: mount };
});
