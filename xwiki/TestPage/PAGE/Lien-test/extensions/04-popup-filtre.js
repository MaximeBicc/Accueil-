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
