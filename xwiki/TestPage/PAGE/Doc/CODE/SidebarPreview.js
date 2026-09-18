// Variable globale pour stocker la valeur numérique du zoom
let currentZoom = 0.8;

function applyZoom(zoomValue) {
    // Récupération dynamique des éléments pour éviter l'erreur d'initialisation
    const iframe = document.getElementById('sidebar-iframe');
    const zoomLabel = document.getElementById('zoom-level');

    if (!iframe || !zoomLabel) return; // Sécurité si les éléments n'existent pas

    currentZoom = Math.min(Math.max(zoomValue, 0.5), 1.5); // Limite entre 50% et 150%

    // Affichage du pourcentage textuel
    zoomLabel.innerText = Math.round(currentZoom * 100) + '%';

    // Application du style sur l'iframe
    iframe.style.transform = `scale(${currentZoom})`;
    iframe.style.width = (100 / currentZoom) + '%';
    iframe.style.height = (100 / currentZoom) + '%';
}

document.addEventListener('click', function(e) {
    // Clic sur un document
    if (e.target && e.target.classList.contains('document-item')) {
        const el = e.target;
        const iframe = document.getElementById('sidebar-iframe');

        document.getElementById('sidebar-title').innerText = el.getAttribute('data-title') || '';
        document.getElementById('sidebar-creator').innerText = el.getAttribute('data-creator') || '';
        document.getElementById('sidebar-created').innerText = el.getAttribute('data-created') || '';
        document.getElementById('sidebar-modified').innerText = el.getAttribute('data-modified') || '';
        document.getElementById('sidebar-desc').innerText = el.getAttribute('data-desc') || '';

        const docUrl = el.getAttribute('data-url');
        const docUrlPreview = el.getAttribute('data-url-preview');

        if (iframe) {
            iframe.src = docUrlPreview;
        }
        document.getElementById('sidebar-open-btn').href = docUrl;

        // Force le zoom initial à 80% à chaque ouverture
        applyZoom(0.8);

        document.getElementById('preview-sidebar').classList.add('active');
    }

    // Fermeture du panneau
    if (e.target && (e.target.id === 'sidebar-close' || e.target.closest('#sidebar-close'))) {
        const sidebar = document.getElementById('preview-sidebar');
        if (sidebar) {
            sidebar.classList.remove('active');
            sidebar.style.right = ''; // MODIFIÉ : Efface le style inline pour laisser le CSS (-105%) reprendre le dessus
        }
    }

    // Gestion des clics sur les boutons de zoom
    if (e.target && e.target.id === 'btn-zoom-in') {
        applyZoom(currentZoom + 0.1); // +10%
    }
    if (e.target && e.target.id === 'btn-zoom-out') {
        applyZoom(currentZoom - 0.1); // -10%
    }
});

// --- SYSTÈME DE REDIMENSIONNEMENT DE LA SIDEBAR ---
const sidebar = document.getElementById('preview-sidebar');
const dragHandle = document.getElementById('sidebar-drag-handle');

if (sidebar && dragHandle) {
    let isResizing = false;

    // Début du glissement au clic sur la poignée
    dragHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        document.body.style.cursor = 'ew-resize'; // Change le curseur globalement
        sidebar.style.transition = 'none'; // Désactive la transition CSS pendant le drag
    });

    // Calcul de la largeur pendant le mouvement de la souris
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;

        // Calcul de la nouvelle largeur (distance entre le curseur et le bord droit)
        let newWidth = window.innerWidth - e.clientX;

        // Limites de sécurité pour éviter de casser l'affichage
        const minWidth = 350;
        const maxWidth = window.innerWidth * 0.9; // Max 90% de l'écran

        if (newWidth >= minWidth && newWidth <= maxWidth) {
            sidebar.style.width = newWidth + 'px';
        }
    });

    // Fin du glissement
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            sidebar.style.transition = 'right 0.3s ease-in-out'; // Réactive l'effet fluide pour l'ouverture/fermeture
        }
    });
}

// --- SYSTÈME D'APPARITION DU ZOOM AU MOUVEMENT ---
const previewContainer = document.querySelector('.preview-frame-container');
const zoomControls = document.querySelector('.zoom-controls');
let zoomTimeout;

if (previewContainer && zoomControls) {
    // Fonction pour afficher le zoom
    const showZoom = () => {
        zoomControls.classList.add('visible');
        // Réinitialise le minuteur à chaque mouvement
        clearTimeout(zoomTimeout);
        // Cache le zoom après 2 secondes d'immobilité
        zoomTimeout = setTimeout(() => {
            zoomControls.classList.remove('visible');
        }, 2000);
    };

    // Déclencheurs : mouvement de souris ou survol de la zone de preview
    previewContainer.addEventListener('mousemove', showZoom);
    previewContainer.addEventListener('mouseenter', showZoom);

    // Cache immédiatement si la souris quitte complètement la zone de preview
    previewContainer.addEventListener('mouseleave', () => {
        clearTimeout(zoomTimeout);
        zoomControls.classList.remove('visible');
    });
}
