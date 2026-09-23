// Variable globale pour stocker la valeur numérique du zoom
let currentZoom = 0.8;

// La sidebar est injectée dynamiquement par LienPerso().
// Ces variables globales permettent donc de réinitialiser proprement
// les comportements à chaque changement de dossier.
let activeResizeSidebar = null;
let zoomTimeout = null;

function applyZoom(zoomValue) {
    const iframe = document.getElementById('sidebar-iframe');
    const zoomLabel = document.getElementById('zoom-level');

    if (!iframe || !zoomLabel) return;

    currentZoom = Math.min(Math.max(zoomValue, 0.5), 1.5);

    zoomLabel.innerText = Math.round(currentZoom * 100) + '%';
    iframe.style.transform = `scale(${currentZoom})`;
    iframe.style.width = (100 / currentZoom) + '%';
    iframe.style.height = (100 / currentZoom) + '%';
}

function initSidebarPreview(root) {
    const scope = root || document;
    const sidebar = scope.querySelector
        ? scope.querySelector('#preview-sidebar')
        : document.getElementById('preview-sidebar');

    if (!sidebar) return;

    // ---------------------------------------------------------
    // 1. Redimensionnement de la sidebar
    // ---------------------------------------------------------
    const dragHandle = sidebar.querySelector('#sidebar-drag-handle');

    if (dragHandle && !dragHandle.hasAttribute('data-sidebar-resize-ready')) {
        dragHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();

            activeResizeSidebar = sidebar;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            sidebar.style.transition = 'none';
        });

        dragHandle.setAttribute('data-sidebar-resize-ready', 'true');
    }

    // ---------------------------------------------------------
    // 2. Apparition des contrôles de zoom
    // ---------------------------------------------------------
    const previewContainer = sidebar.querySelector('.preview-frame-container');
    const zoomControls = sidebar.querySelector('.zoom-controls');

    if (
        previewContainer &&
        zoomControls &&
        !previewContainer.hasAttribute('data-sidebar-zoom-ready')
    ) {
        const showZoom = function() {
            zoomControls.classList.add('visible');

            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(function() {
                zoomControls.classList.remove('visible');
            }, 2000);
        };

        previewContainer.addEventListener('mousemove', showZoom);
        previewContainer.addEventListener('mouseenter', showZoom);

        previewContainer.addEventListener('mouseleave', function() {
            clearTimeout(zoomTimeout);
            zoomControls.classList.remove('visible');
        });

        previewContainer.setAttribute('data-sidebar-zoom-ready', 'true');
    }
}

// -------------------------------------------------------------
// Redimensionnement global
// -------------------------------------------------------------
document.addEventListener('mousemove', function(e) {
    if (!activeResizeSidebar) return;

    const newWidth = window.innerWidth - e.clientX;
    const minWidth = 350;
    const maxWidth = window.innerWidth * 0.9;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
        activeResizeSidebar.style.width = newWidth + 'px';
    }
});

document.addEventListener('mouseup', function() {
    if (!activeResizeSidebar) return;

    activeResizeSidebar.style.transition = 'right 0.3s ease-in-out';
    activeResizeSidebar = null;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
});

// -------------------------------------------------------------
// Clics : ouverture, fermeture et zoom
// -------------------------------------------------------------
document.addEventListener('click', function(e) {
    const documentItem = e.target && e.target.closest
        ? e.target.closest('.document-item')
        : null;

    // Clic sur un document
    if (documentItem) {
        const iframe = document.getElementById('sidebar-iframe');
        const sidebar = document.getElementById('preview-sidebar');

        if (!sidebar) return;

        const title = document.getElementById('sidebar-title');
        const creator = document.getElementById('sidebar-creator');
        const created = document.getElementById('sidebar-created');
        const modified = document.getElementById('sidebar-modified');
        const desc = document.getElementById('sidebar-desc');
        const openButton = document.getElementById('sidebar-open-btn');

        if (title) title.innerText = documentItem.getAttribute('data-title') || '';
        if (creator) creator.innerText = documentItem.getAttribute('data-creator') || '';
        if (created) created.innerText = documentItem.getAttribute('data-created') || '';
        if (modified) modified.innerText = documentItem.getAttribute('data-modified') || '';
        if (desc) desc.innerText = documentItem.getAttribute('data-desc') || '';

        const docUrl = documentItem.getAttribute('data-url');
        const docUrlPreview = documentItem.getAttribute('data-url-preview');

        if (iframe) {
            iframe.src = docUrlPreview || '';
        }

        if (openButton) {
            openButton.href = docUrl || '#';
        }

        applyZoom(0.8);
        sidebar.classList.add('active');

        // Le HTML de la sidebar vient d'être injecté par AJAX :
        // on s'assure que le zoom et la poignée sont bien branchés.
        initSidebarPreview(document);
    }

    // Fermeture du panneau
    if (e.target && e.target.closest && e.target.closest('#sidebar-close')) {
        const sidebar = document.getElementById('preview-sidebar');

        if (sidebar) {
            sidebar.classList.remove('active');
            sidebar.style.right = '';
        }
    }

    // Zoom +
    if (e.target && e.target.closest && e.target.closest('#btn-zoom-in')) {
        applyZoom(currentZoom + 0.1);
    }

    // Zoom -
    if (e.target && e.target.closest && e.target.closest('#btn-zoom-out')) {
        applyZoom(currentZoom - 0.1);
    }
});

// Premier essai d'initialisation si la sidebar existe déjà.
// Si elle est injectée plus tard, LienPerso() rappellera initSidebarPreview().
document.addEventListener('DOMContentLoaded', function() {
    initSidebarPreview(document);
});
