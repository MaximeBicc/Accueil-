(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function initContact(root) {
    var modal = root.querySelector('[data-contact-modal]');
    var openButton = root.querySelector('[data-open-contact]');
    var closeButtons = root.querySelectorAll('[data-close-contact]');
    var firstField = root.querySelector('#nh-sender-name');
    var toast = root.querySelector('[data-toast]');
    var lastFocused = null;

    if (!modal || !openButton) return;

    function openModal() {
      lastFocused = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (firstField) {
        window.setTimeout(function () { firstField.focus(); }, 0);
      }
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
    }

    openButton.addEventListener('click', openModal);
    closeButtons.forEach(function (button) {
      button.addEventListener('click', closeModal);
    });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    var contactStatus = root.getAttribute('data-contact-status');
    var contactMessage = root.getAttribute('data-contact-message');

    if (toast && contactStatus && contactMessage) {
      toast.textContent = contactMessage;
      toast.classList.add('is-visible');

      if (contactStatus === 'error') {
        toast.classList.add('is-error');
        openModal();
      }

      window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 6000);
    }
  }

  ready(function () {
    document.querySelectorAll('.naval-home').forEach(initContact);
  });
}());