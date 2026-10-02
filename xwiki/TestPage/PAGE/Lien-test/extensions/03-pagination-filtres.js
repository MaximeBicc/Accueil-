// Une seule source de vérité pour les filtres et la pagination des deux onglets.
var currentPage1 = 1;
var currentPage2 = 1;
var pageSize1 = 10;
var pageSize2 = 10;
var liensLetters = { 1: '', 2: '' };

function liensTableConfig(index) {
  return index === 1
    ? { id: 'mainGlossaryTable', row: 'main-term-row', prefix: 'main-', fields: ['Acronym', 'Label', 'Definition'] }
    : { id: 'secondaryGlossaryTable', row: 'secondary-term-row', prefix: 'secondary-', fields: ['Acronym', 'Label', 'Definition', 'Proprietaire'] };
}

function liensNormalizeFilter(text) {
  return String(text || '').trim().toLocaleUpperCase('fr');
}

function liensRefreshTable(index, resetPage) {
  var config = liensTableConfig(index);
  var table = document.getElementById(config.id);
  var select = document.getElementById('pageSizeSelect' + index);
  if (!table || !select) return;
  var suffix = index === 1 ? '' : '2';
  var filters = config.fields.map(function (field) {
    var input = document.getElementById('filter' + field + suffix);
    return liensNormalizeFilter(input ? input.value : '');
  });
  var columns = ['acronym', 'label', 'definition', 'proprietaire'];
  var rows = Array.from(table.querySelectorAll('tbody .' + config.row));
  var matches = rows.filter(function (row) {
    var match = filters.every(function (value, column) {
      // Les textarea et sélecteurs cachés ne font pas partie du texte affiché.
      var cell = row.querySelector('.' + config.prefix + columns[column] + ' .view-mode');
      return !value || liensNormalizeFilter(cell ? cell.textContent : '').indexOf(value) !== -1;
    });
    var acronym = row.querySelector('.' + config.prefix + 'acronym .view-mode');
    match = match && (!liensLetters[index] || liensNormalizeFilter(acronym ? acronym.textContent : '').startsWith(liensLetters[index]));
    row.dataset.filteredMatch = match ? 'true' : 'false';
    // Masquer aussi les non-correspondances en mode « Tout afficher ».
    row.style.display = 'none';
    return match;
  });
  var all = select.value === 'all';
  var size = Math.max(1, parseInt(select.value, 10) || 10);
  var pages = all ? 1 : Math.max(1, Math.ceil(matches.length / size));
  var page = resetPage ? 1 : (index === 1 ? currentPage1 : currentPage2);
  page = Math.min(pages, Math.max(1, page));
  if (index === 1) { currentPage1 = page; pageSize1 = size; }
  else { currentPage2 = page; pageSize2 = size; }
  matches.forEach(function (row, position) {
    if (all || (position >= (page - 1) * size && position < page * size)) row.style.display = '';
  });
  var indicator = document.getElementById('pageIndicator' + index);
  var previous = document.getElementById('btnPrevPage' + index);
  var next = document.getElementById('btnNextPage' + index);
  if (indicator) indicator.textContent = all ? 'Tout affiché (' + matches.length + ')' : 'Page ' + page + ' / ' + pages;
  if (previous) previous.disabled = all || page === 1;
  if (next) next.disabled = all || page === pages;
}

function applyPagination() { liensRefreshTable(1, false); }
function applyPagination2() { liensRefreshTable(2, false); }
function navigatePage(direction) { currentPage1 += direction; applyPagination(); }
function navigatePage2(direction) { currentPage2 += direction; applyPagination2(); }
function changePageSize() { liensRefreshTable(1, true); }
function changePageSize2() { liensRefreshTable(2, true); }
function filterMainTableColumns() { liensLetters[1] = ''; liensRefreshTable(1, true); }
function filterSecondaryTableColumns() { liensLetters[2] = ''; liensRefreshTable(2, true); }

function liensFilterAZ(index, letter) {
  var config = liensTableConfig(index);
  config.fields.forEach(function (field) {
    var input = document.getElementById('filter' + field + (index === 1 ? '' : '2'));
    if (input) input.value = '';
  });
  liensLetters[index] = liensNormalizeFilter(letter);
  liensRefreshTable(index, true);
}
function filterMainTableAZ(letter) { liensFilterAZ(1, letter); }
function filterSecondaryTableAZ(letter) { liensFilterAZ(2, letter); }

(function () {
  function initialize() {
    [1, 2].forEach(function (index) {
      var config = liensTableConfig(index);
      var table = document.getElementById(config.id);
      if (!table || table.dataset.paginationReady === 'true') return;
      table.dataset.paginationReady = 'true';
      config.fields.forEach(function (field) {
        var input = document.getElementById('filter' + field + (index === 1 ? '' : '2'));
        if (!input) return;
        input.removeAttribute('oninput');
        input.addEventListener('input', function () {
          if (index === 1) filterMainTableColumns(); else filterSecondaryTableColumns();
        });
      });
      var select = document.getElementById('pageSizeSelect' + index);
      if (select) {
        select.removeAttribute('onchange');
        select.addEventListener('change', function () { liensRefreshTable(index, true); });
      }
      ['Prev', 'Next'].forEach(function (direction) {
        var button = document.getElementById('btn' + direction + 'Page' + index);
        if (!button) return;
        button.removeAttribute('onclick');
        button.addEventListener('click', function () {
          var delta = direction === 'Prev' ? -1 : 1;
          if (index === 1) navigatePage(delta); else navigatePage2(delta);
        });
      });
      liensRefreshTable(index, false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
