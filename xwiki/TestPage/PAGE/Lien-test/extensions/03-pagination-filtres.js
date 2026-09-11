// --- NOUVELLES FONCTIONS DE GESTION DE LA PAGINATION ---

function applyPagination() {
  var selectValue = document.getElementById('pageSizeSelect1').value;
  var rows = document.querySelectorAll('#mainGlossaryTable tbody .main-term-row');

  // Étape A : Isoler uniquement les lignes qui passent les filtres actifs
  var visibleRows = Array.from(rows).filter(function(row) {
    // Si aucun filtrage n'a encore été lancé, dataset.filteredMatch n'existe pas, on considère true
    return row.dataset.filteredMatch !== "false";
  });

  // Si "Tout afficher" est sélectionné
  if (selectValue === 'all') {
    visibleRows.forEach(function(row) { row.style.display = ""; });
    // Masquer ou désactiver les contrôles devenus inutiles
    document.getElementById('pageIndicator1').innerText = "Tout affiché";
    document.getElementById('btnPrevPage1').disabled = true;
    document.getElementById('btnNextPage1').disabled = true;
    return;
  }

  pageSize1 = parseInt(selectValue, 10);
  var totalRows = visibleRows.length;
  var totalPages = Math.ceil(totalRows / pageSize1) || 1;

  // Ajustement de sécurité de la page courante
  if (currentPage1 > totalPages) currentPage1 = totalPages;
  if (currentPage1 < 1) currentPage1 = 1;

  // Calcul des index de découpage
  var startIndex = (currentPage1 - 1) * pageSize1;
  var endIndex = startIndex + pageSize1;

  // Étape B : Cacher toutes les lignes de la table d'abord
  rows.forEach(function(row) { row.style.display = "none"; });

  // Étape C : Afficher uniquement les lignes de la page active parmi celles filtrées
  visibleRows.forEach(function(row, index) {
    if (index >= startIndex && index < endIndex) {
      row.style.display = "";
    }
  });

  // Étape D : Mise à jour de l'interface utilisateur
  document.getElementById('pageIndicator1').innerText = "Page " + currentPage1 + " / " + totalPages;
  document.getElementById('btnPrevPage1').disabled = (currentPage1 === 1);
  document.getElementById('btnNextPage1').disabled = (currentPage1 === totalPages);
}

function navigatePage(direction) {
  currentPage1 += direction;
  applyPagination();
}

function changePageSize() {
  currentPage1 = 1; // On revient à la première page lors d'un changement de taille
  applyPagination();
}


// --- PAGINATION DU SECOND TABLEAU ---

function applyPagination2() {
  var selectValue = document.getElementById('pageSizeSelect2').value;
  var rows = document.querySelectorAll('#secondaryGlossaryTable tbody .secondary-term-row');

  var visibleRows = Array.from(rows).filter(function(row) {
    return row.dataset.filteredMatch !== "false";
  });

  if (selectValue === 'all') {
    visibleRows.forEach(function(row) { row.style.display = ""; });
    document.getElementById('pageIndicator2').innerText = "Tout affiché";
    document.getElementById('btnPrevPage2').disabled = true;
    document.getElementById('btnNextPage2').disabled = true;
    return;
  }

  pageSize2 = parseInt(selectValue, 10);
  var totalRows = visibleRows.length;
  var totalPages = Math.ceil(totalRows / pageSize2) || 1;

  if (currentPage2 > totalPages) currentPage2 = totalPages;
  if (currentPage2 < 1) currentPage2 = 1;

  var startIndex = (currentPage2 - 1) * pageSize2;
  var endIndex = startIndex + pageSize2;

  rows.forEach(function(row) { row.style.display = "none"; });

  visibleRows.forEach(function(row, index) {
    if (index >= startIndex && index < endIndex) {
      row.style.display = "";
    }
  });

  document.getElementById('pageIndicator2').innerText = "Page " + currentPage2 + " / " + totalPages;
  document.getElementById('btnPrevPage2').disabled = (currentPage2 === 1);
  document.getElementById('btnNextPage2').disabled = (currentPage2 === totalPages);
}

function navigatePage2(direction) {
  currentPage2 += direction;
  applyPagination2();
}

function changePageSize2() {
  currentPage2 = 1;
  applyPagination2();
}


// Variables globales pour piloter la pagination
var currentPage1 = 1;
var currentPage2 = 1;

var pageSize1 = 10;
var pageSize2 = 10;

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", function() {
  applyPagination();
  applyPagination2();
});


// 1. MODIFICATION : Filtrage croisé par colonne en temps réel (Logique ET)
function filterMainTableColumns() {
  var acronymVal = document.getElementById('filterAcronym').value.toUpperCase();
  var labelVal = document.getElementById('filterLabel').value.toUpperCase();
  var definitionVal = document.getElementById('filterDefinition').value.toUpperCase();

  var rows = document.querySelectorAll('#mainGlossaryTable tbody .main-term-row');

  rows.forEach(function(row) {
    var acronymCell = row.querySelector('.main-acronym');
    var labelCell = row.querySelector('.main-label');
    var definitionCell = row.querySelector('.main-definition');

    if (acronymCell && labelCell && definitionCell) {
      var acronymText = (acronymCell.textContent || acronymCell.innerText).toUpperCase();
      var labelText = (labelCell.textContent || labelCell.innerText).toUpperCase();
      var definitionText = (definitionCell.textContent || definitionCell.innerText).toUpperCase();

      var matchAcronym = (acronymVal === '' || acronymText.indexOf(acronymVal) > -1);
      var matchLabel = (labelVal === '' || labelText.indexOf(labelVal) > -1);
      var matchDefinition = (definitionVal === '' || definitionText.indexOf(definitionVal) > -1);

      if (matchAcronym && matchLabel && matchDefinition) {
        // On marque temporairement la ligne comme "valide selon le filtre" via un dataset
        row.dataset.filteredMatch = "true";
      } else {
        row.dataset.filteredMatch = "false";
      }
    }
  });

  // Reset à la première page après un filtrage et application de la pagination visuelle
  currentPage1 = 1;
  applyPagination();
}


// 2. Réinitialisation des inputs lors de l'usage du filtre A-Z général
function filterMainTableAZ(letter) {
  document.getElementById('filterAcronym').value = '';
  document.getElementById('filterLabel').value = '';
  document.getElementById('filterDefinition').value = '';

  var rows = document.querySelectorAll('#mainGlossaryTable tbody .main-term-row');
  var targetLetter = letter.toUpperCase();

  rows.forEach(function(row) {
    var acronymAttr = row.getAttribute('data-acronym') || '';

    if (targetLetter === '' || acronymAttr.startsWith(targetLetter)) {
      row.dataset.filteredMatch = "true";
    } else {
      row.dataset.filteredMatch = "false";
    }
  });

  currentPage1 = 1;
  currentPage2 = 1;
  applyPagination();
  applyPagination2();
}


// --- FILTRAGE DU SECOND TABLEAU ---

function filterSecondaryTableColumns() {
  var acronymVal = document.getElementById('filterAcronym2').value.toUpperCase();
  var labelVal = document.getElementById('filterLabel2').value.toUpperCase();
  var definitionVal = document.getElementById('filterDefinition2').value.toUpperCase();
  var proprietaireVal = document.getElementById('filterProprietaire2').value.toUpperCase();

  var rows = document.querySelectorAll('#secondaryGlossaryTable tbody .secondary-term-row');

  rows.forEach(function(row) {
    var acronymCell = row.querySelector('.secondary-acronym');
    var labelCell = row.querySelector('.secondary-label');
    var definitionCell = row.querySelector('.secondary-definition');
    var proprietaireCell = row.querySelector('.secondary-proprietaire');

    if (acronymCell && labelCell && definitionCell && proprietaireCell) {
      var acronymText = (acronymCell.textContent || acronymCell.innerText).toUpperCase();
      var labelText = (labelCell.textContent || labelCell.innerText).toUpperCase();
      var definitionText = (definitionCell.textContent || definitionCell.innerText).toUpperCase();
      var proprietaireText = (proprietaireCell.textContent || proprietaireCell.innerText).toUpperCase();

      var matchAcronym = (acronymVal === '' || acronymText.indexOf(acronymVal) > -1);
      var matchLabel = (labelVal === '' || labelText.indexOf(labelVal) > -1);
      var matchDefinition = (definitionVal === '' || definitionText.indexOf(definitionVal) > -1);
      var matchProprietaire = (proprietaireVal === '' || proprietaireText.indexOf(proprietaireVal) > -1);

      if (matchAcronym && matchLabel && matchDefinition && matchProprietaire) {
        row.dataset.filteredMatch = "true";
      } else {
        row.dataset.filteredMatch = "false";
      }
    }
  });

  currentPage2 = 1;
  applyPagination2();
}

function filterSecondaryTableAZ(letter) {
  document.getElementById('filterAcronym2').value = '';
  document.getElementById('filterLabel2').value = '';
  document.getElementById('filterDefinition2').value = '';
  document.getElementById('filterProprietaire2').value = '';

  var rows = document.querySelectorAll('#secondaryGlossaryTable tbody .secondary-term-row');
  var targetLetter = letter.toUpperCase();

  rows.forEach(function(row) {
    var acronymAttr = row.getAttribute('data-acronym') || '';

    if (targetLetter === '' || acronymAttr.startsWith(targetLetter)) {
      row.dataset.filteredMatch = "true";
    } else {
      row.dataset.filteredMatch = "false";
    }
  });

  currentPage2 = 1;
  applyPagination2();
}
