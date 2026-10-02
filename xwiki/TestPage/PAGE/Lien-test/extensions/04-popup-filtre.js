// 3. Gestionnaire d'analyse pour l'affichage de la popup d'action générée par vos boutons
function openActionModal(title, text) {
  document.getElementById('feedbackModalTitle').innerText = title;
  document.getElementById('feedbackModalBodyText').innerText = text;
  jQuery('#actionFeedbackModal').modal('show');
}

// 4. Gestionnaire d'analyse de la saisie avec logique OU croisée (Pour la création de la popup droite)
function triggerGlobalFilter() {
  var acronymField = document.getElementById('liensNomInputField');
  var libelleField = document.getElementById('liensInputField');

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
      var matchAcronym = false; var matchLibelle = false;
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

// Le protocole encode chaque champ : les retours à la ligne, | et balises sont conservés.
function parseLiensVisibleResponse(text) {
  var plain = String(text || '').replace(/<[^>]+>/g, '');
  var chunks = plain.split(/LIEN_ROW\||LIEN_LIST_OK\|/);
  var markers = plain.match(/LIEN_ROW\||LIEN_LIST_OK\|/g) || [];
  var state = null;
  var rows = [];
  markers.forEach(function (marker, index) {
    var fields = chunks[index + 1].trim().split('|').map(function (field) {
      return decodeURIComponent(field.replace(/\+/g, ' '));
    });
    if (marker === 'LIEN_LIST_OK|') state = { userId: fields[0], isManager: fields[1] === 'true' };
    else if (fields.length >= 6) rows.push({ ref: fields[0], acronym: fields[1], label: fields[2], definition: fields[3], type: fields[4], owner: fields[5] });
  });
  if (!state) throw new Error('Réponse listVisible invalide');
  return { state: state, rows: rows.filter(function (row) {
    return row.type === 'commun' || (row.type === 'personnel' && row.owner === state.userId);
  }) };
}
(function () {
  function initialize() {
    ['liensNomInputField', 'liensInputField'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || input.dataset.filterReady === 'true') return;
      input.dataset.filterReady = 'true';
      input.removeAttribute('oninput');
      input.addEventListener('input', triggerGlobalFilter);
    });
    triggerGlobalFilter();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
