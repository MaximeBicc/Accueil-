// Variable globale pour stocker la valeur numérique du zoom
let currentZoom = 0.8;

// La sidebar est injectée dynamiquement par LienPerso().
let activeResizeSidebar = null;
let zoomTimeout = null;

// Document actuellement affiché dans la sidebar.
let sidebarCurrentDocumentRef = "";
let sidebarCurrentDocumentItem = null;
let sidebarCurrentTags = [];
let sidebarMetadataDirty = false;

function applyZoom(zoomValue) {
    const iframe = document.getElementById("sidebar-iframe");
    const zoomLabel = document.getElementById("zoom-level");

    if (!iframe || !zoomLabel) return;

    currentZoom = Math.min(Math.max(zoomValue, 0.5), 1.5);

    zoomLabel.innerText = Math.round(currentZoom * 100) + "%";
    iframe.style.transform = "scale(" + currentZoom + ")";
    iframe.style.width = (100 / currentZoom) + "%";
    iframe.style.height = (100 / currentZoom) + "%";
}

function parseSidebarTags(rawValue) {
    const seen = {};

    return String(rawValue || "")
        .split(/[,;\n]+/)
        .map(function(tag) {
            return tag.trim();
        })
        .filter(function(tag) {
            if (!tag) return false;

            const key = tag.toLowerCase();

            if (seen[key]) {
                return false;
            }

            seen[key] = true;
            return true;
        });
}

function getSidebarFormToken() {
    if (typeof getExplorerFormToken === "function") {
        return getExplorerFormToken();
    }

    const input = document.querySelector(
        '#formulairePopup input[name="form_token"]'
    );

    return input ? input.value : "";
}

function setSidebarMetadataStatus(message, state) {
    const status = document.getElementById("sidebar-metadata-status");

    if (!status) return;

    status.textContent = message || "";
    status.classList.remove(
        "is-dirty",
        "is-saving",
        "is-success",
        "is-error"
    );

    if (state) {
        status.classList.add("is-" + state);
    }
}

function markSidebarMetadataDirty() {
    sidebarMetadataDirty = true;
    setSidebarMetadataStatus("Modifications non enregistrées", "dirty");
}

function renderSidebarTags() {
    const container = document.getElementById("sidebar-tags-list");

    if (!container) return;

    container.innerHTML = "";

    if (sidebarCurrentTags.length === 0) {
        const empty = document.createElement("span");
        empty.className = "sidebar-tags-empty";
        empty.textContent = "Aucun mot-clé";
        container.appendChild(empty);
        return;
    }

    sidebarCurrentTags.forEach(function(tag, index) {
        const chip = document.createElement("span");
        chip.className = "sidebar-tag-chip";

        const text = document.createElement("span");
        text.className = "sidebar-tag-chip-text";
        text.textContent = tag;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "sidebar-tag-remove";
        remove.setAttribute("data-tag-index", String(index));
        remove.setAttribute("aria-label", "Retirer le mot-clé " + tag);
        remove.title = "Retirer";
        remove.textContent = "×";

        chip.appendChild(text);
        chip.appendChild(remove);
        container.appendChild(chip);
    });
}

function addSidebarTagsFromInput() {
    const input = document.getElementById("sidebar-tag-input");

    if (!input) return;

    const candidates = parseSidebarTags(input.value);

    if (candidates.length === 0) {
        input.value = "";
        return;
    }

    const existing = {};

    sidebarCurrentTags.forEach(function(tag) {
        existing[tag.toLowerCase()] = true;
    });

    candidates.forEach(function(tag) {
        if (tag.length > 80) {
            tag = tag.substring(0, 80);
        }

        const key = tag.toLowerCase();

        if (!existing[key]) {
            sidebarCurrentTags.push(tag);
            existing[key] = true;
        }
    });

    input.value = "";
    renderSidebarTags();
    markSidebarMetadataDirty();
}

function removeSidebarTag(index) {
    if (
        index < 0 ||
        index >= sidebarCurrentTags.length
    ) {
        return;
    }

    sidebarCurrentTags.splice(index, 1);
    renderSidebarTags();
    markSidebarMetadataDirty();
}

function getSidebarMetadataError(result) {
    const plain = String(result || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (plain.indexOf("ERREUR_DROITS") !== -1) {
        return "Tu n'as pas les droits pour modifier ce document.";
    }

    if (plain.indexOf("ERREUR_SOURCE_INTROUVABLE") !== -1) {
        return "Ce document n'existe plus.";
    }

    if (plain.indexOf("ERREUR_DESCRIPTION_TROP_LONGUE") !== -1) {
        return "La description est trop longue.";
    }

    if (plain.indexOf("ERREUR_TAGS_TROP_LONGS") !== -1) {
        return "Il y a trop de mots-clés.";
    }

    if (plain.indexOf("ERREUR_CSRF") !== -1) {
        return "La session de sécurité a expiré. Recharge la page.";
    }

    if (plain.indexOf("ERREUR_ELEMENT_INVALIDE") !== -1) {
        return "Cet élément n'est pas un document modifiable.";
    }

    if (plain.indexOf("ERREUR_METADONNEES") !== -1) {
        return "La sauvegarde des informations a échoué.";
    }

    return plain || "Impossible d'enregistrer les informations.";
}

async function saveSidebarMetadata() {
    if (!sidebarCurrentDocumentRef) {
        return;
    }

    // Si le dernier mot-clé est encore dans le champ, on l'ajoute
    // automatiquement avant l'enregistrement.
    const tagInput = document.getElementById("sidebar-tag-input");
    if (tagInput && tagInput.value.trim()) {
        addSidebarTagsFromInput();
    }

    const descriptionInput = document.getElementById("sidebar-desc-input");
    const saveButton = document.getElementById("sidebar-metadata-save");

    const description = descriptionInput
        ? descriptionInput.value
        : "";
    const tags = sidebarCurrentTags.join(", ");

    const formData = new FormData();
    formData.set("action", "modifier metadonnees document");
    formData.set("form_token", getSidebarFormToken());
    formData.set("source_ref", sidebarCurrentDocumentRef);
    formData.set("description", description);
    formData.set("tags", tags);

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Enregistrement...";
    }

    setSidebarMetadataStatus("Enregistrement...", "saving");

    try {
        const response = await fetch(urlCommande, {
            method: "POST",
            body: formData,
            credentials: "same-origin",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });

        const result = await response.text();

        if (result.indexOf("METADONNEES_OK") === -1) {
            throw new Error(getSidebarMetadataError(result));
        }

        const parsed = new DOMParser().parseFromString(
            result,
            "text/html"
        );
        const metadataResult = parsed.getElementById(
            "metadata-result"
        );
        const modified = metadataResult
            ? metadataResult.getAttribute("data-modified") || ""
            : "";

        if (sidebarCurrentDocumentItem) {
            sidebarCurrentDocumentItem.setAttribute(
                "data-desc",
                description
            );
            sidebarCurrentDocumentItem.setAttribute(
                "data-tags",
                tags
            );

            if (modified) {
                sidebarCurrentDocumentItem.setAttribute(
                    "data-modified",
                    modified
                );
            }
        }

        const modifiedElement = document.getElementById(
            "sidebar-modified"
        );

        if (modified && modifiedElement) {
            modifiedElement.textContent = modified;
        }

        sidebarMetadataDirty = false;
        setSidebarMetadataStatus("Enregistré", "success");
    } catch (error) {
        console.error(
            "Erreur pendant l'enregistrement des métadonnées :",
            error
        );

        setSidebarMetadataStatus(
            error && error.message
                ? error.message
                : "Impossible d'enregistrer.",
            "error"
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "Enregistrer";
        }
    }
}

function toggleSidebarSection(section) {
    if (!section) {
        return;
    }

    const toggle = section.querySelector(".sidebar-section-toggle");
    const content = section.querySelector(".sidebar-section-content");

    if (!toggle || !content) {
        return;
    }

    const isOpen = !section.classList.contains("is-open");

    section.classList.toggle("is-open", isOpen);
    toggle.setAttribute(
        "aria-expanded",
        isOpen ? "true" : "false"
    );
    content.hidden = !isOpen;

    const sidebar = section.closest("#preview-sidebar");

    if (sidebar) {
        const previewSection = sidebar.querySelector(
            '.sidebar-section[data-sidebar-section="preview"]'
        );

        sidebar.classList.toggle(
            "sidebar-preview-collapsed",
            !!previewSection &&
            !previewSection.classList.contains("is-open")
        );
    }
}

function initSidebarPreview(root) {
    const scope = root || document;
    const sidebar = scope.querySelector
        ? scope.querySelector("#preview-sidebar")
        : document.getElementById("preview-sidebar");

    if (!sidebar) return;

    // ---------------------------------------------------------
    // 1. Sections pliables
    // ---------------------------------------------------------
    // On normalise simplement l'état ici. Le clic est géré plus bas
    // par délégation globale, ce qui reste fiable même après injection AJAX.
    sidebar.querySelectorAll(".sidebar-section").forEach(function(section) {
        const toggle = section.querySelector(".sidebar-section-toggle");
        const content = section.querySelector(".sidebar-section-content");

        if (!toggle || !content) {
            return;
        }

        const isOpen = section.classList.contains("is-open");

        toggle.setAttribute(
            "aria-expanded",
            isOpen ? "true" : "false"
        );
        content.hidden = !isOpen;
    });

    // ---------------------------------------------------------
    // 2. Redimensionnement de la sidebar
    // ---------------------------------------------------------
    const dragHandle = sidebar.querySelector(
        "#sidebar-drag-handle"
    );

    if (
        dragHandle &&
        !dragHandle.hasAttribute("data-sidebar-resize-ready")
    ) {
        dragHandle.addEventListener("mousedown", function(e) {
            e.preventDefault();

            activeResizeSidebar = sidebar;
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";
            sidebar.style.transition = "none";
        });

        dragHandle.setAttribute(
            "data-sidebar-resize-ready",
            "true"
        );
    }

    // ---------------------------------------------------------
    // 3. Apparition des contrôles de zoom
    // ---------------------------------------------------------
    const previewContainer = sidebar.querySelector(
        ".preview-frame-container"
    );
    const zoomControls = sidebar.querySelector(".zoom-controls");

    if (
        previewContainer &&
        zoomControls &&
        !previewContainer.hasAttribute("data-sidebar-zoom-ready")
    ) {
        const showZoom = function() {
            zoomControls.classList.add("visible");

            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(function() {
                zoomControls.classList.remove("visible");
            }, 2000);
        };

        previewContainer.addEventListener(
            "mousemove",
            showZoom
        );
        previewContainer.addEventListener(
            "mouseenter",
            showZoom
        );

        previewContainer.addEventListener(
            "mouseleave",
            function() {
                clearTimeout(zoomTimeout);
                zoomControls.classList.remove("visible");
            }
        );

        previewContainer.setAttribute(
            "data-sidebar-zoom-ready",
            "true"
        );
    }

    // ---------------------------------------------------------
    // 4. Edition description / mots-clés
    // ---------------------------------------------------------
    const descriptionInput = sidebar.querySelector(
        "#sidebar-desc-input"
    );
    const tagInput = sidebar.querySelector("#sidebar-tag-input");
    const addTagButton = sidebar.querySelector(
        "#sidebar-tag-add"
    );
    const tagsList = sidebar.querySelector("#sidebar-tags-list");
    const saveButton = sidebar.querySelector(
        "#sidebar-metadata-save"
    );

    if (
        descriptionInput &&
        !descriptionInput.hasAttribute(
            "data-sidebar-metadata-ready"
        )
    ) {
        descriptionInput.addEventListener(
            "input",
            markSidebarMetadataDirty
        );
        descriptionInput.setAttribute(
            "data-sidebar-metadata-ready",
            "true"
        );
    }

    if (
        tagInput &&
        !tagInput.hasAttribute("data-sidebar-tag-ready")
    ) {
        tagInput.addEventListener("keydown", function(event) {
            if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addSidebarTagsFromInput();
            }
        });

        tagInput.setAttribute(
            "data-sidebar-tag-ready",
            "true"
        );
    }

    if (
        addTagButton &&
        !addTagButton.hasAttribute("data-sidebar-tag-ready")
    ) {
        addTagButton.addEventListener(
            "click",
            addSidebarTagsFromInput
        );
        addTagButton.setAttribute(
            "data-sidebar-tag-ready",
            "true"
        );
    }

    if (
        tagsList &&
        !tagsList.hasAttribute("data-sidebar-tags-ready")
    ) {
        tagsList.addEventListener("click", function(event) {
            const removeButton = event.target.closest(
                ".sidebar-tag-remove"
            );

            if (!removeButton) {
                return;
            }

            const index = parseInt(
                removeButton.getAttribute("data-tag-index"),
                10
            );

            if (!isNaN(index)) {
                removeSidebarTag(index);
            }
        });

        tagsList.setAttribute(
            "data-sidebar-tags-ready",
            "true"
        );
    }

    if (
        saveButton &&
        !saveButton.hasAttribute("data-sidebar-save-ready")
    ) {
        saveButton.addEventListener(
            "click",
            saveSidebarMetadata
        );
        saveButton.setAttribute(
            "data-sidebar-save-ready",
            "true"
        );
    }
}

// -------------------------------------------------------------
// Redimensionnement global
// -------------------------------------------------------------
document.addEventListener("mousemove", function(e) {
    if (!activeResizeSidebar) return;

    const newWidth = window.innerWidth - e.clientX;
    const minWidth = 350;
    const maxWidth = window.innerWidth * 0.9;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
        activeResizeSidebar.style.width = newWidth + "px";
    }
});

document.addEventListener("mouseup", function() {
    if (!activeResizeSidebar) return;

    activeResizeSidebar.style.transition =
        "right 0.3s ease-in-out";
    activeResizeSidebar = null;

    document.body.style.cursor = "";
    document.body.style.userSelect = "";
});

// -------------------------------------------------------------
// Clics : ouverture, fermeture et zoom
// -------------------------------------------------------------
document.addEventListener("click", function(e) {
    const sectionToggle = e.target && e.target.closest
        ? e.target.closest(".sidebar-section-toggle")
        : null;

    // Sections de la sidebar : gestion déléguée pour fonctionner même
    // lorsque toute la sidebar est recréée par AJAX.
    if (sectionToggle) {
        const section = sectionToggle.closest(".sidebar-section");

        if (section) {
            e.preventDefault();
            toggleSidebarSection(section);
            return;
        }
    }

    const documentItem = e.target && e.target.closest
        ? e.target.closest(".document-item")
        : null;

    // Clic sur un document
    if (documentItem) {
        const iframe = document.getElementById(
            "sidebar-iframe"
        );
        const sidebar = document.getElementById(
            "preview-sidebar"
        );

        if (!sidebar) return;

        const title = document.getElementById("sidebar-title");
        const creator = document.getElementById(
            "sidebar-creator"
        );
        const created = document.getElementById(
            "sidebar-created"
        );
        const modified = document.getElementById(
            "sidebar-modified"
        );
        const descriptionInput = document.getElementById(
            "sidebar-desc-input"
        );
        const tagInput = document.getElementById(
            "sidebar-tag-input"
        );
        const openButton = document.getElementById(
            "sidebar-open-btn"
        );

        sidebarCurrentDocumentRef =
            documentItem.getAttribute("data-full-name") || "";
        sidebarCurrentDocumentItem = documentItem;
        sidebarCurrentTags = parseSidebarTags(
            documentItem.getAttribute("data-tags") || ""
        );
        sidebarMetadataDirty = false;

        if (title) {
            title.innerText =
                documentItem.getAttribute("data-title") || "";
        }

        if (creator) {
            creator.innerText =
                documentItem.getAttribute("data-creator") || "";
        }

        if (created) {
            created.innerText =
                documentItem.getAttribute("data-created") || "";
        }

        if (modified) {
            modified.innerText =
                documentItem.getAttribute("data-modified") || "";
        }

        if (descriptionInput) {
            descriptionInput.value =
                documentItem.getAttribute("data-desc") || "";
        }

        if (tagInput) {
            tagInput.value = "";
        }

        renderSidebarTags();
        setSidebarMetadataStatus("", "");

        const docUrl = documentItem.getAttribute("data-url");
        const docUrlPreview = documentItem.getAttribute(
            "data-url-preview"
        );

        if (iframe) {
            iframe.src = docUrlPreview || "";
        }

        if (openButton) {
            openButton.href = docUrl || "#";
        }

        applyZoom(0.8);
        sidebar.classList.add("active");

        // Le HTML de la sidebar vient d'être injecté par AJAX.
        initSidebarPreview(document);
    }

    // Fermeture du panneau
    if (
        e.target &&
        e.target.closest &&
        e.target.closest("#sidebar-close")
    ) {
        const sidebar = document.getElementById(
            "preview-sidebar"
        );

        if (sidebar) {
            sidebar.classList.remove("active");
            sidebar.style.right = "";
        }
    }

    // Zoom +
    if (
        e.target &&
        e.target.closest &&
        e.target.closest("#btn-zoom-in")
    ) {
        applyZoom(currentZoom + 0.1);
    }

    // Zoom -
    if (
        e.target &&
        e.target.closest &&
        e.target.closest("#btn-zoom-out")
    ) {
        applyZoom(currentZoom - 0.1);
    }
});

// Premier essai d'initialisation si la sidebar existe déjà.
// Si elle est injectée plus tard, LienPerso() rappellera initSidebarPreview().
document.addEventListener("DOMContentLoaded", function() {
    initSidebarPreview(document);
});
