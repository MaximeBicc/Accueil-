(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  ready(function () {
    var root = document.querySelector('.naval-home');
    if (!root) return;

    var toast = root.querySelector('[data-toast]');
    var form = root.querySelector('.nh-form');
    var detailLink = root.querySelector('[data-detail-link]');

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('is-error');
      toast.classList.add('is-visible');
      window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 3200);
    }

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var modal = root.querySelector('[data-contact-modal]');
        if (modal) {
          modal.classList.remove('is-open');
          modal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
        showToast('Simulation : le message serait envoyé à l’administrateur dans XWiki.');
      });
    }

    if (detailLink) {
      detailLink.addEventListener('click', function (event) {
        event.preventDefault();
        showToast('Simulation : ce bouton ouvrirait la page du module dans XWiki.');
      });
    }
  });
}());
