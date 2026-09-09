(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function initManager(root) {
    var form = root.querySelector('[data-contact-manager-form]');
    if (!form) return;

    var zones = {};
    root.querySelectorAll('[data-contact-zone]').forEach(function (zone) {
      zones[zone.getAttribute('data-contact-zone')] = zone;
    });

    var finalInputs = form.querySelector('[data-final-contacts-inputs]');
    var saveButton = form.querySelector('[data-save-contacts]');
    var cancelButton = form.querySelector('[data-cancel-contact-changes]');
    var changeCount = form.querySelector('[data-change-count]');
    var managerSearch = form.querySelector('[data-manager-search]');

    function getCards(zoneName) {
      var zone = zones[zoneName];
      if (!zone) return [];
      return Array.prototype.slice.call(zone.querySelectorAll('[data-member-card]'));
    }

    function configureCard(card, zoneName) {
      var button = card.querySelector('[data-move-contact]');
      if (!button) return;

      button.classList.remove('is-add', 'is-remove', 'is-cancel', 'is-restore');

      if (zoneName === 'available') {
        button.textContent = 'Ajouter';
        button.classList.add('is-add');
        button.setAttribute('aria-label', 'Ajouter ce membre aux contacts');
      } else if (zoneName === 'current') {
        button.textContent = 'Retirer';
        button.classList.add('is-remove');
        button.setAttribute('aria-label', 'Retirer ce contact');
      } else if (zoneName === 'pending-add') {
        button.textContent = 'Annuler';
        button.classList.add('is-cancel');
        button.setAttribute('aria-label', 'Annuler cet ajout');
      } else if (zoneName === 'pending-remove') {
        button.textContent = 'Restaurer';
        button.classList.add('is-restore');
        button.setAttribute('aria-label', 'Restaurer ce contact');
      }
    }

    function moveCard(card, targetZoneName) {
      var zone = zones[targetZoneName];
      if (!zone) return;
      zone.appendChild(card);
      configureCard(card, targetZoneName);
      refresh();
    }

    function currentZoneName(card) {
      var zone = card.closest('[data-contact-zone]');
      return zone ? zone.getAttribute('data-contact-zone') : '';
    }

    function handleMove(card) {
      var zoneName = currentZoneName(card);

      if (zoneName === 'available') {
        moveCard(card, 'pending-add');
      } else if (zoneName === 'current') {
        moveCard(card, 'pending-remove');
      } else if (zoneName === 'pending-add') {
        moveCard(card, 'available');
      } else if (zoneName === 'pending-remove') {
        moveCard(card, 'current');
      }
    }

    form.addEventListener('click', function (event) {
      var button = event.target.closest('[data-move-contact]');
      if (!button || !form.contains(button)) return;

      var card = button.closest('[data-member-card]');
      if (!card) return;
      handleMove(card);
    });

    function setCount(zoneName) {
      var badge = form.querySelector('[data-zone-count="' + zoneName + '"]');
      var zone = zones[zoneName];
      if (!zone) return;

      var cards = getCards(zoneName);
      if (badge) badge.textContent = String(cards.length);

      var empty = zone.querySelector('[data-zone-empty]');
      if (empty) empty.hidden = cards.length > 0;
    }

    function rebuildFinalInputs() {
      if (!finalInputs) return;
      finalInputs.textContent = '';

      var finalCards = getCards('current').concat(getCards('pending-add'));
      finalCards.forEach(function (card) {
        var ref = card.getAttribute('data-contact-ref');
        if (!ref) return;

        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'contact';
        input.value = ref;
        finalInputs.appendChild(input);
      });
    }

    function refreshChangeSummary() {
      var changes = getCards('pending-add').length + getCards('pending-remove').length;
      if (changeCount) {
        changeCount.textContent = changes + (changes > 1 ? ' modifications' : ' modification');
      }
      if (saveButton) saveButton.disabled = changes === 0;
    }

    function applySearch() {
      if (!managerSearch) return;
      var query = managerSearch.value.trim().toLocaleLowerCase();

      form.querySelectorAll('[data-member-card]').forEach(function (card) {
        var haystack = (card.getAttribute('data-search-text') || '').toLocaleLowerCase();
        card.hidden = !!query && haystack.indexOf(query) === -1;
      });
    }

    function refresh() {
      Object.keys(zones).forEach(function (zoneName) {
        getCards(zoneName).forEach(function (card) {
          configureCard(card, zoneName);
        });
        setCount(zoneName);
      });
      rebuildFinalInputs();
      refreshChangeSummary();
      applySearch();
    }

    if (managerSearch) {
      managerSearch.addEventListener('input', applySearch);
    }

    if (cancelButton) {
      cancelButton.addEventListener('click', function () {
        form.querySelectorAll('[data-member-card]').forEach(function (card) {
          var initialContact = card.getAttribute('data-initial-contact') === 'true';
          moveCard(card, initialContact ? 'current' : 'available');
        });
        refresh();
      });
    }

    form.addEventListener('submit', function () {
      rebuildFinalInputs();
      if (saveButton) saveButton.disabled = true;
    });

    refresh();
  }

  ready(function () {
    document.querySelectorAll('.contacts-page').forEach(initManager);
  });
}());
