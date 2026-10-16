// Conserver le diagnostic du serveur au lieu de masquer sa réponse derrière le statut HTTP.
function liensErrorMessage(result, status) {
  var text = String(result || '').trim();
  var known = {
    ERREUR_CSRF: 'Le jeton de sécurité est invalide ou la session a expiré. Rechargez la page puis réessayez.',
    ERREUR_DROITS: 'Votre compte ne dispose pas des droits nécessaires pour cette action.',
    ERREUR_AUTEUR: 'Cet auteur n’existe plus. Choisissez un compte XWiki existant puis réessayez.',
    ERREUR_AUTEUR_DROITS: 'Cet auteur ne fait pas partie d’un groupe autorisé à écrire dans Commun. Choisissez un auteur dans la liste.',
    ERREUR_METHOD: 'Le serveur attend une requête POST.',
    ERREUR_ACTION_INCONNUE: 'La page DATA ne reconnaît pas cette action. Vérifiez que les sources de la page et des extensions ont été mises à jour ensemble.'
  };
  var detail = Object.prototype.hasOwnProperty.call(known, text) ? known[text] : '';
  if (!detail && text.indexOf('LIENS_ERROR|') === 0) {
    try { detail = decodeURIComponent(text.substring(12).replace(/\+/g, ' ')); }
    catch (error) { detail = text.substring(12); }
  }
  if (!detail && /^[{[]/.test(text)) {
    try {
      var parsed = JSON.parse(text);
      if (typeof parsed.message === 'string') detail = parsed.message;
      else if (typeof parsed.error === 'string') detail = parsed.error;
    } catch (error) {}
  }
  if (!detail && text) {
    var html = new DOMParser().parseFromString(text, 'text/html');
    html.querySelectorAll('script, style, noscript, template').forEach(function (element) { element.remove(); });
    var message = html.querySelector('.xwikierrormessage, .errormessage, .error-message, .alert-danger') || html.body;
    detail = message ? message.textContent : text;
  }
  detail = String(detail || '').replace(/\s+/g, ' ').trim();
  if (detail.length > 600) detail = detail.substring(0, 600) + '…';
  return (status ? 'HTTP ' + status + (detail ? ' : ' : '') : '') + (detail || 'Le serveur a rejeté la requête. Rechargez la page puis réessayez.');
}

async function liensReadResponse(response) {
  var result = await response.text();
  if (!response.ok) throw new Error(liensErrorMessage(result, response.status));
  return result;
}

// Source commune à l'import et à l'éditeur : membres des groupes d'écriture Commun.
function liensReadAuthorCatalog() {
  var catalog = document.getElementById('liensAuthorOptions');
  if (!catalog || catalog.getAttribute('data-author-source') !== 'common-write-groups') return [];
  return Array.from((catalog.content || catalog).querySelectorAll('option')).map(function (option) {
    return { id: option.value, label: option.dataset.label || option.textContent,
      reverseLabel: option.dataset.reverseLabel || '', reference: option.dataset.reference || '' };
  });
}

async function liensLoadAuthorCatalog() {
  try {
    var root = document.querySelector('.liens-page');
    var endpoint = new URL(root.getAttribute('data-endpoint-url'), window.location.href);
    endpoint.searchParams.set('xpage', 'plain');
    var data = new URLSearchParams({ action: 'listAuthors', form_token: root.getAttribute('data-csrf') || '' });
    var response = await fetch(endpoint.href, { method: 'POST', body: data, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    var result = await liensReadResponse(response);
    var lines = result.trim().split(/\r?\n/).filter(function (line) { return line.trim(); });
    if (lines.pop() !== 'LIENS_AUTHORS_OK') throw new Error('Liste des auteurs indisponible.');
    var authors = lines.map(function (line) {
      var parts = line.split('|');
      if (parts.length !== 5 || parts[0] !== 'LIEN_AUTHOR') throw new Error('Liste des auteurs incomplète.');
      var values = parts.slice(1).map(function (value) { return decodeURIComponent(value.replace(/\+/g, ' ')); });
      return { id: values[0], label: values[1], reverseLabel: values[2], reference: values[3] };
    });
    authors.sort(function (a, b) { return a.id.localeCompare(b.id, 'fr'); });
    return authors;
  } catch (error) {
    // Un échec du service ne doit jamais empêcher l'ouverture de l'aperçu.
    return liensReadAuthorCatalog();
  }
}

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
    const resultat = await liensReadResponse(reponse);

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
    alert('Enregistrement impossible : ' + erreur.message);
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
    const resultat = await liensReadResponse(reponse);
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
    alert('Suppression impossible : ' + erreur.message);
    jQuery('#deleteConfirmModal').modal('hide');
  } finally {
    deletingRow.dataset.deleting = 'false';
  }
}
