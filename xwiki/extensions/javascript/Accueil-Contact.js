(function () {
  'use strict';

  var MESSAGE_ENDPOINTS = [
    '$escapetool.javascript($xwiki.getURL("InfoWiki.CODE.SendAdminMessage.WebHome", "get"))',
    '$escapetool.javascript($xwiki.getURL("InfoWiki.CODE.SendAdminMessage", "get"))'
  ];

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
    var emailField = root.querySelector('#nh-sender-email');
    var messageField = root.querySelector('#nh-message');
    var form = modal ? modal.querySelector('.nh-form') : null;
    var description = modal ? modal.querySelector('.nh-modal-head p') : null;
    var toast = root.querySelector('[data-toast]');
    var lastFocused = null;
    var sending = false;

    if (!modal || !openButton) return;

    if (description) {
      description.textContent = 'Votre message sera enregistré dans la boîte interne de l’administrateur.';
    }

    if (emailField) {
      emailField.disabled = true;
      if (emailField.parentElement) {
        emailField.parentElement.style.display = 'none';
      }
    }

    function showToast(message, isError) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('is-visible');
      if (isError) {
        toast.classList.add('is-error');
      } else {
        toast.classList.remove('is-error');
      }
      window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 6000);
    }

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

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (sending) return;

        var senderName = firstField ? firstField.value : '';
        var message = messageField ? messageField.value : '';
        var tokenField = form.querySelector('input[name="form_token"]');
        var token = tokenField ? tokenField.value : '';

        if (!senderName || !message) {
          showToast('Le nom et le message sont obligatoires.', true);
          return;
        }

        var body = new URLSearchParams();
        body.set('form_token', token);
        body.set('senderName', senderName);
        body.set('adminMessageText', message);

        sending = true;

        function sendToEndpoint(endpointIndex) {
          var endpoint = MESSAGE_ENDPOINTS[endpointIndex] || '';

          if (!endpoint) {
            sending = false;
            showToast('La boîte de réception interne est indisponible.', true);
            return;
          }

          var request = new XMLHttpRequest();
          request.open('POST', endpoint, true);
          request.withCredentials = true;
          request.setRequestHeader(
            'Content-Type',
            'application/x-www-form-urlencoded; charset=UTF-8'
          );
          request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
          request.timeout = 8000;

          request.onreadystatechange = function () {
            if (request.readyState !== 4) return;

            var result = String(request.responseText || '');

            if (request.status === 404 && endpointIndex + 1 < MESSAGE_ENDPOINTS.length) {
              sendToEndpoint(endpointIndex + 1);
              return;
            }

            sending = false;

            if (request.status < 200 || request.status >= 300) {
              showToast(
                'Impossible d’enregistrer le message (HTTP ' + request.status + ').',
                true
              );
              return;
            }

            if (result.indexOf('saved') !== -1) {
              if (messageField) messageField.value = '';
              closeModal();
              showToast('Votre message a bien été transmis à l’administrateur.', false);
            } else if (result.indexOf('class-missing') !== -1) {
              showToast('La classe AdminMessageClass doit être créée dans XWiki.', true);
            } else if (result.indexOf('no-edit-right') !== -1) {
              showToast('Vous n’avez pas le droit d’enregistrer un message dans la boîte interne.', true);
            } else if (result.indexOf('csrf') !== -1) {
              showToast('Votre session a expiré. Rechargez la page puis réessayez.', true);
            } else if (result.indexOf('missing-fields') !== -1) {
              showToast('Le nom et le message sont obligatoires.', true);
            } else {
              showToast('Le message n’a pas pu être enregistré. Réponse : ' + result.slice(0, 120), true);
            }
          };

          request.onerror = function () {
            sending = false;
            showToast('Erreur réseau pendant l’enregistrement du message.', true);
          };

          request.ontimeout = function () {
            sending = false;
            showToast('L’enregistrement du message a expiré.', true);
          };

          request.send(body.toString());
        }

        sendToEndpoint(0);
      });
    }
  }

  ready(function () {
    document.querySelectorAll('.naval-home').forEach(initContact);
  });
}());
