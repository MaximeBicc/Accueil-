var rowToDelete2 = null;

function toggleEditMode2(button, isEnteringEdit) {
  var row = button.closest('.secondary-term-row');
  var table = button.closest('#secondaryGlossaryTable');
  var viewElements = row.querySelectorAll('.view-mode, .view-buttons');
  var editElements = row.querySelectorAll('.edit-mode, .edit-buttons');

  if (isEnteringEdit) {
    table.classList.remove('hide-type-column');
    viewElements.forEach(el => el.style.display = 'none');
    row.querySelectorAll('.edit-mode').forEach(el => el.style.display = 'block');
    row.querySelector('.edit-buttons').style.display = 'flex';
  } else {
    table.classList.add('hide-type-column');
    row.querySelector('.edit-acronym').value = row.querySelector('.secondary-acronym .view-mode').textContent.trim();
    row.querySelector('.edit-label').value = row.querySelector('.secondary-label .view-mode').textContent.trim();
    row.querySelector('.edit-definition').value = row.querySelector('.secondary-definition .view-mode').textContent.trim();
    if(row.querySelector('.edit-type-input')) {
      row.querySelector('.edit-type-input').value = row.querySelector('.secondary-type .view-mode').textContent.trim();
    }
    editElements.forEach(el => el.style.display = 'none');
    row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
    row.querySelector('.view-buttons').style.display = 'block';
  }
}

async function saveRowEdition2(button) {
  var row = button.closest('.secondary-term-row');
  var table = document.getElementById('secondaryGlossaryTable');
  var fullRef = row.getAttribute('data-full-ref');
  var className = table.getAttribute('data-class-path');
  var csrfToken = table.getAttribute('data-csrf');
  var acronym = row.querySelector('.edit-acronym').value;
  var label = row.querySelector('.edit-label').value;
  var definition = row.querySelector('.edit-definition').value;
  var proprietaireSelect = row.querySelector('.secondary-proprietaire-value');
  var proprietaire = proprietaireSelect ? proprietaireSelect.value : '';
  var type = row.querySelector('.edit-type-input').value;

  const donnees = new FormData();
  donnees.append('action', 'save');
  donnees.append('targetRef', fullRef);
  donnees.append('form_token', csrfToken);
  donnees.append('className', className);
  donnees.append('acronym', acronym);
  donnees.append('label', label);
  donnees.append('definition', definition);
  donnees.append('type', type);
  donnees.append('proprietaire', proprietaire);

  try {
    const reponse = await fetch(urlLienData + '?xpage=plain', {
      method: 'POST', body: donnees, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const resultat = await reponse.text();

    if (resultat.includes('GLOSSAIRE_OK')) {
      var line = resultat.split(/\r?\n/).find(function(x) { return x.indexOf('GLOSSAIRE_OK|') !== -1; }) || resultat;
      line = line.replace(/<[^>]+>/g, '').trim();
      if (line.indexOf('GLOSSAIRE_OK|') > 0) line = line.substring(line.indexOf('GLOSSAIRE_OK|'));
      var parts = line.split('|');
      var updatedRef = parts[1] || fullRef;
      var updatedDocName = parts[2] || row.getAttribute('data-doc-name');

      row.querySelector('.secondary-acronym .view-mode').innerHTML = '<strong>' + acronym + '</strong>';
      row.querySelector('.secondary-label .view-mode').textContent = label;
      row.querySelector('.secondary-definition .view-mode').textContent = definition;
      row.querySelector('.secondary-type .view-mode').textContent = type;
      if (proprietaireSelect && proprietaireSelect.options[proprietaireSelect.selectedIndex]) {
        row.querySelector('.secondary-proprietaire .view-mode').textContent = proprietaireSelect.options[proprietaireSelect.selectedIndex].textContent;
      }
      row.setAttribute('data-acronym', acronym.toUpperCase());
      row.setAttribute('data-full-ref', updatedRef);
      row.setAttribute('data-doc-name', updatedDocName);

      var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
      if (modalRow) {
        modalRow.setAttribute('data-full-ref', updatedRef);
        var ma = modalRow.querySelector('.term-acronym');
        var ml = modalRow.querySelector('.term-label');
        if (ma) ma.textContent = acronym;
        if (ml) ml.textContent = label;
      }

      table.classList.add('hide-type-column');
      row.querySelectorAll('.edit-mode, .edit-buttons').forEach(el => el.style.display = 'none');
      row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
      row.querySelector('.view-buttons').style.display = 'block';
      if (typeof applyPagination2 === 'function') applyPagination2();
    } else {
      alert('Erreur serveur : ' + resultat.trim());
    }
  } catch (erreur) {
    console.error(erreur);
    alert('Impossible de joindre la page DATA : ' + erreur);
  }
}

function openDeleteModal2(button) {
  rowToDelete2 = button.closest('.secondary-term-row');
  var acronymText = rowToDelete2.querySelector('.secondary-acronym .view-mode').textContent.trim();
  var labelText = rowToDelete2.querySelector('.secondary-label .view-mode').textContent.trim();
  document.getElementById('deleteModalAcronym2').innerText = acronymText;
  document.getElementById('deleteModalLabel2').innerText = labelText;
  jQuery('#deleteConfirmModal2').modal('show');
}

async function executeRowDelete2() {
  if (!rowToDelete2) return;
  var table = document.getElementById('secondaryGlossaryTable');
  var fullRef = rowToDelete2.getAttribute('data-full-ref');
  var csrfToken = table.getAttribute('data-csrf');
  const donnees = new FormData();
  donnees.append('action', 'delete');
  donnees.append('targetRef', fullRef);
  donnees.append('form_token', csrfToken);

  try {
    const reponse = await fetch(urlLienData + '?xpage=plain', {
      method: 'POST', body: donnees, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const resultat = await reponse.text();
    if (resultat.includes('GLOSSAIRE_OK')) {
      jQuery('#deleteConfirmModal2').modal('hide');
      var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
      if (modalRow) modalRow.remove();
      rowToDelete2.remove(); rowToDelete2 = null;
      if (typeof applyPagination2 === 'function') applyPagination2();
    } else {
      alert('Erreur de suppression serveur : ' + resultat.trim());
      jQuery('#deleteConfirmModal2').modal('hide');
    }
  } catch (erreur) {
    console.error(erreur);
    alert('Erreur réseau lors de la suppression : ' + erreur);
    jQuery('#deleteConfirmModal2').modal('hide');
  }
}
