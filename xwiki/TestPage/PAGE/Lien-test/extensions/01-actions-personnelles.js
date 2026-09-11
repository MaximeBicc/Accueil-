var rowToDelete = null;

function toggleEditMode(button, isEnteringEdit) {
  var row = button.closest('.main-term-row');
  var table = button.closest('#mainGlossaryTable');

  var viewElements = row.querySelectorAll('.view-mode, .view-buttons');
  var editElements = row.querySelectorAll('.edit-mode, .edit-buttons');

  if (isEnteringEdit) {
    // 1. Afficher la colonne Type pour tout le monde en modifiant le CSS de la table
    table.classList.remove('hide-type-column');

    // 2. Basculer la ligne actuelle en mode édition
    viewElements.forEach(el => el.style.display = 'none');
    row.querySelectorAll('.edit-mode').forEach(el => el.style.display = 'block');
    row.querySelector('.edit-buttons').style.display = 'flex';

  } else {
    // 1. Masquer à nouveau la colonne Type pour tout le monde
    table.classList.add('hide-type-column');

    // 2. Annulation : Remise des valeurs d'origine pour la ligne concernée
    row.querySelector('.edit-acronym').value = row.querySelector('.main-acronym .view-mode').textContent.trim();
    row.querySelector('.edit-label').value = row.querySelector('.main-label .view-mode').textContent.trim();
    row.querySelector('.edit-definition').value = row.querySelector('.main-definition .view-mode').textContent.trim();
    if(row.querySelector('.edit-type-input')) {
      row.querySelector('.edit-type-input').value = row.querySelector('.main-type .view-mode').textContent.trim();
    }

    // 3. Masquer le mode édition et réafficher la vue normale de la ligne
    editElements.forEach(el => el.style.display = 'none');
    row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
    row.querySelector('.view-buttons').style.display = 'block';
  }
}


// 1. ENVOI DU POST POUR SAUVEGARDE (VIA FETCH)
async function saveRowEdition(button) {
  var row = button.closest('.main-term-row');
  var table = document.getElementById('mainGlossaryTable');

  var fullRef = row.getAttribute('data-full-ref');
  var className = table.getAttribute('data-class-path');
  var csrfToken = table.getAttribute('data-csrf');

  var acronym = row.querySelector('.edit-acronym').value;
  var label = row.querySelector('.edit-label').value;
  var definition = row.querySelector('.edit-definition').value;
  var type = row.querySelector('.edit-type-input').value;

  const donnees = new FormData();
  donnees.append("action", "save");
  donnees.append("targetRef", fullRef);
  donnees.append("form_token", csrfToken);
  donnees.append("className", className);
  donnees.append("acronym", acronym);
  donnees.append("label", label);
  donnees.append("definition", definition);
  donnees.append("type", type);

  try {
    const reponse = await fetch(urlLienData + "?xpage=plain", {
      method: "POST",
      body: donnees,
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    const resultat = await reponse.text();

    if (resultat.includes("GLOSSAIRE_OK")) {
      row.querySelector('.main-acronym .view-mode').innerHTML = '<strong>' + acronym + '</strong>';
      row.querySelector('.main-label .view-mode').textContent = label;
      row.querySelector('.main-definition .view-mode').textContent = definition;
      row.querySelector('.main-type .view-mode').textContent = type;
      row.setAttribute('data-acronym', acronym.toUpperCase());

      var table = document.getElementById('mainGlossaryTable');
      table.classList.add('hide-type-column');

      row.querySelectorAll('.edit-mode, .edit-buttons').forEach(el => el.style.display = 'none');
      row.querySelectorAll('.view-mode').forEach(el => el.style.display = 'block');
      row.querySelector('.view-buttons').style.display = 'block';

      if (typeof applyPagination === "function") {
        applyPagination();
      }
    } else {
      alert("Erreur serveur : " + resultat.trim());
    }
  } catch (erreur) {
    console.error(erreur);
    alert("Impossible de joindre la page DATA : " + erreur);
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

// 2. ENVOI DU POST POUR SUPPRESSION (VIA FETCH)
async function executeRowDelete() {
  if (!rowToDelete) return;

  var table = document.getElementById('mainGlossaryTable');
  var fullRef = rowToDelete.getAttribute('data-full-ref');
  var csrfToken = table.getAttribute('data-csrf');

  const donnees = new FormData();
  donnees.append("action", "delete");
  donnees.append("targetRef", fullRef);
  donnees.append("form_token", csrfToken);

  try {
    const reponse = await fetch(urlLienData + "?xpage=plain", {
      method: "POST",
      body: donnees,
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    const resultat = await reponse.text();

    if (resultat.includes("GLOSSAIRE_OK")) {
      jQuery('#deleteConfirmModal').modal('hide');

      // --- AJOUT : Suppression dans le tableau de la modal ---
      var modalRow = document.querySelector('#popupCheckTable tr[data-full-ref="' + fullRef + '"]');
      if (modalRow) {
        modalRow.remove();
      }
      // -------------------------------------------------------

      rowToDelete.remove();
      rowToDelete = null;

      // Recalculer la pagination après suppression
      if (typeof applyPagination === "function") {
        applyPagination();
      }
    } else {
      alert("Erreur de suppression serveur : " + resultat.trim());
      jQuery('#deleteConfirmModal').modal('hide');
    }
  } catch (erreur) {
    console.error(erreur);
    alert("Erreur réseau lors de la suppression : " + erreur);
    jQuery('#deleteConfirmModal').modal('hide');
  }
}
