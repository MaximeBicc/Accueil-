// Corrections ciblées sur l'adaptation Glossaire -> Liens.
// 1) conserve TOUS les marqueurs LIEN_ROW même si XWiki les concatène sur une seule ligne ;
// 2) recharge la liste de vérification avec communs + personnels du user courant ;
// 3) réactive le sélecteur XWiki/Selectize du créateur dans l'onglet commun ;
// 4) reconnecte le filtre Acronyme / Libellé sans modifier le contenu de la liste.
(function () {
  'use strict';

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

  function runExistingPopupFilter() {
    if (typeof window.triggerGlobalFilter === 'function') {
      window.triggerGlobalFilter();
    }
  }

  function installPopupFilterListeners() {
    var acronymField = document.getElementById('liensNomInputField');
    var labelField = document.getElementById('liensInputField');

    [acronymField, labelField].forEach(function (field) {
      if (!field || field.getAttribute('data-liens-filter-bound') === 'true') return;
      field.setAttribute('data-liens-filter-bound', 'true');
      field.addEventListener('input', runExistingPopupFilter);
      field.addEventListener('keyup', runExistingPopupFilter);
      field.addEventListener('change', runExistingPopupFilter);
    });
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

      // On ne touche pas à la liste : on réapplique simplement le filtre courant.
      installPopupFilterListeners();
      runExistingPopupFilter();
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

  function installModalRefresh() {
    if (!window.jQuery) return;
    window.jQuery('#glossaryModal').off('shown.bs.modal.liensAllRows').on('shown.bs.modal.liensAllRows', function () {
      refreshPopupWithAllVisibleLinks();
      installPopupFilterListeners();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    installModalRefresh();
    installPopupFilterListeners();
    // Corrige aussi le contenu initial, sans attendre la première ouverture.
    window.setTimeout(refreshPopupWithAllVisibleLinks, 0);
  });
})();
