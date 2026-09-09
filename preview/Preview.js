(function () {
  'use strict';

  var previewLogo = 'data:image/png;base64,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';

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

    var hub = root.querySelector('.nh-hub');
    if (hub) {
      hub.innerHTML = '';
      var logo = document.createElement('img');
      logo.className = 'nh-hub-logo-image';
      logo.src = previewLogo;
      logo.alt = 'Naval Group';
      hub.appendChild(logo);
    }

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
