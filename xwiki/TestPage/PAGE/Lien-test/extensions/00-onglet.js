function openTab(evt, tabName) {
  var root = document.querySelector('.liens-page');
  var tab = document.getElementById(tabName);
  if (!root || !tab) return;
  root.querySelectorAll('.tabcontent').forEach(function (content) {
    content.style.display = content === tab ? 'block' : 'none';
  });
  root.querySelectorAll('.tablinks').forEach(function (button) {
    var active = button.dataset.liensTab === tabName || (evt && evt.currentTarget === button);
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}
(function () {
  function initialize() {
    var buttons = document.querySelectorAll('.liens-page .tablinks');
    buttons.forEach(function (button, index) {
      if (button.dataset.tabReady === 'true') return;
      button.dataset.tabReady = 'true';
      button.dataset.liensTab = button.dataset.liensTab || 'Tab' + (index + 1);
      button.removeAttribute('onclick');
      button.addEventListener('click', function (event) { openTab(event, button.dataset.liensTab); });
    });
    if (buttons.length) openTab({ currentTarget: buttons[0] }, buttons[0].dataset.liensTab);
    if (typeof require === 'function') {
      require(['jquery', 'uicomponents/widgets/select2/select2'], function ($) {
        if ($('#monSelectRecherche').length) $('#monSelectRecherche').select2({ placeholder: 'Tapez pour filtrer...', allowClear: true, width: 'resolve' });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
