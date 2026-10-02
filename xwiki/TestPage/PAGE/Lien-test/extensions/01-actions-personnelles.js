function liensPopupRow(ref) {
  return Array.from(document.querySelectorAll('#popupCheckTable .term-row')).find(function (row) {
    return row.getAttribute('data-full-ref') === ref;
  });
}
function liensResult(text) {
  var line = String(text || '').replace(/<[^>]+>/g, '').trim();
  if (!/^GLOSSAIRE_OK(?:\||$)/.test(line)) return null;
  return line.split('|').map(function (value) { return decodeURIComponent(value.replace(/\+/g, ' ')); });
}
function liensSyncTypeColumn(table) {
  var editing = Array.from(table.querySelectorAll('.edit-buttons')).some(function (buttons) { return buttons.style.display !== 'none'; });
  table.classList.toggle('hide-type-column', !editing);
}
var rowToDelete = null;

function toggleEditMode(button, isEnteringEdit) {
  var row = button.closest('.main-term-row');
  var table = button.closest('#mainGlossaryTable');

  var viewElements = row.querySelectorAll('.view-mode, .view-buttons');
  var editElements = row.querySelectorAll('.edit-mode, .edit-buttons');

  if (isEnteringEdit) {
    table.classList.remove('hide-type-column');
    viewElements.forEach(el => el.style.display = 'none');
    row.querySelectorAll('.edit-mode').forEach(el => el.style.display = 'block');
    row.querySelector('.edit-buttons').style.display = 'flex';
  } else {
    table.classList.add('hide-type-column');
    row.querySelector('.edit-acronym').value = row.querySelector('.main-acronym .view-mode').textContent.trim();
    row.querySelector('.edit-label').value = row.querySelector('.main-label .view-mode').textContent.trim();
    row.querySelector('.edit-definition').value = row.querySelector('.main-definition .view-mode').textContent.trim();
    if(row.querySelector('.edit-type-input')) {
      row.querySelector('.edit-type-input').value = row.querySelector('.main-type .view-mode').textContent.trim();
    }
    editElements.forEach(el => el.style.display = 'none');
    row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
    row.querySelector('.view-buttons').style.display = 'block';
    liensSyncTypeColumn(table);
  }
}

async function saveRowEdition(button) {
  var row = button.closest('.main-term-row');
  if (row.dataset.saving === 'true') return;
  var table = document.getElementById('mainGlossaryTable');
  var fullRef = row.getAttribute('data-full-ref');
  var className = table.getAttribute('data-class-path');
  var csrfToken = table.getAttribute('data-csrf');
  var acronym = row.querySelector('.edit-acronym').value;
  var label = row.querySelector('.edit-label').value;
  var definition = row.querySelector('.edit-definition').value;
  var type = row.querySelector('.edit-type-input').value;
  // Une ligne de "Mes Liens" appartient forcément à l'utilisateur courant.
  // Si elle passe de Personnel à Commun, il reste donc son créateur.
  var proprietaire = table.getAttribute('data-current-user') || '';

  row.dataset.saving = 'true';
  button.disabled = true;
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
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
    const resultat = await reponse.text();

    var parts = liensResult(resultat);
    if (parts) {
      var updatedRef = parts[1] || fullRef;
      var updatedDocName = parts[2] || row.getAttribute('data-doc-name');

      row.querySelector('.main-acronym .view-mode').textContent = acronym;
      row.querySelector('.main-label .view-mode').textContent = label;
      row.querySelector('.main-definition .view-mode').textContent = definition;
      row.querySelector('.main-type .view-mode').textContent = type;
      row.setAttribute('data-acronym', acronym.toUpperCase());
      row.setAttribute('data-full-ref', updatedRef);
      row.setAttribute('data-doc-name', updatedDocName);

      var modalRow = liensPopupRow(fullRef);
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
      liensSyncTypeColumn(table);
      if (typeof triggerGlobalFilter === 'function') triggerGlobalFilter();
      if (typeof applyPagination === 'function') applyPagination();

      // Si un manager vient de passer un personnel en commun, le rechargement remet la ligne dans le bon onglet.
      if (type === 'commun') window.location.reload();
    } else {
      alert('Erreur serveur : ' + resultat.trim());
    }
  } catch (erreur) {
    console.error(erreur);
    alert('Impossible de joindre la page DATA : ' + erreur);
  } finally {
    row.dataset.saving = 'false';
    button.disabled = false;
  }
}

function openDeleteModal(button) {
  rowToDelete = button.closest('.main-term-row');
  var acronymText = rowToDelete.querySelector('.main-acronym .view-mode').textContent.trim();
  var labelText = rowToDelete.querySelector('.main-label .view-mode').textContent.trim();
  document.getElementById('deleteModalAcronym').innerText = acronymText;
  document.getElementById('deleteModalLabel').innerText = labelText;
  jQuery('#deleteConfirmModal').modal('show');
}

async function executeRowDelete() {
  if (!rowToDelete || rowToDelete.dataset.deleting === 'true') return;
  var deletingRow = rowToDelete;
  deletingRow.dataset.deleting = 'true';
  var table = document.getElementById('mainGlossaryTable');
  var fullRef = rowToDelete.getAttribute('data-full-ref');
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
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
    const resultat = await reponse.text();
    if (liensResult(resultat)) {
      jQuery('#deleteConfirmModal').modal('hide');
      var modalRow = liensPopupRow(fullRef);
      if (modalRow) modalRow.remove();
      deletingRow.remove();
      if (rowToDelete === deletingRow) rowToDelete = null;
      if (typeof applyPagination === 'function') applyPagination();
    } else {
      alert('Erreur de suppression serveur : ' + resultat.trim());
      jQuery('#deleteConfirmModal').modal('hide');
    }
  } catch (erreur) {
    console.error(erreur);
    alert('Erreur réseau lors de la suppression : ' + erreur);
    jQuery('#deleteConfirmModal').modal('hide');
  } finally {
    deletingRow.dataset.deleting = 'false';
  }
}
