// Corrections ciblées sur l'adaptation Glossaire -> Liens.
// 1) conserve TOUS les marqueurs LIEN_ROW même si XWiki les concatène sur une seule ligne ;
// 2) recharge la liste de vérification avec communs + personnels du user courant ;
// 3) réactive le sélecteur XWiki/Selectize du créateur dans l'onglet commun ;
// 4) ajuste en JavaScript les proportions du tableau Mes Liens quand la suppression multiple est active.
(function () {
  'use strict';

  var personalBulkLayoutSnapshot = null;

  function getCsrf() {
    var table = document.getElementById('mainGlossaryTable') || document.getElementById('secondaryGlossaryTable');
    return table ? table.getAttribute('data-csrf') : '';
  }

  function normalizeListVisibleText(text) {
    return String(text || '')
      .replace(/LIEN_ROW\|/g, '\nLIEN_ROW|')
      .replace(/LIEN_LIST_OK\|/g, '\nLIEN_LIST_OK|');
  }

  // Le code de 06-glossaire-adaptation découpe la réponse par lignes.
  // XWiki peut concaténer les sorties Velocity ; on normalise donc uniquement
  // les réponses listVisible avant qu'elles ne soient consommées par ce code.
  if (window.fetch && !window.__liensListVisibleFetchPatched) {
    window.__liensListVisibleFetchPatched = true;
    var nativeFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      return nativeFetch(input, init).then(function (response) {
        var isListVisible = false;
        try {
          isListVisible = !!(init && init.body && typeof init.body.get === 'function' && init.body.get('action') === 'listVisible');
        } catch (e) {}

        if (!isListVisible) return response;

        return response.text().then(function (text) {
          var headers = new Headers(response.headers || {});
          return new Response(normalizeListVisibleText(text), {
            status: response.status,
            statusText: response.statusText,
            headers: headers
          });
        });
      });
    };
  }

  function parseVisibleLinks(text) {
    var plain = String(text || '').replace(/<[^>]+>/g, '');
    var state = { userId: '', isManager: false };
    var stateIndex = plain.indexOf('LIEN_LIST_OK|');

    if (stateIndex >= 0) {
      var statePart = plain.substring(stateIndex + 'LIEN_LIST_OK|'.length);
      var stateFields = statePart.split('|');
      state.userId = String(stateFields[0] || '').replace(/[\r\n].*$/, '').replace(/^\s+|\s+$/g, '');
      state.isManager = String(stateFields[1] || '').toLowerCase().indexOf('true') === 0;
    }

    var rows = [];
    var chunks = plain.split('LIEN_ROW|');
    for (var i = 1; i < chunks.length; i++) {
      var chunk = chunks[i];
      var nextState = chunk.indexOf('LIEN_LIST_OK|');
      if (nextState >= 0) chunk = chunk.substring(0, nextState);

      var fields = chunk.split('|');
      if (fields.length < 6) continue;

      var row = {
        ref: String(fields[0] || '').replace(/^\s+|\s+$/g, ''),
        acronym: String(fields[1] || '').replace(/^\s+|\s+$/g, ''),
        label: String(fields[2] || '').replace(/^\s+|\s+$/g, ''),
        definition: String(fields[3] || '').replace(/^\s+|\s+$/g, ''),
        type: String(fields[4] || '').replace(/^\s+|\s+$/g, ''),
        owner: String(fields[5] || '').replace(/[\r\n].*$/, '').replace(/^\s+|\s+$/g, '')
      };

      // Défense supplémentaire côté navigateur : jamais de personnel d'un autre user.
      if (row.type === 'commun' || (row.type === 'personnel' && row.owner === state.userId)) {
        rows.push(row);
      }
    }

    return { state: state, rows: rows };
  }

  async function refreshPopupWithAllVisibleLinks() {
    var tbody = document.querySelector('#popupCheckTable tbody');
    if (!tbody || typeof urlLienData === 'undefined') return;

    var data = new FormData();
    data.append('action', 'listVisible');
    data.append('form_token', getCsrf());

    try {
      var response = await window.fetch(urlLienData + '?xpage=plain', {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      var parsed = parseVisibleLinks(await response.text());

      parsed.rows.sort(function (a, b) {
        return a.acronym.localeCompare(b.acronym, 'fr', { sensitivity: 'base', numeric: true });
      });

      tbody.innerHTML = '';
      parsed.rows.forEach(function (item) {
        var tr = document.createElement('tr');
        tr.className = 'term-row';
        tr.setAttribute('data-full-ref', item.ref);

        var acronym = document.createElement('td');
        acronym.className = 'term-acronym';
        acronym.textContent = item.acronym;

        var label = document.createElement('td');
        label.className = 'term-label';
        label.textContent = item.label;

        tr.appendChild(acronym);
        tr.appendChild(label);
        tbody.appendChild(tr);
      });

      // Le filtrage reste géré par le script historique 04-popup-filtre.js.
      // Après avoir reconstruit les lignes, on lui demande simplement de réappliquer
      // la valeur courante des deux champs.
      if (typeof window.triggerGlobalFilter === 'function') window.triggerGlobalFilter();
    } catch (error) {
      console.error('Impossible de recharger tous les liens visibles dans la modale', error);
    }
  }

  function repairCreatorPicker(row) {
    if (!row) return;
    var holder = row.querySelector('.edit-proprietaire');
    var select = holder ? holder.querySelector('select.secondary-proprietaire-value') : null;
    if (!holder || !select) return;

    holder.style.display = 'block';
    select.disabled = false;

    function exposeControl() {
      var control = holder.querySelector('.selectize-control, .ts-wrapper');
      if (control) {
        control.style.display = 'block';
        control.style.width = '100%';
        control.style.minWidth = '180px';
        control.style.pointerEvents = 'auto';
      }

      holder.querySelectorAll('.selectize-input, .ts-control, .selectize-input input, .ts-control input').forEach(function (element) {
        element.style.pointerEvents = 'auto';
      });

      var instance = select.tomselect || select.selectize;
      if (instance) {
        try { if (typeof instance.enable === 'function') instance.enable(); } catch (e) {}
        try { if (typeof instance.refreshOptions === 'function') instance.refreshOptions(false); } catch (e) {}
      }
    }

    exposeControl();

    // XWiki initialise automatiquement .xwiki-selectize lors d'un DOM updated.
    // On le retrigger après avoir rendu la zone visible afin d'éviter un contrôle
    // initialisé à largeur 0 pendant que la ligne était en mode lecture.
    if (window.jQuery) {
      try { window.jQuery(document).trigger('xwiki:dom:updated', [holder]); } catch (e) {}

      window.setTimeout(function () {
        try {
          var $select = window.jQuery(select);
          var instance = select.tomselect || select.selectize;
          var hasRichControl = !!holder.querySelector('.selectize-control, .ts-wrapper');
          if (!instance && !hasRichControl && typeof $select.xwikiSelectize === 'function') {
            $select.xwikiSelectize();
          }
        } catch (e) {
          console.warn('Réinitialisation du sélecteur de créateur impossible', e);
        }
        exposeControl();
      }, 0);
    } else {
      // Repli : au minimum le select natif reste utilisable.
      select.style.display = 'block';
      select.style.width = '100%';
    }
  }

  // On garde la fonction historique et on ajoute seulement la remise en état
  // du picker après le passage en mode édition.
  if (typeof window.toggleEditMode2 === 'function' && !window.__liensToggleEditMode2Patched) {
    window.__liensToggleEditMode2Patched = true;
    var originalToggleEditMode2 = window.toggleEditMode2;
    window.toggleEditMode2 = function (button, isEnteringEdit) {
      var result = originalToggleEditMode2.apply(this, arguments);
      if (isEnteringEdit) {
        var row = button && button.closest ? button.closest('.secondary-term-row') : null;
        window.setTimeout(function () { repairCreatorPicker(row); }, 0);
      }
      return result;
    };
  }

  function tagPersonalBulkSelectionColumns() {
    var table = document.getElementById('mainGlossaryTable');
    if (!table) return;

    table.querySelectorAll('.glossary-bulk-select-header, .glossary-bulk-select-filter, .glossary-bulk-select-cell').forEach(function (cell) {
      cell.classList.add('liens-personal-bulk-select-column');
    });
  }

  function capturePersonalBulkLayout(table) {
    if (personalBulkLayoutSnapshot) return;

    personalBulkLayoutSnapshot = {
      tableLayout: table.style.getPropertyValue('table-layout'),
      tableLayoutPriority: table.style.getPropertyPriority('table-layout'),
      headerRows: []
    };

    table.querySelectorAll('thead tr').forEach(function (row) {
      var styles = [];
      Array.from(row.cells).forEach(function (cell) {
        styles.push({
          width: cell.style.getPropertyValue('width'),
          widthPriority: cell.style.getPropertyPriority('width'),
          minWidth: cell.style.getPropertyValue('min-width'),
          minWidthPriority: cell.style.getPropertyPriority('min-width'),
          maxWidth: cell.style.getPropertyValue('max-width'),
          maxWidthPriority: cell.style.getPropertyPriority('max-width')
        });
      });
      personalBulkLayoutSnapshot.headerRows.push(styles);
    });
  }

  function restoreStyleProperty(element, property, value, priority) {
    if (!element) return;
    if (value) element.style.setProperty(property, value, priority || '');
    else element.style.removeProperty(property);
  }

  function restorePersonalBulkLayout() {
    var table = document.getElementById('mainGlossaryTable');
    if (!table || !personalBulkLayoutSnapshot) return;

    restoreStyleProperty(table, 'table-layout', personalBulkLayoutSnapshot.tableLayout, personalBulkLayoutSnapshot.tableLayoutPriority);

    table.querySelectorAll('thead tr').forEach(function (row, rowIndex) {
      var savedRow = personalBulkLayoutSnapshot.headerRows[rowIndex] || [];
      Array.from(row.cells).forEach(function (cell, cellIndex) {
        var saved = savedRow[cellIndex];
        if (!saved) return;
        restoreStyleProperty(cell, 'width', saved.width, saved.widthPriority);
        restoreStyleProperty(cell, 'min-width', saved.minWidth, saved.minWidthPriority);
        restoreStyleProperty(cell, 'max-width', saved.maxWidth, saved.maxWidthPriority);
      });
    });
  }

  function personalBulkColumnIsVisible(table) {
    var header = table ? table.querySelector('.glossary-bulk-select-header') : null;
    return !!(header && !header.classList.contains('is-hidden') && window.getComputedStyle(header).display !== 'none');
  }

  function applyPersonalBulkLayout() {
    var table = document.getElementById('mainGlossaryTable');
    if (!table) return;

    tagPersonalBulkSelectionColumns();

    // Si la sélection multiple n'est pas affichée, ou si Edit a rendu la colonne Type
    // visible, on conserve exactement la mise en page historique du tableau.
    if (!personalBulkColumnIsVisible(table) || !table.classList.contains('hide-type-column')) {
      restorePersonalBulkLayout();
      return;
    }

    capturePersonalBulkLayout(table);

    var tableWidth = table.getBoundingClientRect().width || table.clientWidth || 900;
    var selectWidth = 36;
    var contentWidth = Math.max(tableWidth - selectWidth, 400);

    // Même proportion que les quatre colonnes visibles quand Type est caché :
    // 15 / 25 / 25 / 15, soit 18.75% / 31.25% / 31.25% / 18.75% du reste.
    var widths = {
      acronym: Math.round(contentWidth * 0.1875),
      label: Math.round(contentWidth * 0.3125),
      definition: Math.round(contentWidth * 0.3125),
      actions: Math.round(contentWidth * 0.1875)
    };

    table.style.setProperty('table-layout', 'fixed', 'important');

    table.querySelectorAll('thead tr').forEach(function (row) {
      // Après ajout de la case : 0=Sélection, 1=Acronyme, 2=Libellé,
      // 3=Définition, 4=Type (caché), 5=Actions.
      if (row.cells.length < 6) return;

      row.cells[0].style.setProperty('width', selectWidth + 'px', 'important');
      row.cells[0].style.setProperty('min-width', selectWidth + 'px', 'important');
      row.cells[0].style.setProperty('max-width', selectWidth + 'px', 'important');
      row.cells[1].style.setProperty('width', widths.acronym + 'px', 'important');
      row.cells[2].style.setProperty('width', widths.label + 'px', 'important');
      row.cells[3].style.setProperty('width', widths.definition + 'px', 'important');
      row.cells[5].style.setProperty('width', widths.actions + 'px', 'important');
    });

    table.querySelectorAll('tbody .glossary-bulk-select-cell').forEach(function (cell) {
      cell.style.setProperty('width', selectWidth + 'px', 'important');
      cell.style.setProperty('min-width', selectWidth + 'px', 'important');
      cell.style.setProperty('max-width', selectWidth + 'px', 'important');
    });
  }

  function installPersonalBulkLayoutWatcher() {
    var table = document.getElementById('mainGlossaryTable');
    if (!table) return;

    tagPersonalBulkSelectionColumns();

    var selectionHeader = table.querySelector('.glossary-bulk-select-header');
    if (selectionHeader && window.MutationObserver) {
      var selectionObserver = new MutationObserver(function () {
        window.setTimeout(applyPersonalBulkLayout, 0);
      });
      selectionObserver.observe(selectionHeader, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    if (window.MutationObserver) {
      var tableObserver = new MutationObserver(function () {
        window.setTimeout(applyPersonalBulkLayout, 0);
      });
      tableObserver.observe(table, { attributes: true, attributeFilter: ['class'] });
    }

    var bulkButton = document.getElementById('btnBulkDeleteModeLiens');
    if (bulkButton) {
      bulkButton.addEventListener('click', function () {
        window.setTimeout(applyPersonalBulkLayout, 0);
      });
    }

    window.addEventListener('resize', function () {
      if (personalBulkColumnIsVisible(table)) applyPersonalBulkLayout();
    });

    applyPersonalBulkLayout();
  }

  // Quand on entre / sort du mode édition personnel, Type change de visibilité.
  // On recalcule donc les proportions juste après le comportement historique.
  if (typeof window.toggleEditMode === 'function' && !window.__liensToggleEditModeLayoutPatched) {
    window.__liensToggleEditModeLayoutPatched = true;
    var originalToggleEditMode = window.toggleEditMode;
    window.toggleEditMode = function () {
      var result = originalToggleEditMode.apply(this, arguments);
      window.setTimeout(applyPersonalBulkLayout, 0);
      return result;
    };
  }

  function installModalRefresh() {
    if (!window.jQuery) return;
    window.jQuery('#glossaryModal').off('shown.bs.modal.liensAllRows').on('shown.bs.modal.liensAllRows', function () {
      refreshPopupWithAllVisibleLinks();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    installModalRefresh();
    // Corrige aussi le contenu initial, sans attendre la première ouverture.
    window.setTimeout(refreshPopupWithAllVisibleLinks, 0);
    window.setTimeout(installPersonalBulkLayoutWatcher, 0);
  });
})();
