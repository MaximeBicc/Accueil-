var explorerPendingMove = null;
var explorerSelectionMode = false;
var architectureState = null;
var architectureDraggedRef = null;

function LienPerso(url, zone) {
    zone.innerHTML = "<p style='color: #6b7280; padding: 10px;'>Chargement...</p>";

    fetch(
        urlCommande + "?xpage=plain&action=recupContact&childRef=" + encodeURIComponent(url),
        {
            method: "GET",
            credentials: "same-origin"
        }
    )
    .then(function(response) {
        return response.text();
    })
    .then(function(html) {
        zone.innerHTML = html;

        createSpan(zone);

        if (typeof initSidebarPreview === "function") {
            initSidebarPreview(zone);
        }
    })
    .catch(function(error) {
        zone.innerHTML = "<p style='color: #ef4444; padding: 10px;'>Erreur pendant le chargement.</p>";
        console.error(error);
    });
}

function showBreadcrumbError(box, message) {
    const errorZone = box.querySelector("#breadcrumb-error");
    const wrapper = box.querySelector("#breadcrumb-wrapper");

    if (wrapper) {
        wrapper.classList.add("breadcrumb-invalid");
    }

    if (errorZone) {
        errorZone.textContent = message;
        errorZone.style.display = "block";
    }
}

function clearBreadcrumbError(box) {
    const errorZone = box.querySelector("#breadcrumb-error");
    const wrapper = box.querySelector("#breadcrumb-wrapper");

    if (wrapper) {
        wrapper.classList.remove("breadcrumb-invalid");
    }

    if (errorZone) {
        errorZone.textContent = "";
        errorZone.style.display = "none";
    }
}

async function resolveExplorerBreadcrumbPath(pathContent) {
    const segments = String(pathContent || "")
        .split(/[>»]+/)
        .map(function(part) {
            return part.trim();
        })
        .filter(function(part) {
            return part;
        });

    if (segments.length === 0) {
        return typeof initialPageRef !== "undefined"
            ? initialPageRef
            : "";
    }

    // On s'appuie sur la même source que la vue Architecture.
    // Elle contient déjà toutes les références, leurs parents et leurs titres.
    const response = await fetch(
        urlCommande + "?xpage=plain&action=architecture",
        {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        }
    );

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const elements = Array.prototype.slice.call(
        parsed.querySelectorAll(".architecture-node-data")
    );

    if (elements.length === 0) {
        throw new Error("ARCHITECTURE_DATA_EMPTY");
    }

    const nodes = elements.map(function(element) {
        const ref = element.getAttribute("data-ref") || "";
        const cleanRef = cleanNestedPageRef(ref);
        const lastDot = cleanRef.lastIndexOf(".");
        const technicalName = lastDot >= 0
            ? cleanRef.substring(lastDot + 1)
            : cleanRef;

        return {
            ref: ref,
            parentRef: element.getAttribute("data-parent-ref") || "",
            title: element.getAttribute("data-title") || "",
            type: element.getAttribute("data-type") || "",
            technicalName: technicalName
        };
    });

    const root = nodes.find(function(node) {
        return node.type === "root";
    });

    if (!root) {
        throw new Error("ARCHITECTURE_ROOT_MISSING");
    }

    let index = 0;
    let currentRef = root.ref;

    // Le chemin affiché commence normalement par le titre de la racine.
    // On accepte aussi "doc-test", mais on autorise également un chemin
    // saisi directement à partir du premier dossier.
    const first = segments[0].toLowerCase();
    const rootTitle = String(root.title || "").toLowerCase();
    const rootTechnical = String(root.technicalName || "").toLowerCase();

    if (
        first === rootTitle ||
        first === rootTechnical ||
        first === "doc-test"
    ) {
        index = 1;
    }

    for (; index < segments.length; index++) {
        const wanted = segments[index].toLowerCase();

        const match = nodes.find(function(node) {
            if (node.type !== "folder") {
                return false;
            }

            if (node.parentRef !== currentRef) {
                return false;
            }

            return (
                String(node.title || "").toLowerCase() === wanted ||
                String(node.technicalName || "").toLowerCase() === wanted
            );
        });

        if (!match) {
            return "";
        }

        currentRef = match.ref;
    }

    return currentRef;
}

async function copyExplorerPath(pathText) {
    if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
    ) {
        await navigator.clipboard.writeText(pathText);
        return;
    }

    const temporary = document.createElement("textarea");
    temporary.value = pathText;
    temporary.setAttribute("readonly", "readonly");
    temporary.style.position = "fixed";
    temporary.style.left = "-9999px";
    temporary.style.top = "0";

    document.body.appendChild(temporary);
    temporary.focus();
    temporary.select();

    const copied = document.execCommand("copy");
    temporary.remove();

    if (!copied) {
        throw new Error("COPY_FAILED");
    }
}

function initExplorerSidebarAccordion(box) {
    const sidebar = box.querySelector("#preview-sidebar");

    if (!sidebar) {
        return;
    }

    sidebar.querySelectorAll(".sidebar-section").forEach(function(section) {
        const button = section.querySelector(".sidebar-section-toggle");
        const content = section.querySelector(".sidebar-section-content");

        if (!button || !content) {
            return;
        }

        // Synchronise l'état initial après chaque injection AJAX.
        const initiallyOpen = section.classList.contains("is-open");
        button.setAttribute(
            "aria-expanded",
            initiallyOpen ? "true" : "false"
        );
        content.style.display = initiallyOpen
            ? (
                section.getAttribute("data-sidebar-section") === "preview"
                    ? "flex"
                    : section.getAttribute("data-sidebar-section") === "metadata"
                        ? "flex"
                        : "block"
            )
            : "none";

        if (button.hasAttribute("data-sidebar-accordion-ready")) {
            return;
        }

        button.addEventListener("click", function(event) {
            event.preventDefault();
            event.stopPropagation();

            const willOpen = !section.classList.contains("is-open");
            section.classList.toggle("is-open", willOpen);
            button.setAttribute(
                "aria-expanded",
                willOpen ? "true" : "false"
            );

            if (!willOpen) {
                content.style.display = "none";
                return;
            }

            const sectionName = section.getAttribute(
                "data-sidebar-section"
            );

            content.style.display =
                sectionName === "preview" || sectionName === "metadata"
                    ? "flex"
                    : "block";
        });

        button.setAttribute(
            "data-sidebar-accordion-ready",
            "true"
        );
    });
}

function createSpan(box) {
    // ---------------------------------------------------------
    // Navigation dans les dossiers
    // ---------------------------------------------------------
    const folders = box.querySelectorAll(".folder");

    folders.forEach(function(folder) {
        if (!folder.hasAttribute("data-event-listener")) {
            folder.addEventListener("click", function() {
                const url = folder.getAttribute("data-full-name");

                if (url) {
                    LienPerso(url, box);
                }
            });

            folder.setAttribute("data-event-listener", "true");
        }
    });

    // ---------------------------------------------------------
    // Fil d'Ariane modifiable, sécurisé et copiable
    // ---------------------------------------------------------
    const wrapper = box.querySelector("#breadcrumb-wrapper");
    const container = box.querySelector("#breadcrumb-container");
    const input = box.querySelector("#breadcrumb-input");
    const copyButton = box.querySelector("#breadcrumb-copy-btn");
    const test = document.getElementById("test");

    if (wrapper && container && input && !wrapper.hasAttribute("data-event-listener")) {
        wrapper.addEventListener("click", function(e) {
            // Un clic dans le champ sert à placer le curseur ou sélectionner
            // du texte. Il ne faut surtout pas remettre le curseur à la fin.
            if (e.target === input) {
                return;
            }

            // Les dossiers parents restent des liens de navigation.
            if (
                e.target.classList.contains("folder") &&
                e.target !== container.querySelector(".folder:last-of-type")
            ) {
                return;
            }

            const enteringEditMode =
                input.style.display === "none" ||
                window.getComputedStyle(input).display === "none";

            container.style.display = "none";
            input.style.display = "block";

            if (enteringEditMode) {
                input.focus();

                // Première ouverture uniquement : curseur à la fin.
                // Les clics suivants n'écrasent plus la sélection bleue native.
                const textLength = input.value.length;
                input.setSelectionRange(textLength, textLength);
            }
        });

        input.addEventListener("focus", function() {
            clearBreadcrumbError(box);
        });

        input.addEventListener("keydown", async function(event) {
            if (event.key === "Enter") {
                event.preventDefault();

                const pathContent = input.value.trim();

                if (!pathContent) {
                    if (typeof initialPageRef !== "undefined") {
                        LienPerso(initialPageRef, box);
                    }
                    return;
                }

                clearBreadcrumbError(box);
                input.classList.add("breadcrumb-input-checking");

                try {
                    const resolvedRef = await resolveExplorerBreadcrumbPath(pathContent);

                    if (!resolvedRef) {
                        showBreadcrumbError(
                            box,
                            "Chemin introuvable. Vérifie le nom des dossiers."
                        );

                        input.focus();
                        return;
                    }

                    if (test) {
                        test.textContent = resolvedRef;
                    }

                    LienPerso(resolvedRef, box);
                } catch (error) {
                    console.error("Erreur de vérification du chemin :", error);

                    showBreadcrumbError(
                        box,
                        "Impossible de vérifier ce chemin pour le moment."
                    );

                    input.focus();
                } finally {
                    input.classList.remove("breadcrumb-input-checking");
                }
            } else if (event.key === "Escape") {
                event.preventDefault();

                input.value =
                    input.getAttribute("data-valid-path") ||
                    input.value;

                clearBreadcrumbError(box);
                input.style.display = "none";
                container.style.display = "flex";
            }
        });

        input.addEventListener("blur", function() {
            setTimeout(function() {
                // Si le champ a repris le focus entre-temps (sélection,
                // clic maintenu, retour après erreur), on ne le masque pas.
                if (document.activeElement === input) {
                    return;
                }

                input.style.display = "none";
                container.style.display = "flex";
            }, 200);
        });

        wrapper.setAttribute("data-event-listener", "true");
    }

    if (copyButton && !copyButton.hasAttribute("data-event-listener")) {
        copyButton.addEventListener("click", async function(event) {
            event.preventDefault();
            event.stopPropagation();

            const pathToCopy = input
                ? (
                    input.getAttribute("data-valid-path") ||
                    input.value ||
                    ""
                )
                : "";

            if (!pathToCopy) {
                return;
            }

            try {
                await copyExplorerPath(pathToCopy);

                const oldTitle = copyButton.getAttribute("title") || "Copier le chemin";
                copyButton.classList.add("breadcrumb-copy-success");
                copyButton.setAttribute("title", "Chemin copié");
                copyButton.setAttribute("aria-label", "Chemin copié");

                setTimeout(function() {
                    copyButton.classList.remove("breadcrumb-copy-success");
                    copyButton.setAttribute("title", oldTitle);
                    copyButton.setAttribute("aria-label", "Copier le chemin");
                }, 1200);
            } catch (error) {
                console.error("Copie du chemin impossible :", error);
                showBreadcrumbError(
                    box,
                    "Impossible de copier le chemin."
                );
            }
        });

        copyButton.setAttribute("data-event-listener", "true");
    }

    initExplorerSidebarAccordion(box);
    initExplorerManagement(box);
}

function getExplorerFormToken() {
    const tokenInput = document.querySelector(
        '#formulairePopup input[name="form_token"]'
    );

    return tokenInput ? tokenInput.value : "";
}

function getCurrentExplorerPageRef(box) {
    const pageData = box.querySelector("#pageData");
    return pageData ? pageData.getAttribute("parent-page") : "";
}

function getCurrentExplorerPageTitle(box) {
    const pageData = box.querySelector("#pageData h4");
    return pageData ? pageData.textContent : "";
}

function cleanNestedPageRef(ref) {
    const value = String(ref || "");

    if (value.endsWith(".WebHome")) {
        return value.substring(0, value.length - 8);
    }

    return value;
}

function isRefInside(sourceRef, destinationRef) {
    const sourceClean = cleanNestedPageRef(sourceRef);
    const destinationClean = cleanNestedPageRef(destinationRef);

    return (
        destinationClean === sourceClean ||
        destinationClean.indexOf(sourceClean + ".") === 0
    );
}

function getSelectedExplorerItems(box) {
    return Array.prototype.slice.call(
        box.querySelectorAll(".explorer-select-input:checked")
    ).map(function(input) {
        return {
            ref: input.getAttribute("data-ref") || "",
            title: input.getAttribute("data-title") || "",
            type: input.getAttribute("data-type") || ""
        };
    });
}

function clearExplorerSelection(box) {
    box.querySelectorAll(".explorer-select-input").forEach(function(input) {
        input.checked = false;
    });

    updateExplorerSelectionState(box);
}

function setExplorerSelectionMode(box, enabled) {
    explorerSelectionMode = !!enabled;
    box.classList.toggle("explorer-selection-mode", explorerSelectionMode);

    const toggleButton = box.querySelector("#explorer-select-toggle");

    if (toggleButton) {
        toggleButton.textContent = explorerSelectionMode
            ? "Annuler la sélection"
            : "Sélectionner";
    }

    if (!explorerSelectionMode) {
        clearExplorerSelection(box);
    }

    updateExplorerSelectionState(box);
}

function updateExplorerSelectionState(box) {
    const selected = getSelectedExplorerItems(box);
    const moveButton = box.querySelector("#explorer-move-btn");
    const deleteButton = box.querySelector("#explorer-delete-btn");
    const count = box.querySelector("#explorer-selection-count");

    if (moveButton) {
        moveButton.disabled = selected.length === 0;
        moveButton.textContent = selected.length > 1
            ? "Déplacer (" + selected.length + ")"
            : "Déplacer";
    }

    if (deleteButton) {
        deleteButton.disabled = selected.length === 0;
    }

    if (count) {
        count.textContent = selected.length > 0
            ? selected.length + " élément(s) sélectionné(s)"
            : "";
    }

    box.querySelectorAll(".explorer-row").forEach(function(row) {
        const checkbox = row.querySelector(".explorer-select-input");

        row.classList.toggle(
            "explorer-row-selected",
            !!(checkbox && checkbox.checked)
        );
    });
}

function filterTopLevelSelection(items) {
    const sorted = items.slice().sort(function(a, b) {
        return a.ref.length - b.ref.length;
    });

    const kept = [];

    sorted.forEach(function(item) {
        const nestedInSelectedFolder = kept.some(function(parent) {
            return (
                parent.type === "folder" &&
                isRefInside(parent.ref, item.ref) &&
                parent.ref !== item.ref
            );
        });

        if (!nestedInSelectedFolder) {
            kept.push(item);
        }
    });

    return kept;
}

async function postExplorerAction(parameters) {
    const data = new FormData();
    data.set("form_token", getExplorerFormToken());

    Object.keys(parameters).forEach(function(key) {
        data.set(key, parameters[key]);
    });

    const response = await fetch(urlCommande, {
        method: "POST",
        body: data,
        credentials: "same-origin",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    return response.text();
}

function getExplorerActionError(result) {
    const plain = String(result || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (plain.indexOf("ERREUR_DROITS") !== -1) {
        return "Tu n'as pas les droits nécessaires pour cette opération.";
    }

    if (plain.indexOf("ERREUR_DESTINATION_EXISTE") !== -1) {
        return "Un élément portant le même nom existe déjà dans la destination.";
    }

    if (plain.indexOf("ERREUR_DESTINATION_DANS_SOURCE") !== -1) {
        return "Un dossier ne peut pas être déplacé dans lui-même ou dans un de ses descendants.";
    }

    if (plain.indexOf("ERREUR_DEPLACEMENT_IDENTIQUE") !== -1) {
        return "Cet élément se trouve déjà dans ce dossier.";
    }

    if (plain.indexOf("ERREUR_RACINE_PROTEGEE") !== -1) {
        return "La racine doc-test ne peut pas être déplacée ou supprimée.";
    }

    if (plain.indexOf("ERREUR_SOURCE_INTROUVABLE") !== -1) {
        return "L'élément source n'existe plus.";
    }

    if (plain.indexOf("ERREUR_DESTINATION_INTROUVABLE") !== -1) {
        return "Le dossier de destination n'existe plus.";
    }

    if (plain.indexOf("ERREUR_SUPPRESSION") !== -1) {
        return "La suppression a échoué.";
    }

    if (plain.indexOf("ERREUR_DEPLACEMENT") !== -1) {
        return "Le déplacement a échoué.";
    }

    return plain || "Une erreur inconnue s'est produite.";
}

async function moveExplorerItem(sourceRef, destinationRef) {
    const result = await postExplorerAction({
        action: "deplacer element",
        source_ref: sourceRef,
        target_parent_ref: destinationRef
    });

    if (result.indexOf("DEPLACEMENT_OK") === -1) {
        throw new Error(getExplorerActionError(result));
    }

    const parsed = new DOMParser().parseFromString(result, "text/html");
    const moveResult = parsed.getElementById("move-result");

    return {
        oldRef: moveResult
            ? moveResult.getAttribute("data-old-ref")
            : sourceRef,
        newRef: moveResult
            ? moveResult.getAttribute("data-new-ref")
            : ""
    };
}

async function deleteExplorerItems(box, items) {
    const filtered = filterTopLevelSelection(items);

    if (filtered.length === 0) {
        return;
    }

    const folderCount = filtered.filter(function(item) {
        return item.type === "folder";
    }).length;

    let confirmation =
        "Supprimer " + filtered.length + " élément(s) sélectionné(s) ?";

    if (folderCount > 0) {
        confirmation +=
            "\n\nLes dossiers sélectionnés seront supprimés avec tous leurs enfants.";
    }

    if (!window.confirm(confirmation)) {
        return;
    }

    const deleteButton = box.querySelector("#explorer-delete-btn");

    if (deleteButton) {
        deleteButton.disabled = true;
    }

    const failures = [];
    let successCount = 0;

    for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i];

        if (deleteButton) {
            deleteButton.textContent =
                "Suppression " + (i + 1) + "/" + filtered.length;
        }

        try {
            const result = await postExplorerAction({
                action: "supprimer element",
                source_ref: item.ref
            });

            if (result.indexOf("SUPPRESSION_OK") === -1) {
                throw new Error(getExplorerActionError(result));
            }

            successCount++;
        } catch (error) {
            failures.push(
                item.title + " : " +
                (error && error.message ? error.message : String(error))
            );
        }
    }

    explorerSelectionMode = false;

    const currentRef = getCurrentExplorerPageRef(box);

    if (currentRef) {
        LienPerso(currentRef, box);
    }

    if (failures.length > 0) {
        alert(
            successCount + " élément(s) supprimé(s) sur " +
            filtered.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    }
}

function startDirectExplorerMove(box) {
    const selected = filterTopLevelSelection(
        getSelectedExplorerItems(box)
    );

    if (selected.length === 0) {
        return;
    }

    explorerPendingMove = {
        items: selected
    };

    setExplorerSelectionMode(box, false);
    updateMoveDestinationBar(box);
}

function cancelDirectExplorerMove(box) {
    explorerPendingMove = null;
    updateMoveDestinationBar(box);
}

function getPendingMoveItems() {
    if (!explorerPendingMove || !Array.isArray(explorerPendingMove.items)) {
        return [];
    }

    return explorerPendingMove.items;
}

function updateMoveDestinationBar(box) {
    const bar = box.querySelector("#explorer-move-destination");
    const title = box.querySelector("#explorer-move-title");
    const items = getPendingMoveItems();

    if (!bar) {
        return;
    }

    if (items.length === 0) {
        bar.style.display = "none";
        return;
    }

    bar.style.display = "flex";

    if (title) {
        if (items.length === 1) {
            title.textContent = items[0].title;
        } else {
            const preview = items.slice(0, 3).map(function(item) {
                return item.title;
            }).join(", ");

            title.textContent =
                items.length + " éléments" +
                (preview ? " : " + preview : "") +
                (items.length > 3 ? ", ..." : "");
        }
    }
}

async function confirmDirectExplorerMove(box) {
    const items = getPendingMoveItems();

    if (items.length === 0) {
        return;
    }

    const destinationRef = getCurrentExplorerPageRef(box);
    const destinationTitle = getCurrentExplorerPageTitle(box);

    if (!destinationRef) {
        return;
    }

    const invalidFolder = items.find(function(item) {
        return (
            item.type === "folder" &&
            isRefInside(item.ref, destinationRef)
        );
    });

    if (invalidFolder) {
        alert(
            'Le dossier "' + invalidFolder.title +
            '" ne peut pas être déplacé dans lui-même ou dans un de ses descendants.'
        );
        return;
    }

    const confirmation = items.length === 1
        ? 'Déplacer "' + items[0].title + '" dans "' + destinationTitle + '" ?'
        : "Déplacer " + items.length + ' éléments dans "' + destinationTitle + '" ?';

    if (!window.confirm(confirmation)) {
        return;
    }

    const moveHereButton = box.querySelector("#explorer-move-here-btn");

    if (moveHereButton) {
        moveHereButton.disabled = true;
    }

    const failures = [];
    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (moveHereButton) {
            moveHereButton.textContent =
                "Déplacement " + (i + 1) + "/" + items.length;
        }

        try {
            await moveExplorerItem(item.ref, destinationRef);
            successCount++;
        } catch (error) {
            failures.push(
                item.title + " : " +
                (error && error.message ? error.message : String(error))
            );
        }
    }

    explorerPendingMove = null;
    LienPerso(destinationRef, box);

    if (failures.length > 0) {
        alert(
            successCount + " élément(s) déplacé(s) sur " +
            items.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    }

    if (moveHereButton) {
        moveHereButton.disabled = false;
        moveHereButton.textContent = "Déplacer ici";
    }
}

function initExplorerManagement(box) {
    box.classList.toggle(
        "explorer-selection-mode",
        explorerSelectionMode
    );

    const toggleButton = box.querySelector("#explorer-select-toggle");
    const moveButton = box.querySelector("#explorer-move-btn");
    const deleteButton = box.querySelector("#explorer-delete-btn");
    const architectureButton = box.querySelector("#explorer-architecture-btn");
    const moveHereButton = box.querySelector("#explorer-move-here-btn");
    const moveCancelButton = box.querySelector("#explorer-move-cancel-btn");

    if (toggleButton) {
        toggleButton.textContent = explorerSelectionMode
            ? "Annuler la sélection"
            : "Sélectionner";

        toggleButton.addEventListener("click", function() {
            setExplorerSelectionMode(
                box,
                !box.classList.contains("explorer-selection-mode")
            );
        });
    }

    box.querySelectorAll(".explorer-select-input").forEach(function(input) {
        input.addEventListener("change", function() {
            updateExplorerSelectionState(box);
        });
    });

    // En mode sélection, cliquer sur une ligne sélectionne l'élément
    // au lieu d'ouvrir le document ou d'entrer dans le dossier.
    if (!box.hasAttribute("data-selection-capture-ready")) {
        box.addEventListener(
            "click",
            function(event) {
                if (!box.classList.contains("explorer-selection-mode")) {
                    return;
                }

                const item = event.target.closest(
                    ".folder-item, .document-item"
                );

                if (!item || !box.contains(item)) {
                    return;
                }

                const row = item.closest(".explorer-row");
                const checkbox = row
                    ? row.querySelector(".explorer-select-input")
                    : null;

                if (!checkbox) {
                    return;
                }

                event.preventDefault();
                event.stopImmediatePropagation();

                checkbox.checked = !checkbox.checked;
                updateExplorerSelectionState(box);
            },
            true
        );

        box.setAttribute("data-selection-capture-ready", "true");
    }

    if (moveButton) {
        moveButton.addEventListener("click", function() {
            startDirectExplorerMove(box);
        });
    }

    if (deleteButton) {
        deleteButton.addEventListener("click", function() {
            deleteExplorerItems(
                box,
                getSelectedExplorerItems(box)
            );
        });
    }

    if (architectureButton) {
        architectureButton.addEventListener("click", function() {
            openArchitectureEditor(box);
        });
    }

    if (moveHereButton) {
        moveHereButton.addEventListener("click", function() {
            confirmDirectExplorerMove(box);
        });
    }

    if (moveCancelButton) {
        moveCancelButton.addEventListener("click", function() {
            cancelDirectExplorerMove(box);
        });
    }

    updateExplorerSelectionState(box);
    updateMoveDestinationBar(box);
}

async function fetchArchitectureState() {
    const response = await fetch(
        urlCommande + "?xpage=plain&action=architecture",
        {
            method: "GET",
            credentials: "same-origin"
        }
    );

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const elements = parsed.querySelectorAll(".architecture-node-data");
    const nodes = {};
    let rootRef = "";

    elements.forEach(function(element) {
        const ref = element.getAttribute("data-ref") || "";
        const type = element.getAttribute("data-type") || "";
        const parentRef = element.getAttribute("data-parent-ref") || "";

        if (!ref) {
            return;
        }

        nodes[ref] = {
            id: ref,
            ref: ref,
            currentRef: ref,
            title: element.getAttribute("data-title") || ref,
            type: type,
            parentRef: parentRef,
            originalParentRef: parentRef
        };

        if (type === "root") {
            rootRef = ref;
        }
    });

    if (!rootRef || !nodes[rootRef]) {
        throw new Error("Impossible de récupérer la racine de l'architecture.");
    }

    const folderIconTemplate = parsed.getElementById(
        "architecture-icon-folder-template"
    );
    const documentIconTemplate = parsed.getElementById(
        "architecture-icon-document-template"
    );

    return {
        rootRef: rootRef,
        nodes: nodes,
        collapsed: {},
        selected: {},
        icons: {
            folder: folderIconTemplate ? folderIconTemplate.innerHTML : "",
            document: documentIconTemplate ? documentIconTemplate.innerHTML : ""
        }
    };
}

function getArchitectureChildren(parentRef) {
    if (!architectureState) {
        return [];
    }

    return Object.keys(architectureState.nodes)
        .map(function(ref) {
            return architectureState.nodes[ref];
        })
        .filter(function(node) {
            return node.parentRef === parentRef;
        })
        .sort(function(a, b) {
            if (a.type !== b.type) {
                if (a.type === "folder") return -1;
                if (b.type === "folder") return 1;
            }

            return a.title.localeCompare(
                b.title,
                undefined,
                { sensitivity: "base" }
            );
        });
}

function architectureWouldCreateCycle(sourceRef, targetRef) {
    if (!architectureState) {
        return true;
    }

    let cursor = targetRef;
    let guard = 0;

    while (cursor && guard < 1000) {
        if (cursor === sourceRef) {
            return true;
        }

        const node = architectureState.nodes[cursor];

        if (!node) {
            break;
        }

        cursor = node.parentRef;
        guard++;
    }

    return false;
}

function setArchitectureCollapsed(nodeRef, collapsed) {
    if (!architectureState) {
        return;
    }

    architectureState.collapsed = architectureState.collapsed || {};
    architectureState.collapsed[nodeRef] = !!collapsed;
}

function setAllArchitectureFoldersCollapsed(collapsed) {
    if (!architectureState) {
        return;
    }

    architectureState.collapsed = architectureState.collapsed || {};

    Object.keys(architectureState.nodes).forEach(function(ref) {
        const node = architectureState.nodes[ref];

        if (node.type === "root" || node.type === "folder") {
            architectureState.collapsed[ref] = !!collapsed;
        }
    });

    // La racine reste visible, mais son contenu peut être plié comme les autres.
    renderArchitectureTree();
}

function renderArchitectureBranch(nodeRef) {
    const node = architectureState.nodes[nodeRef];
    const item = document.createElement("li");
    item.className = "architecture-item";
    item.setAttribute("data-architecture-ref", nodeRef);

    const children = (
        node.type === "root" || node.type === "folder"
    ) ? getArchitectureChildren(nodeRef) : [];

    const hasChildren = children.length > 0;
    const collapsed = !!(
        architectureState.collapsed &&
        architectureState.collapsed[nodeRef]
    );

    if (collapsed) {
        item.classList.add("architecture-item-collapsed");
    }

    const row = document.createElement("div");
    row.className = "architecture-row";
    row.setAttribute("data-architecture-ref", nodeRef);
    row.setAttribute("data-type", node.type);

    if (node.type !== "root") {
        row.draggable = true;
    }

    if (node.type === "root" || node.type === "folder") {
        row.classList.add("architecture-drop-target");
    }

    if (node.parentRef !== node.originalParentRef) {
        row.classList.add("architecture-row-changed");
    }

    if (
        node.type !== "root" &&
        architectureState.selected &&
        architectureState.selected[nodeRef]
    ) {
        row.classList.add("architecture-row-selected");
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "architecture-toggle";

    if (hasChildren) {
        toggle.setAttribute("data-architecture-toggle-ref", nodeRef);
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggle.setAttribute(
            "aria-label",
            collapsed ? "Déplier " + node.title : "Plier " + node.title
        );
    } else {
        toggle.classList.add("architecture-toggle-empty");
        toggle.disabled = true;
        toggle.setAttribute("aria-hidden", "true");
    }

    const nodeIcon = document.createElement("span");
    nodeIcon.className = "architecture-node-icon architecture-xwiki-icon";
    nodeIcon.setAttribute("aria-hidden", "true");

    if (architectureState.icons) {
        nodeIcon.innerHTML =
            node.type === "document"
                ? architectureState.icons.document
                : architectureState.icons.folder;
    }

    const type = document.createElement("span");
    type.className = "architecture-type";
    type.textContent =
        node.type === "root"
            ? "Racine"
            : node.type === "folder"
                ? "Dossier"
                : "Document";

    const title = document.createElement("span");
    title.className = "architecture-title";
    title.textContent = node.title;

    row.appendChild(toggle);

    if (node.type !== "root") {
        const select = document.createElement("input");
        select.type = "checkbox";
        select.className = "architecture-select-input";
        select.setAttribute("data-architecture-select-ref", nodeRef);
        select.setAttribute("aria-label", "Sélectionner " + node.title);
        select.checked = !!(
            architectureState.selected &&
            architectureState.selected[nodeRef]
        );
        select.indeterminate =
            !select.checked &&
            hasSelectedArchitectureDescendant(nodeRef);

        row.appendChild(select);
    } else {
        const selectSpacer = document.createElement("span");
        selectSpacer.className = "architecture-select-spacer";
        selectSpacer.setAttribute("aria-hidden", "true");
        row.appendChild(selectSpacer);
    }

    row.appendChild(nodeIcon);
    row.appendChild(type);
    row.appendChild(title);

    if (hasChildren) {
        const childCount = document.createElement("span");
        childCount.className = "architecture-child-count";
        childCount.textContent = String(children.length);
        row.appendChild(childCount);
    }

    if (node.parentRef !== node.originalParentRef) {
        const changed = document.createElement("span");
        changed.className = "architecture-changed-label";
        changed.textContent = "Déplacé";
        row.appendChild(changed);
    }

    item.appendChild(row);

    if (hasChildren) {
        const list = document.createElement("ul");
        list.className = "architecture-children";

        children.forEach(function(child) {
            list.appendChild(
                renderArchitectureBranch(child.id)
            );
        });

        item.appendChild(list);
    }

    return item;
}

function setArchitectureSelectionRecursive(nodeRef, selected) {
    if (!architectureState || !architectureState.nodes[nodeRef]) {
        return;
    }

    architectureState.selected = architectureState.selected || {};

    const node = architectureState.nodes[nodeRef];

    if (node.type !== "root") {
        architectureState.selected[nodeRef] = !!selected;
    }

    if (node.type === "folder" || node.type === "root") {
        getArchitectureChildren(nodeRef).forEach(function(child) {
            setArchitectureSelectionRecursive(child.id, selected);
        });
    }
}

function refreshArchitectureAncestorSelection(nodeRef) {
    if (!architectureState || !architectureState.nodes[nodeRef]) {
        return;
    }

    let parentRef = architectureState.nodes[nodeRef].parentRef;
    let guard = 0;

    while (
        parentRef &&
        architectureState.nodes[parentRef] &&
        guard < 1000
    ) {
        const parent = architectureState.nodes[parentRef];
        const children = getArchitectureChildren(parentRef);

        if (parent.type !== "root") {
            const allChildrenSelected =
                children.length > 0 &&
                children.every(function(child) {
                    return !!architectureState.selected[child.id];
                });

            architectureState.selected[parentRef] = allChildrenSelected;
        }

        parentRef = parent.parentRef;
        guard++;
    }
}

function hasSelectedArchitectureDescendant(nodeRef) {
    if (!architectureState || !architectureState.nodes[nodeRef]) {
        return false;
    }

    const children = getArchitectureChildren(nodeRef);

    return children.some(function(child) {
        return (
            !!architectureState.selected[child.id] ||
            hasSelectedArchitectureDescendant(child.id)
        );
    });
}

function getSelectedArchitectureNodes() {
    if (!architectureState || !architectureState.selected) {
        return [];
    }

    return Object.keys(architectureState.selected)
        .filter(function(ref) {
            return !!architectureState.selected[ref];
        })
        .map(function(ref) {
            return architectureState.nodes[ref];
        })
        .filter(function(node) {
            return !!node && node.type !== "root";
        });
}

function getTopLevelSelectedArchitectureNodes() {
    const items = getSelectedArchitectureNodes().map(function(node) {
        return {
            ref: node.currentRef || node.ref,
            title: node.title,
            type: node.type,
            node: node
        };
    });

    return filterTopLevelSelection(items);
}

function clearArchitectureSelection() {
    if (!architectureState) {
        return;
    }

    architectureState.selected = {};
    renderArchitectureTree();
}

function getArchitectureChangedNodes() {
    if (!architectureState) {
        return [];
    }

    return Object.keys(architectureState.nodes)
        .map(function(ref) {
            return architectureState.nodes[ref];
        })
        .filter(function(node) {
            return (
                node.type !== "root" &&
                node.parentRef !== node.originalParentRef
            );
        });
}

function updateArchitectureSummary() {
    const count = document.getElementById(
        "architecture-change-count"
    );
    const selectedCount = document.getElementById(
        "architecture-selection-count"
    );
    const deleteButton = document.getElementById(
        "architecture-delete-btn"
    );

    const changed = getArchitectureChangedNodes();
    const selected = getSelectedArchitectureNodes();

    if (count) {
        count.textContent = changed.length > 0
            ? changed.length + " déplacement(s) prévu(s)"
            : "Aucun déplacement prévu";
    }

    if (selectedCount) {
        selectedCount.textContent = selected.length > 0
            ? selected.length + " élément(s) sélectionné(s)"
            : "Aucune sélection";
    }

    if (deleteButton) {
        deleteButton.disabled = selected.length === 0;
        deleteButton.textContent = selected.length > 0
            ? "Supprimer (" + selected.length + ")"
            : "Supprimer";
    }
}

function renderArchitectureTree() {
    const tree = document.getElementById("architecture-tree");

    if (!tree || !architectureState) {
        return;
    }

    tree.innerHTML = "";

    const list = document.createElement("ul");
    list.className = "architecture-root-list";
    list.appendChild(
        renderArchitectureBranch(architectureState.rootRef)
    );

    tree.appendChild(list);
    updateArchitectureSummary();
}

function bindArchitectureDragAndDrop() {
    const tree = document.getElementById("architecture-tree");

    if (!tree || tree.hasAttribute("data-drag-ready")) {
        return;
    }

    tree.addEventListener("click", function(event) {
        const toggle = event.target.closest(".architecture-toggle");

        if (!toggle || toggle.disabled) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const ref = toggle.getAttribute("data-architecture-toggle-ref");

        if (!ref) {
            return;
        }

        const isCollapsed = !!(
            architectureState.collapsed &&
            architectureState.collapsed[ref]
        );

        setArchitectureCollapsed(ref, !isCollapsed);
        renderArchitectureTree();
    });

    tree.addEventListener("change", function(event) {
        const checkbox = event.target.closest(".architecture-select-input");

        if (!checkbox || !architectureState) {
            return;
        }

        const ref = checkbox.getAttribute("data-architecture-select-ref");

        if (!ref || !architectureState.nodes[ref]) {
            return;
        }

        architectureState.selected = architectureState.selected || {};

        // Sélectionner / désélectionner un dossier agit sur toute sa branche.
        setArchitectureSelectionRecursive(ref, checkbox.checked);

        // Si un enfant est décoché après sélection du parent, le parent
        // devient automatiquement partiel au lieu de rester sélectionné.
        refreshArchitectureAncestorSelection(ref);

        renderArchitectureTree();
    });

    tree.addEventListener("dragstart", function(event) {
        if (
            event.target.closest(".architecture-toggle") ||
            event.target.closest(".architecture-select-input")
        ) {
            event.preventDefault();
            return;
        }

        const row = event.target.closest(".architecture-row");

        if (!row) {
            return;
        }

        const ref = row.getAttribute("data-architecture-ref");
        const node = architectureState
            ? architectureState.nodes[ref]
            : null;

        if (!node || node.type === "root") {
            event.preventDefault();
            return;
        }

        architectureDraggedRef = ref;
        row.classList.add("architecture-row-dragging");

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", ref);
        }
    });

    tree.addEventListener("dragend", function() {
        architectureDraggedRef = null;

        tree.querySelectorAll(
            ".architecture-row-dragging, .architecture-drop-hover"
        ).forEach(function(element) {
            element.classList.remove(
                "architecture-row-dragging",
                "architecture-drop-hover"
            );
        });
    });

    tree.addEventListener("dragover", function(event) {
        const target = event.target.closest(
            ".architecture-drop-target"
        );

        if (!target || !architectureDraggedRef) {
            return;
        }

        event.preventDefault();

        tree.querySelectorAll(".architecture-drop-hover")
            .forEach(function(element) {
                element.classList.remove("architecture-drop-hover");
            });

        target.classList.add("architecture-drop-hover");

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
    });

    tree.addEventListener("drop", function(event) {
        const target = event.target.closest(
            ".architecture-drop-target"
        );

        if (!target || !architectureDraggedRef) {
            return;
        }

        event.preventDefault();

        const targetRef = target.getAttribute(
            "data-architecture-ref"
        );
        const sourceRef = architectureDraggedRef;

        architectureDraggedRef = null;

        if (
            !targetRef ||
            sourceRef === targetRef ||
            architectureWouldCreateCycle(sourceRef, targetRef)
        ) {
            alert(
                "Ce déplacement créerait une arborescence invalide."
            );
            renderArchitectureTree();
            return;
        }

        const source = architectureState.nodes[sourceRef];
        const targetNode = architectureState.nodes[targetRef];

        if (
            !source ||
            !targetNode ||
            (
                targetNode.type !== "root" &&
                targetNode.type !== "folder"
            )
        ) {
            return;
        }

        source.parentRef = targetRef;

        // On déplie automatiquement la destination pour montrer
        // immédiatement l'élément qui vient d'y être placé.
        setArchitectureCollapsed(targetRef, false);
        renderArchitectureTree();
    });

    tree.setAttribute("data-drag-ready", "true");
}

function closeArchitectureEditor() {
    const modal = document.getElementById(
        "explorer-architecture-modal"
    );

    if (modal) {
        modal.remove();
    }

    architectureState = null;
    architectureDraggedRef = null;
}

function resetArchitectureEditor() {
    if (!architectureState) {
        return;
    }

    Object.keys(architectureState.nodes).forEach(function(ref) {
        const node = architectureState.nodes[ref];
        node.parentRef = node.originalParentRef;
        node.currentRef = node.ref;
    });

    renderArchitectureTree();
}

function getArchitectureOriginalDepth(node) {
    if (!architectureState) {
        return 0;
    }

    let depth = 0;
    let cursor = node.originalParentRef;
    let guard = 0;

    while (cursor && architectureState.nodes[cursor] && guard < 1000) {
        depth++;
        cursor = architectureState.nodes[cursor].originalParentRef;
        guard++;
    }

    return depth;
}

function updateArchitectureCurrentRefs(
    oldRef,
    newRef
) {
    if (!architectureState || !oldRef || !newRef) {
        return;
    }

    const oldClean = cleanNestedPageRef(oldRef);
    const newClean = cleanNestedPageRef(newRef);

    Object.keys(architectureState.nodes).forEach(function(id) {
        const node = architectureState.nodes[id];
        const currentRef = node.currentRef;

        if (currentRef === oldRef) {
            node.currentRef = newRef;
        } else if (
            currentRef.indexOf(oldClean + ".") === 0
        ) {
            node.currentRef =
                newClean + currentRef.substring(oldClean.length);
        }
    });
}

async function deleteArchitectureSelection(box) {
    if (!architectureState) {
        return;
    }

    const changed = getArchitectureChangedNodes();

    // Supprimer alors que des déplacements ne sont pas encore validés peut
    // rendre la prévisualisation incohérente par rapport à l'arbre réel.
    if (changed.length > 0) {
        alert(
            "Valide ou réinitialise d'abord les déplacements en attente avant de supprimer."
        );
        return;
    }

    const selected = getTopLevelSelectedArchitectureNodes();

    if (selected.length === 0) {
        return;
    }

    const folderCount = selected.filter(function(item) {
        return item.type === "folder";
    }).length;

    let confirmation =
        "Supprimer " + selected.length + " élément(s) sélectionné(s) ?";

    if (folderCount > 0) {
        confirmation +=
            "\n\nLes dossiers sélectionnés seront supprimés avec tous leurs enfants.";
    }

    if (!window.confirm(confirmation)) {
        return;
    }

    const deleteButton = document.getElementById(
        "architecture-delete-btn"
    );
    const failures = [];
    let successCount = 0;

    if (deleteButton) {
        deleteButton.disabled = true;
    }

    for (let i = 0; i < selected.length; i++) {
        const item = selected[i];

        if (deleteButton) {
            deleteButton.textContent =
                "Suppression " + (i + 1) + "/" + selected.length;
        }

        try {
            const result = await postExplorerAction({
                action: "supprimer element",
                source_ref: item.ref
            });

            if (result.indexOf("SUPPRESSION_OK") === -1) {
                throw new Error(getExplorerActionError(result));
            }

            successCount++;
        } catch (error) {
            failures.push(
                item.title + " : " +
                (error && error.message ? error.message : String(error))
            );
        }
    }

    try {
        architectureState = await fetchArchitectureState();
        renderArchitectureTree();
    } catch (error) {
        closeArchitectureEditor();
    }

    explorerSelectionMode = false;
    explorerPendingMove = null;

    if (typeof initialPageRef !== "undefined") {
        LienPerso(initialPageRef, box);
    }

    if (failures.length > 0) {
        alert(
            successCount + " élément(s) supprimé(s) sur " +
            selected.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    }
}

async function validateArchitectureChanges(box) {
    if (!architectureState) {
        return;
    }

    const changes = getArchitectureChangedNodes();

    if (changes.length === 0) {
        closeArchitectureEditor();
        return;
    }

    if (
        !window.confirm(
            "Appliquer " + changes.length +
            " déplacement(s) à l'arborescence ?"
        )
    ) {
        return;
    }

    // Les descendants sont traités d'abord. Cela permet notamment
    // de sortir un enfant d'un dossier avant de déplacer ce dossier.
    changes.sort(function(a, b) {
        return (
            getArchitectureOriginalDepth(b) -
            getArchitectureOriginalDepth(a)
        );
    });

    const validateButton = document.getElementById(
        "architecture-validate-btn"
    );
    const failures = [];
    let successCount = 0;

    if (validateButton) {
        validateButton.disabled = true;
    }

    for (let i = 0; i < changes.length; i++) {
        const node = changes[i];
        const targetNode = architectureState.nodes[
            node.parentRef
        ];

        if (!targetNode) {
            failures.push(
                node.title + " : destination introuvable."
            );
            continue;
        }

        if (validateButton) {
            validateButton.textContent =
                "Déplacement " + (i + 1) + "/" + changes.length;
        }

        try {
            const oldCurrentRef = node.currentRef;
            const result = await moveExplorerItem(
                oldCurrentRef,
                targetNode.currentRef
            );

            if (!result.newRef) {
                throw new Error(
                    "La nouvelle référence n'a pas été retournée."
                );
            }

            updateArchitectureCurrentRefs(
                oldCurrentRef,
                result.newRef
            );

            node.originalParentRef = node.parentRef;
            successCount++;
        } catch (error) {
            failures.push(
                node.title + " : " +
                (
                    error && error.message
                        ? error.message
                        : String(error)
                )
            );
        }
    }

    closeArchitectureEditor();

    explorerPendingMove = null;
    explorerSelectionMode = false;

    if (typeof initialPageRef !== "undefined") {
        LienPerso(initialPageRef, box);
    }

    if (failures.length > 0) {
        alert(
            successCount + " déplacement(s) appliqué(s) sur " +
            changes.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    }
}

async function openArchitectureEditor(box) {
    try {
        architectureState = await fetchArchitectureState();
    } catch (error) {
        alert(
            error && error.message
                ? error.message
                : "Impossible de charger l'architecture."
        );
        return;
    }

    closeArchitectureEditorButKeepState();

    const modal = document.createElement("div");
    modal.id = "explorer-architecture-modal";
    modal.className = "architecture-modal-overlay";

    const panel = document.createElement("div");
    panel.className = "architecture-modal-panel";

    const header = document.createElement("div");
    header.className = "architecture-modal-header";

    const headerText = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = "Architecture documentaire";

    const help = document.createElement("p");
    help.textContent =
        "Fais glisser un document ou un dossier sur le dossier de destination. Les changements ne sont appliqués qu'après validation.";

    headerText.appendChild(title);
    headerText.appendChild(help);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn btn-default";
    closeButton.textContent = "Fermer";
    closeButton.addEventListener("click", function() {
        closeArchitectureEditor();
    });

    header.appendChild(headerText);
    header.appendChild(closeButton);

    const info = document.createElement("div");
    info.className = "architecture-modal-info";

    const count = document.createElement("span");
    count.id = "architecture-change-count";
    count.textContent = "Aucun déplacement prévu";

    const selectionCount = document.createElement("span");
    selectionCount.id = "architecture-selection-count";
    selectionCount.textContent = "Aucune sélection";

    const instruction = document.createElement("span");
    instruction.textContent =
        "Coche les éléments à supprimer ou fais-les glisser pour les déplacer.";

    const treeActions = document.createElement("div");
    treeActions.className = "architecture-tree-actions";

    const collapseAllButton = document.createElement("button");
    collapseAllButton.type = "button";
    collapseAllButton.className = "btn btn-xs btn-default";
    collapseAllButton.textContent = "Tout plier";
    collapseAllButton.addEventListener("click", function() {
        setAllArchitectureFoldersCollapsed(true);
    });

    const expandAllButton = document.createElement("button");
    expandAllButton.type = "button";
    expandAllButton.className = "btn btn-xs btn-default";
    expandAllButton.textContent = "Tout déplier";
    expandAllButton.addEventListener("click", function() {
        setAllArchitectureFoldersCollapsed(false);
    });

    treeActions.appendChild(collapseAllButton);
    treeActions.appendChild(expandAllButton);

    info.appendChild(count);
    info.appendChild(selectionCount);
    info.appendChild(instruction);
    info.appendChild(treeActions);

    const tree = document.createElement("div");
    tree.id = "architecture-tree";
    tree.className = "architecture-tree-editor";

    const footer = document.createElement("div");
    footer.className = "architecture-modal-footer";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.id = "architecture-delete-btn";
    deleteButton.className = "btn btn-danger";
    deleteButton.textContent = "Supprimer";
    deleteButton.disabled = true;
    deleteButton.addEventListener("click", function() {
        deleteArchitectureSelection(box);
    });

    const clearSelectionButton = document.createElement("button");
    clearSelectionButton.type = "button";
    clearSelectionButton.className = "btn btn-default";
    clearSelectionButton.textContent = "Désélectionner";
    clearSelectionButton.addEventListener("click", function() {
        clearArchitectureSelection();
    });

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "btn btn-default";
    resetButton.textContent = "Réinitialiser";
    resetButton.addEventListener("click", function() {
        resetArchitectureEditor();
    });

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-default";
    cancelButton.textContent = "Annuler";
    cancelButton.addEventListener("click", function() {
        closeArchitectureEditor();
    });

    const validateButton = document.createElement("button");
    validateButton.type = "button";
    validateButton.id = "architecture-validate-btn";
    validateButton.className = "btn btn-primary";
    validateButton.textContent = "Valider les déplacements";
    validateButton.addEventListener("click", function() {
        validateArchitectureChanges(box);
    });

    footer.appendChild(deleteButton);
    footer.appendChild(clearSelectionButton);
    footer.appendChild(resetButton);
    footer.appendChild(cancelButton);
    footer.appendChild(validateButton);

    panel.appendChild(header);
    panel.appendChild(info);
    panel.appendChild(tree);
    panel.appendChild(footer);
    modal.appendChild(panel);

    document.body.appendChild(modal);

    renderArchitectureTree();
    bindArchitectureDragAndDrop();
}

function closeArchitectureEditorButKeepState() {
    const existing = document.getElementById(
        "explorer-architecture-modal"
    );

    if (existing) {
        existing.remove();
    }
}

document.addEventListener("DOMContentLoaded", function() {
    const box = document.getElementById("box");

    if (box && typeof initialPageRef !== "undefined") {
        LienPerso(initialPageRef, box);
    }
});
