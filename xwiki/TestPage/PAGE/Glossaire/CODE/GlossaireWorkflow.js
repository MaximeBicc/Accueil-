// Propositions d'acronymes et décisions des validateurs.
// Les droits sont vérifiés à nouveau par l'endpoint XWiki à chaque requête.

function decodeGlossaryWorkflowValue(value) {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
}

async function requestGlossaryWorkflow(action, values) {
    var table = document.getElementById('mainGlossaryTable');
    if (!table || !table.getAttribute('data-workflow-url')) {
        throw new Error('Le service des propositions est indisponible. Rechargez la page.');
    }

    var endpoint = new URL(table.getAttribute('data-workflow-url'), window.location.href);
    endpoint.searchParams.set('xpage', 'plain');
    var data = new FormData();
    data.append('action', action);
    data.append('form_token', table.getAttribute('data-csrf') || '');
    Object.keys(values).forEach(function(key) {
        data.append(key, values[key]);
    });

    var response = await fetch(endpoint.toString(), {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    var result = await response.text();
    var error = getGlossaryResultLine(result, 'GLOSSAIRE_ERROR');
    if (error) {
        throw new Error(decodeGlossaryWorkflowValue(error.split('|')[1]) || 'La demande a échoué.');
    }
    var expectedCode = {
        propose: 'GLOSSAIRE_PROPOSED',
        approve: 'GLOSSAIRE_APPROVED',
        reject: 'GLOSSAIRE_REJECTED'
    }[action];
    var success = expectedCode && getGlossaryResultLine(result, expectedCode);
    if (!response.ok || !success) {
        throw new Error('La demande n\'a pas abouti. Rechargez la page et réessayez.');
    }
    var parts = success.split('|');
    if ((action === 'propose' && (parts.length !== 2 || !parts[1])) ||
        (action === 'approve' && (parts.length !== 6 || !parts[1] || !parts[2] || !parts[3] || !parts[4])) ||
        (action === 'reject' && parts.length !== 1)) {
        throw new Error('Réponse du service incomplète. Rechargez la page.');
    }
    return parts.slice(1).map(decodeGlossaryWorkflowValue);
}

function setGlossaryWorkflowBusy(form, busy) {
    form.dataset.workflowBusy = busy ? 'true' : 'false';
    if (busy) {
        form.querySelectorAll('input, textarea, button').forEach(function(control) {
            control.dataset.workflowWasDisabled = control.disabled ? 'true' : 'false';
            control.disabled = true;
        });
    } else {
        form.querySelectorAll('[data-workflow-was-disabled]').forEach(function(control) {
            control.disabled = control.dataset.workflowWasDisabled === 'true';
            delete control.dataset.workflowWasDisabled;
        });
    }
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function showGlossaryWorkflowError(element, message) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-hidden', !message);
}

function appendOwnGlossaryProposal(values, reference) {
    var list = document.getElementById('glossaryOwnProposals');
    if (!list) return;
    var card = document.createElement('article');
    card.className = 'glossary-proposal-status-card';
    card.setAttribute('data-proposal-ref', reference);
    var title = document.createElement('h3');
    title.textContent = values.acronym + ' — ' + values.label;
    var date = document.createElement('p');
    date.className = 'glossary-proposal-meta text-muted';
    date.textContent = 'Proposition envoyée à l’instant';
    var status = document.createElement('p');
    var label = document.createElement('strong');
    label.textContent = 'En attente de validation';
    status.appendChild(label);
    card.appendChild(title);
    card.appendChild(date);
    card.appendChild(status);
    list.insertBefore(card, list.firstChild);
    var empty = document.getElementById('glossaryOwnProposalsEmpty');
    if (empty) empty.classList.add('is-hidden');
}

async function submitGlossaryProposal(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var table = document.getElementById('mainGlossaryTable');
    if (!table || table.getAttribute('data-can-propose') !== 'true' ||
        canManageGlossary() || form.dataset.workflowBusy === 'true') return;
    var feedback = form.querySelector('.glossary-proposal-feedback');
    var values = {
        acronym: form.querySelector('[name="acronyme"]').value.trim(),
        label: form.querySelector('[name="libelle"]').value.trim(),
        definition: form.querySelector('[name="definition"]').value.trim()
    };
    if (!values.acronym || !values.label) {
        showGlossaryWorkflowError(feedback, 'L’acronyme et le libellé sont obligatoires.');
        return;
    }
    if (!form.reportValidity()) return;
    showGlossaryWorkflowError(feedback, '');
    setGlossaryWorkflowBusy(form, true);
    try {
        var result = await requestGlossaryWorkflow('propose', values);
        appendOwnGlossaryProposal(values, result[0]);
        form.reset();
        if (typeof triggerGlobalFilter === 'function') triggerGlobalFilter();
        jQuery('#glossaryModal').modal('hide');
        showGlossaryToast('Votre proposition a été envoyée aux validateurs.');
    } catch (error) {
        showGlossaryWorkflowError(feedback, error.message || 'Impossible d’envoyer la proposition.');
    } finally {
        setGlossaryWorkflowBusy(form, false);
    }
}

function updateGlossaryProposalCount() {
    var list = document.getElementById('glossaryPendingProposals');
    if (!list) return;
    var count = list.querySelectorAll('.glossary-proposal-card').length;
    var badge = document.getElementById('glossaryProposalCount');
    var label = document.getElementById('glossaryProposalCountLabel');
    var empty = document.getElementById('glossaryProposalsEmpty');
    if (badge) badge.textContent = String(count);
    if (label) label.textContent = count + ' proposition(s) en attente';
    if (empty) empty.classList.toggle('is-hidden', count !== 0);
}

async function reviewGlossaryProposal(card, action) {
    if (!canManageGlossary() || !card || card.dataset.workflowBusy === 'true' ||
        (action !== 'approve' && action !== 'reject')) return;
    var feedback = card.querySelector('.glossary-proposal-feedback');
    var values = {
        targetRef: card.getAttribute('data-proposal-ref') || '',
        expectedVersion: card.getAttribute('data-expected-version') || '',
        acronym: card.querySelector('[name="acronym"]').value.trim(),
        label: card.querySelector('[name="label"]').value.trim(),
        definition: card.querySelector('[name="definition"]').value.trim(),
        comment: card.querySelector('[name="comment"]').value.trim()
    };
    if (action === 'reject' && !values.comment) {
        showGlossaryWorkflowError(feedback, 'Indiquez un motif pour refuser cette proposition.');
        card.querySelector('[name="comment"]').focus();
        return;
    }
    if (action === 'approve' && (!values.acronym || !values.label)) {
        showGlossaryWorkflowError(feedback, 'L’acronyme et le libellé sont obligatoires.');
        return;
    }
    if (action === 'approve' && !card.reportValidity()) return;
    showGlossaryWorkflowError(feedback, '');
    setGlossaryWorkflowBusy(card, true);
    try {
        var result = await requestGlossaryWorkflow(action, values);
        if (action === 'approve') {
            appendImportedGlossaryRow({ acronym: result[2], label: result[3], definition: result[4] }, result[0], result[1]);
            applyCurrentSort();
            filterMainTableColumns(false);
            if (typeof sortPopupTableAlphabetically === 'function') sortPopupTableAlphabetically();
        }
        card.remove();
        updateGlossaryProposalCount();
        showGlossaryToast(action === 'approve' ? 'L’acronyme a été validé et ajouté au glossaire.' : 'La proposition a été refusée.');
    } catch (error) {
        showGlossaryWorkflowError(feedback, error.message || 'Impossible de traiter cette proposition.');
    } finally {
        setGlossaryWorkflowBusy(card, false);
    }
}

function initGlossaryWorkflow() {
    var table = document.getElementById('mainGlossaryTable');
    if (!table) return;
    var modal = document.getElementById('glossaryProposalsModal');
    if (modal && modal.parentNode !== document.body) document.body.appendChild(modal);

    var createForm = document.getElementById('glossaryCreateForm');
    if (createForm && !canManageGlossary() && createForm.dataset.workflowBound !== 'true') {
        createForm.dataset.workflowBound = 'true';
        var feedback = document.createElement('p');
        feedback.className = 'glossary-proposal-feedback text-danger is-hidden';
        feedback.setAttribute('role', 'alert');
        var body = createForm.querySelector('.modal-body');
        if (body) body.insertBefore(feedback, body.firstChild);
        createForm.addEventListener('submit', submitGlossaryProposal);
    }

    var list = document.getElementById('glossaryPendingProposals');
    if (canManageGlossary() && list && list.dataset.workflowBound !== 'true') {
        list.dataset.workflowBound = 'true';
        list.addEventListener('submit', function(event) { event.preventDefault(); });
        list.addEventListener('click', function(event) {
            var button = event.target.closest('[data-review-action]');
            if (!button || !list.contains(button)) return;
            reviewGlossaryProposal(button.closest('.glossary-proposal-card'), button.getAttribute('data-review-action'));
        });
        updateGlossaryProposalCount();
    }
}

document.addEventListener('DOMContentLoaded', initGlossaryWorkflow);
