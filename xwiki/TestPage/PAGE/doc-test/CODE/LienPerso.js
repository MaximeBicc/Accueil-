var explorerPendingMove = null;
var explorerSelectionMode = false;
var architectureState = null;
var architectureDraggedRef = null;
var architectureExplorerBox = null;

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
    initExplorerSearch(box);
    initExplorerManagement(box);
    if (window.DocPropositions && typeof window.DocPropositions.applyPermissions === "function") {
        window.DocPropositions.applyPermissions();
    }
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

function getExplorerActionError(result, fallback, status) {
    const api = window.DocPropositions;
    const message = fallback || "L’opération documentaire n’a pas pu être effectuée.";
    if (api && typeof api.responseError === "function") {
        return api.responseError(String(result || ""), message, status) || message;
    }
    // Une réponse XWiki peut contenir une page d’exception entière : ne jamais
    // l’afficher telle quelle dans les messages destinés à l’utilisateur.
    const codes = {
        ERREUR_DROITS_SERVICE: "La page COMMANDE doit être enregistrée par un administrateur XWiki.",
        ERREUR_DROITS: "Vous n’avez pas les droits nécessaires pour cette opération.",
        ERREUR_DESTINATION_EXISTE: "Un élément portant le même nom existe déjà dans la destination.",
        ERREUR_DESTINATION_DANS_SOURCE: "Un dossier ne peut pas être déplacé dans lui-même ou dans un de ses descendants.",
        ERREUR_DEPLACEMENT_IDENTIQUE: "Cet élément se trouve déjà dans ce dossier.",
        ERREUR_RACINE_PROTEGEE: "La racine doc-test ne peut pas être déplacée ou supprimée.",
        ERREUR_SOURCE_INTROUVABLE: "L’élément source n’existe plus.",
        ERREUR_DESTINATION_INTROUVABLE: "Le dossier de destination n’existe plus.",
        ERREUR_SUPPRESSION: "La suppression a échoué.",
        ERREUR_DEPLACEMENT: "Le déplacement a échoué."
    };
    const code = String(result || "").match(/\bERREUR_[A-Z_]+\b/);
    return code && codes[code[0]] ? codes[code[0]] : message;
}

function getExplorerErrorMessage(error, fallback) {
    const api = window.DocPropositions;
    if (api && typeof api.errorMessage === "function") {
        return api.errorMessage(error, fallback);
    }
    const message = error && typeof error.message === "string" ? error.message : "";
    if (!message || message.length > 240 || /[<>{}]|ERREUR_|Exception|\bat [\w.$]+\(/.test(message)) {
        return getExplorerActionError(message, fallback);
    }
    return message;
}

async function requireExplorerRight(right) {
    const api = window.DocPropositions;
    if (api && api.ready) await api.ready;
    if (!api || typeof api.can !== "function" || typeof api.modeFor !== "function") {
        throw new Error("Les autorisations n’ont pas pu être chargées. Rechargez la page avant de réessayer.");
    }
    if (right === "delete" ? !api.can("delete") : !api.modeFor(right)) {
        throw new Error(right === "delete"
            ? "Vous n’avez pas le droit de supprimer des documents ou des dossiers."
            : "Vous n’avez pas le droit de déplacer des éléments ni de proposer leur déplacement.");
    }
    return api;
}

function documentationCanMove() {
    const api = window.DocPropositions;
    return !!(api && typeof api.modeFor === "function" && api.modeFor("move"));
}

async function postExplorerAction(parameters) {
    const right = parameters.action === "supprimer element" ? "delete" :
        parameters.action === "deplacer element" ? "move" : "";
    if (!right) throw new Error("Cette opération documentaire est inconnue.");
    const api = await requireExplorerRight(right);
    if (typeof api.postActionParameters !== "function" || typeof api.request !== "function") {
        throw new Error("Rechargez la page pour charger les commandes et les autorisations de la documentation.");
    }
    // Les suppressions, comme les déplacements, vérifient la version du
    // document avant le POST ; aucune mutation ne part sans autorisation.
    const values = await api.postActionParameters(right, parameters);
    const response = await api.request(values.action, values);
    const result = typeof response === "string" ? response : response && response.rawText || "";
    if (typeof api.responseError === "function") {
        const error = api.responseError(result, "L’opération documentaire n’a pas pu être effectuée.");
        if (error) throw new Error(error);
    }
    return result;
}

function explorerActionSucceeded(result, code) {
    const parsed = new DOMParser().parseFromString(String(result || ""), "text/html");
    if (parsed.querySelector("#documentation-error,.xwikirenderingerror,.xwikirenderingerrordescription,.box.errormessage")) return false;
    const text = parsed.body ? parsed.body.textContent : "";
    return text.split(/\s+/).indexOf(code) !== -1;
}

async function moveExplorerItem(sourceRef, destinationRef) {
    const result = await postExplorerAction({
        action: "deplacer element",
        source_ref: sourceRef,
        target_parent_ref: destinationRef
    });

    if (explorerActionSucceeded(result, "PROPOSITION_OK")) {
        const proposal = new DOMParser().parseFromString(result, "text/html").getElementById("creation-result");
        return {
            oldRef: sourceRef, newRef: sourceRef, proposed: true,
            proposalRef: proposal ? proposal.getAttribute("data-proposal-ref") || proposal.getAttribute("data-page-ref") : ""
        };
    }

    if (!explorerActionSucceeded(result, "DEPLACEMENT_OK")) {
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
    try {
        await requireExplorerRight("delete");
    } catch (error) {
        alert(getExplorerErrorMessage(error, "Vous n’avez pas le droit de supprimer ces éléments."));
        return;
    }
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

            if (!explorerActionSucceeded(result, "SUPPRESSION_OK")) {
                throw new Error(getExplorerActionError(result));
            }

            successCount++;
        } catch (error) {
            failures.push(
                item.title + " : " +
                getExplorerErrorMessage(error, "L’opération documentaire a échoué.")
            );
        }
    }

    if (deleteButton) deleteButton.textContent = "Supprimer";
    if (successCount > 0) {
        explorerSelectionMode = false;
        const currentRef = getCurrentExplorerPageRef(box);
        if (currentRef) LienPerso(currentRef, box);
    } else {
        updateExplorerSelectionState(box);
    }

    if (failures.length > 0) {
        alert(
            successCount + " élément(s) supprimé(s) sur " +
            filtered.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    } else if (window.DocPropositions && typeof window.DocPropositions.notify === "function") {
        window.DocPropositions.notify(successCount + " élément(s) supprimé(s).");
    }
}

async function startDirectExplorerMove(box) {
    try {
        await requireExplorerRight("move");
    } catch (error) {
        alert(getExplorerErrorMessage(error, "Vous n’avez pas le droit de déplacer ces éléments."));
        return;
    }
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
    try {
        await requireExplorerRight("move");
    } catch (error) {
        alert(getExplorerErrorMessage(error, "Vous n’avez pas le droit de déplacer ces éléments."));
        return;
    }
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

    const verb = documentationMovesAreProposals() ? "Proposer le déplacement de " : "Déplacer ";
    const confirmation = items.length === 1
        ? verb + '"' + items[0].title + '" dans "' + destinationTitle + '" ?'
        : verb + items.length + ' éléments dans "' + destinationTitle + '" ?';

    if (!window.confirm(confirmation)) {
        return;
    }

    const moveHereButton = box.querySelector("#explorer-move-here-btn");

    if (moveHereButton) {
        moveHereButton.disabled = true;
    }

    const failures = [];
    let successCount = 0;
    let proposalCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (moveHereButton) {
            moveHereButton.textContent =
                "Déplacement " + (i + 1) + "/" + items.length;
        }

        try {
            const result = await moveExplorerItem(item.ref, destinationRef);
            if (result.proposed) proposalCount++;
            successCount++;
        } catch (error) {
            failures.push(
                item.title + " : " +
                getExplorerErrorMessage(error, "L’opération documentaire a échoué.")
            );
        }
    }

    if (successCount > 0) {
        explorerPendingMove = null;
        LienPerso(destinationRef, box);
    }

    if (failures.length > 0) {
        alert(
            successCount + " opération(s) enregistrée(s) sur " +
            items.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    }

    if (moveHereButton) {
        moveHereButton.disabled = false;
        moveHereButton.textContent = "Déplacer ici";
    }
    if (proposalCount > 0) await openDocumentationProposals(box);
}

function normalizeExplorerSearchText(value) {
    let text = String(value || "").toLowerCase();

    if (text.normalize) {
        text = text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    return text.trim();
}

function parseExplorerSearchTags(value) {
    const seen = {};

    return String(value || "")
        .split(/[,;\n]+/)
        .map(function(tag) {
            return tag.trim();
        })
        .filter(function(tag) {
            if (!tag) return false;

            const key = normalizeExplorerSearchText(tag);

            if (seen[key]) return false;

            seen[key] = true;
            return true;
        });
}

function getExplorerSearchDescendants(state, rootRef) {
    const result = [];
    const byParent = {};

    Object.keys(state.nodes).forEach(function(ref) {
        const node = state.nodes[ref];

        if (!byParent[node.parentRef]) {
            byParent[node.parentRef] = [];
        }

        byParent[node.parentRef].push(node);
    });

    function walk(parentRef) {
        (byParent[parentRef] || []).forEach(function(node) {
            if (node.type === "folder" || node.type === "document") {
                result.push(node);
            }

            if (node.type === "folder") {
                walk(node.ref);
            }
        });
    }

    walk(rootRef);
    return result;
}

function getExplorerSearchNodePath(state, node, rootRef, rootTitle) {
    const labels = [];
    let cursor = node.parentRef;
    let guard = 0;

    while (
        cursor &&
        cursor !== rootRef &&
        state.nodes[cursor] &&
        guard < 1000
    ) {
        labels.unshift(state.nodes[cursor].title);
        cursor = state.nodes[cursor].parentRef;
        guard++;
    }

    labels.unshift(rootTitle || "Dossier actuel");
    return labels.join(" > ");
}

function populateExplorerTagFilterFromNodes(box, nodes) {
    const tagFilter = box.querySelector("#explorer-tag-filter");

    if (!tagFilter) return;

    const currentValue = tagFilter.value;
    const tags = [];
    const seen = {};

    nodes.forEach(function(node) {
        if (node.type !== "document") return;

        parseExplorerSearchTags(node.tags).forEach(function(tag) {
            const key = normalizeExplorerSearchText(tag);

            if (!seen[key]) {
                seen[key] = true;
                tags.push(tag);
            }
        });
    });

    tags.sort(function(a, b) {
        return a.localeCompare(
            b,
            undefined,
            { sensitivity: "base" }
        );
    });

    tagFilter.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Tags";
    tagFilter.appendChild(allOption);

    tags.forEach(function(tag) {
        const option = document.createElement("option");
        option.value = normalizeExplorerSearchText(tag);
        option.textContent = tag;
        tagFilter.appendChild(option);
    });

    tagFilter.disabled = tags.length === 0;

    if (
        currentValue &&
        Array.prototype.some.call(
            tagFilter.options,
            function(option) {
                return option.value === currentValue;
            }
        )
    ) {
        tagFilter.value = currentValue;
    }
}

function createExplorerSearchResultNode(box, state, node) {
    const row = document.createElement("li");
    row.className = "explorer-search-result-row";
    row.setAttribute("data-ref", node.ref);
    row.setAttribute("data-type", node.type);

    const clickable = document.createElement("span");
    clickable.className =
        "explorer-search-result-item " +
        (
            node.type === "folder"
                ? "folder explorer-search-folder"
                : "document-item explorer-search-document"
        );

    const icon = document.createElement("span");
    icon.className = "explorer-search-result-icon";
    icon.innerHTML =
        node.type === "folder"
            ? state.icons.folder
            : state.icons.document;

    const text = document.createElement("span");
    text.className = "explorer-search-result-text";

    const title = document.createElement("span");
    title.className = "explorer-search-result-title";
    title.textContent = node.title;

    const path = document.createElement("span");
    path.className = "explorer-search-result-path";
    path.textContent = getExplorerSearchNodePath(
        state,
        node,
        state.searchRootRef,
        state.searchRootTitle
    );

    text.appendChild(title);
    text.appendChild(path);
    clickable.appendChild(icon);
    clickable.appendChild(text);

    const type = document.createElement("span");
    type.className = "explorer-search-result-type";
    type.textContent =
        node.type === "folder"
            ? "Dossier"
            : "Document";

    if (node.type === "folder") {
        clickable.setAttribute("data-full-name", node.ref);

        clickable.addEventListener("click", function() {
            LienPerso(node.ref, box);
        });
    } else {
        clickable.setAttribute("data-full-name", node.ref);
        clickable.setAttribute("data-title", node.title);
        clickable.setAttribute("data-creator", node.creator || "");
        clickable.setAttribute("data-created", node.created || "");
        clickable.setAttribute("data-modified", node.modified || "");
        clickable.setAttribute("data-desc", node.description || "");
        clickable.setAttribute("data-tags", node.tags || "");
        clickable.setAttribute("data-url", node.url || "");
        clickable.setAttribute(
            "data-url-preview",
            node.urlPreview || ""
        );
    }

    row.appendChild(clickable);
    row.appendChild(type);
    return row;
}

function renderExplorerRecursiveSearch(box) {
    const state = box._explorerSearchState;
    const searchInput = box.querySelector("#explorer-search-input");
    const typeFilter = box.querySelector("#explorer-type-filter");
    const tagFilter = box.querySelector("#explorer-tag-filter");
    const count = box.querySelector("#explorer-search-count");
    const empty = box.querySelector("#explorer-search-empty");
    const currentList = box.querySelector("#explorer-current-list");
    const resultsList = box.querySelector("#explorer-search-results");

    if (
        !state ||
        !state.loaded ||
        !searchInput ||
        !typeFilter ||
        !tagFilter ||
        !currentList ||
        !resultsList
    ) {
        return;
    }

    const query = normalizeExplorerSearchText(searchInput.value);
    const selectedType = typeFilter.value;
    const selectedTag = tagFilter.value;
    const active = !!(query || selectedType || selectedTag);

    if (!active) {
        currentList.style.display = "";
        resultsList.style.display = "none";
        resultsList.innerHTML = "";

        if (empty) empty.style.display = "none";
        if (count) count.textContent = "";
        return;
    }

    if (selectedType === "folder" && selectedTag) {
        tagFilter.value = "";
        return renderExplorerRecursiveSearch(box);
    }

    const matches = state.nodes.filter(function(node) {
        const title = normalizeExplorerSearchText(node.title);
        const description = normalizeExplorerSearchText(
            node.description
        );
        const ref = normalizeExplorerSearchText(node.ref);
        const normalizedTags = parseExplorerSearchTags(
            node.tags
        ).map(normalizeExplorerSearchText);

        const textMatch =
            !query ||
            title.indexOf(query) !== -1 ||
            description.indexOf(query) !== -1 ||
            ref.indexOf(query) !== -1 ||
            normalizedTags.some(function(tag) {
                return tag.indexOf(query) !== -1;
            });

        const typeMatch =
            !selectedType || node.type === selectedType;

        const tagMatch =
            !selectedTag ||
            (
                node.type === "document" &&
                normalizedTags.indexOf(selectedTag) !== -1
            );

        return textMatch && typeMatch && tagMatch;
    });

    currentList.style.display = "none";
    resultsList.innerHTML = "";

    matches.forEach(function(node) {
        resultsList.appendChild(
            createExplorerSearchResultNode(
                box,
                state.architecture,
                node
            )
        );
    });

    resultsList.style.display = "";

    if (count) {
        count.textContent =
            matches.length + " résultat(s)";
    }

    if (empty) {
        empty.style.display =
            matches.length === 0
                ? "block"
                : "none";
    }
}

async function loadExplorerRecursiveSearchData(box) {
    const currentRef = getCurrentExplorerPageRef(box);
    const currentTitle = getCurrentExplorerPageTitle(box);
    const tagFilter = box.querySelector("#explorer-tag-filter");
    const count = box.querySelector("#explorer-search-count");

    if (!currentRef) return;

    box._explorerSearchState = {
        loaded: false,
        nodes: [],
        architecture: null
    };

    if (count) {
        count.textContent = "Chargement...";
    }

    try {
        const architecture = await fetchArchitectureState();
        architecture.searchRootRef = currentRef;
        architecture.searchRootTitle = currentTitle;

        const nodes = getExplorerSearchDescendants(
            architecture,
            currentRef
        );

        box._explorerSearchState = {
            loaded: true,
            nodes: nodes,
            architecture: architecture
        };

        populateExplorerTagFilterFromNodes(box, nodes);

        if (count) {
            count.textContent = "";
        }

        renderExplorerRecursiveSearch(box);
    } catch (error) {
        console.error(
            "Impossible de charger la recherche récursive :",
            error
        );

        if (count) {
            count.textContent =
                "Recherche dans les sous-dossiers indisponible";
        }

        if (tagFilter) {
            tagFilter.disabled = true;
        }
    }
}

function initExplorerSearch(box) {
    const searchInput = box.querySelector("#explorer-search-input");
    const typeFilter = box.querySelector("#explorer-type-filter");
    const tagFilter = box.querySelector("#explorer-tag-filter");
    const resetButton = box.querySelector("#explorer-search-reset");

    if (!searchInput || !typeFilter || !tagFilter) {
        return;
    }

    function refresh() {
        renderExplorerRecursiveSearch(box);
    }

    searchInput.addEventListener("input", refresh);
    typeFilter.addEventListener("change", function() {
        const foldersOnly = typeFilter.value === "folder";

        if (foldersOnly && tagFilter.value) {
            tagFilter.value = "";
        }

        tagFilter.disabled =
            foldersOnly ||
            (
                box._explorerSearchState &&
                box._explorerSearchState.loaded &&
                !box._explorerSearchState.nodes.some(function(node) {
                    return (
                        node.type === "document" &&
                        parseExplorerSearchTags(node.tags).length > 0
                    );
                })
            );

        refresh();
    });
    tagFilter.addEventListener("change", refresh);

    if (resetButton) {
        resetButton.addEventListener("click", function() {
            searchInput.value = "";
            typeFilter.value = "";
            tagFilter.value = "";

            if (
                box._explorerSearchState &&
                box._explorerSearchState.loaded
            ) {
                populateExplorerTagFilterFromNodes(
                    box,
                    box._explorerSearchState.nodes
                );
            }

            renderExplorerRecursiveSearch(box);
            searchInput.focus();
        });
    }

    loadExplorerRecursiveSearchData(box);
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

    box.querySelectorAll("#explorer-proposals-btn, #doc-proposals").forEach(function(button) {
        if (button.hasAttribute("data-doc-proposals-ready")) return;
        button.setAttribute("data-doc-proposals-ready", "true");
        button.addEventListener("click", function() {
            openDocumentationProposals(box);
        });
    });

    box.querySelectorAll("#explorer-trash-btn, #doc-trash").forEach(function(button) {
        if (button.hasAttribute("data-doc-trash-ready")) return;
        button.setAttribute("data-doc-trash-ready", "true");
        button.addEventListener("click", function() {
            openDocumentationTrash(box);
        });
    });

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

function documentationCanReview() {
    return !!(window.DocPropositions && window.DocPropositions.can("review"));
}

function documentationMovesAreProposals() {
    return !!(window.DocPropositions && window.DocPropositions.modeFor && window.DocPropositions.modeFor("move") === "proposal");
}

function documentationProposalLabel(node) {
    const labels = {
        create: "Création proposée",
        import: "Import proposé",
        move: "Déplacement proposé",
        modify: "Métadonnées proposées",
        content: "Contenu proposé"
    };
    return node.status === "rejected" ? "Refusée" : (labels[node.operation] || "Proposition");
}

async function readDocumentationProposals(mode) {
    let result;
    if (window.DocPropositions && typeof window.DocPropositions.request === "function") {
        result = await window.DocPropositions.request(mode, {});
    } else {
        const response = await fetch(urlCommande + "?xpage=plain&action=" + encodeURIComponent(mode), {
            credentials: "same-origin"
        });
        if (!response.ok) throw new Error("Impossible de charger les propositions.");
        result = await response.text();
    }
    const parsed = typeof result === "string"
        ? new DOMParser().parseFromString(result, "text/html")
        : result;
    if (!parsed || typeof parsed.querySelectorAll !== "function") {
        throw new Error("Réponse des propositions invalide.");
    }
    const error = parsed.querySelector(".doc-proposal-error");
    if (error) throw new Error(error.textContent || "Accès aux propositions refusé.");
    return Array.prototype.map.call(parsed.querySelectorAll(".doc-proposal-data"), function(element) {
        function data(name) { return element.getAttribute("data-" + name) || ""; }
        const ref = data("ref");
        return {
            id: "proposal:" + ref, ref: ref, currentRef: ref, proposalRef: ref,
            proposed: true, type: data("type") === "folder" ? "folder" : "document",
            title: data("title") || ref, operation: data("operation"),
            targetParentRef: data("parent-ref"), parentProposalRef: data("parent-proposal-ref"),
            sourceRef: data("source-ref"), batchId: data("batch-id"),
            status: mode === "corbeille" ? "rejected" : data("status"),
            creator: data("author"), created: data("submitted-at"),
            description: data("description"), tags: data("tags"), kind: data("kind"),
            url: data("url"), urlPreview: data("url-preview"), version: data("version"),
            reviewComment: data("review-comment"), rejectedAt: data("deleted-at"), expiresAt: data("expires-at"),
            canRestore: /^(true|1)$/.test(data("can-restore"))
        };
    }).filter(function(node) { return !!node.proposalRef; });
}

function mergeDocumentationProposals(nodes) {
    const state = architectureState;
    const groups = {};
    nodes.forEach(function(node) { state.nodes[node.id] = node; });
    nodes.forEach(function(node) {
        const proposedParent = "proposal:" + node.parentProposalRef;
        const source = state.nodes[node.sourceRef];
        let parent = node.parentProposalRef && state.nodes[proposedParent]
            ? proposedParent
            : node.targetParentRef;
        if (!state.nodes[parent]) parent = source && state.nodes[source.parentRef] ? source.parentRef : state.rootRef;
        if (node.batchId && !node.parentProposalRef) {
            const groupId = "proposal-batch:" + node.batchId + ":" + parent;
            if (!groups[groupId]) {
                groups[groupId] = {
                    id: groupId, ref: groupId, type: "folder", proposed: true, proposalGroup: true,
                    title: "Import groupé", batchId: node.batchId, status: node.status,
                    parentRef: parent, originalParentRef: parent
                };
                state.nodes[groupId] = groups[groupId];
            }
            parent = groupId;
        }
        // Une proposition incohérente reste consultable à la racine sans créer de boucle.
        node.parentRef = parent === node.id ? state.rootRef : parent;
        node.originalParentRef = node.parentRef;
    });
    nodes.forEach(function(node) {
        if (architectureWouldCreateCycle(node.id, node.parentRef)) {
            node.parentRef = state.rootRef;
            node.originalParentRef = state.rootRef;
        }
    });
    state.proposalCount = nodes.length;
}

async function setDocumentationProposalOverlay(mode) {
    if (!architectureState) return;
    const state = architectureState;
    const requestNumber = state.overlayRequest = (state.overlayRequest || 0) + 1;
    const nodes = mode ? await readDocumentationProposals(mode) : [];
    if (architectureState !== state || state.overlayRequest !== requestNumber) return;
    Object.keys(state.nodes).forEach(function(ref) {
        if (state.nodes[ref].proposed) delete state.nodes[ref];
    });
    state.overlayMode = mode || "";
    state.selected = {};
    state.proposalCount = 0;
    if (mode) mergeDocumentationProposals(nodes);
    const details = document.getElementById("architecture-proposal-details");
    if (details) details.hidden = true;
    const modal = document.getElementById("explorer-architecture-modal");
    if (modal) {
        modal.classList.toggle("architecture-review-mode", !!mode);
        modal.querySelectorAll("[data-architecture-overlay]").forEach(function(button) {
            button.setAttribute("aria-pressed", button.getAttribute("data-architecture-overlay") === state.overlayMode ? "true" : "false");
        });
    }
    const description = document.getElementById("architecture-instruction");
    if (description) description.textContent = mode === "corbeille"
        ? "Les propositions refusées restent visibles sept jours dans la corbeille."
        : mode === "propositions"
            ? "Les propositions en couleur sont ajoutées à l’arbre à leur destination prévue. Examine chaque élément avant de le valider ou de le refuser."
            : "Coche les éléments à supprimer ou fais-les glisser pour les déplacer.";
    renderArchitectureTree();
}

function documentationSafeURL(url) {
    if (!url) return "";
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.origin === window.location.origin && /^(https?:)$/.test(parsed.protocol) ? parsed.href : "";
    } catch (error) { return ""; }
}

function showDocumentationProposalDetails(node) {
    const details = document.getElementById("architecture-proposal-details");
    if (!details || !node || !node.proposalRef) return;
    details.innerHTML = "";
    details.hidden = false;
    const header = document.createElement("div");
    header.className = "architecture-proposal-details-header";
    const title = document.createElement("strong");
    title.textContent = node.title + " — " + documentationProposalLabel(node);
    header.appendChild(title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-xs btn-default";
    close.textContent = "Fermer l’aperçu";
    close.addEventListener("click", function() { details.hidden = true; });
    header.appendChild(close);
    details.appendChild(header);
    const metadata = document.createElement("p");
    const parts = [];
    if (node.creator) parts.push("Proposée par " + node.creator);
    if (node.created) parts.push(node.created);
    if (node.batchId) parts.push("Import groupé");
    if (node.sourceRef) {
        const source = architectureState && architectureState.nodes[node.sourceRef];
        parts.push("Élément d’origine : " + (source ? source.title : node.sourceRef));
    }
    if (node.parentProposalRef) {
        const parent = architectureState && architectureState.nodes["proposal:" + node.parentProposalRef];
        parts.push("Dossier proposé : " + (parent ? parent.title : "en attente de validation"));
    }
    if (node.reviewComment) parts.push("Motif du refus : " + node.reviewComment);
    if (node.expiresAt) parts.push("Suppression de la corbeille : " + node.expiresAt);
    metadata.textContent = parts.join(" · ");
    details.appendChild(metadata);
    if (node.description || node.tags) {
        const proposedMetadata = document.createElement("p");
        proposedMetadata.textContent = [node.description, node.tags && "Mots-clés : " + node.tags].filter(Boolean).join(" · ");
        details.appendChild(proposedMetadata);
    }
    const openURL = documentationSafeURL(node.url);
    if (openURL) {
        const open = document.createElement("a");
        open.href = openURL;
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        open.className = "btn btn-xs btn-default";
        open.textContent = "Ouvrir la proposition dans un nouvel onglet";
        details.appendChild(open);
    }
    const previewURL = documentationSafeURL(node.urlPreview);
    if (node.type === "document" && previewURL) {
        const frame = document.createElement("iframe");
        frame.src = previewURL;
        frame.title = "Aperçu de la proposition : " + node.title;
        frame.className = "architecture-proposal-preview";
        // Le lecteur PDF natif de Chromium ne fonctionne pas dans une iframe sandboxée.
        // Le serveur ne marque PDF que les pièces jointes de type application/pdf.
        if (node.kind !== "pdf") frame.setAttribute("sandbox", "allow-same-origin allow-downloads");
        details.appendChild(frame);
    }
}

async function decideDocumentationProposal(node, decision) {
    if (!node || !window.DocPropositions) return;
    if (!documentationCanReview() && !(decision === "restore" && node.status === "rejected" && node.canRestore)) return;
    let reason = "";
    if (decision === "reject") {
        reason = window.prompt("Motif du refus (obligatoire) :", "");
        if (reason === null) return;
        if (!reason.trim()) { alert("Indiquez un motif pour refuser la proposition."); return; }
    }
    const modal = document.getElementById("explorer-architecture-modal");
    const buttons = modal ? modal.querySelectorAll("[data-architecture-proposal-decision]") : [];
    buttons.forEach(function(button) { button.disabled = true; });
    try {
        await window.DocPropositions.proposalAction(node.proposalRef, decision, reason, node.version);
        const mode = architectureState && architectureState.overlayMode;
        const collapsed = architectureState && architectureState.collapsed;
        architectureState = await fetchArchitectureState();
        architectureState.collapsed = collapsed || {};
        await setDocumentationProposalOverlay(mode);
        if (architectureExplorerBox && typeof initialPageRef !== "undefined") LienPerso(initialPageRef, architectureExplorerBox);
    } catch (error) {
        alert(error && error.message ? error.message : "Impossible d’enregistrer cette décision.");
    } finally {
        buttons.forEach(function(button) { button.disabled = false; });
    }
}

function openDocumentationProposals(box) {
    return openArchitectureEditor(box || document.getElementById("box"), "propositions");
}

function openDocumentationTrash(box) {
    return openArchitectureEditor(box || document.getElementById("box"), "corbeille");
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
            originalParentRef: parentRef,
            description: element.getAttribute("data-desc") || "",
            tags: element.getAttribute("data-tags") || "",
            creator: element.getAttribute("data-creator") || "",
            created: element.getAttribute("data-created") || "",
            modified: element.getAttribute("data-modified") || "",
            url: element.getAttribute("data-url") || "",
            urlPreview: element.getAttribute("data-url-preview") || ""
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

    if (node.proposed) {
        row.classList.add("architecture-row-proposed");
        row.classList.toggle("architecture-row-rejected", node.status === "rejected");
    }

    if (node.type !== "root" && !architectureState.overlayMode && documentationCanMove()) {
        row.draggable = true;
    }

    if (!architectureState.overlayMode && documentationCanMove() && (node.type === "root" || node.type === "folder")) {
        row.classList.add("architecture-drop-target");
    }

    if (!node.proposed && node.parentRef !== node.originalParentRef) {
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
    if (node.proposalRef) {
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");
        title.setAttribute("data-architecture-proposal-preview", nodeRef);
        title.setAttribute("aria-label", "Examiner la proposition : " + node.title);
    }

    row.appendChild(toggle);

    if (node.type !== "root" && !architectureState.overlayMode) {
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

    if (node.proposed) {
        const badge = document.createElement("span");
        badge.className = "architecture-proposal-status";
        badge.textContent = node.proposalGroup ? "Groupe d’import" : documentationProposalLabel(node);
        row.appendChild(badge);

        if (node.proposalRef) {
            const actions = document.createElement("span");
            actions.className = "architecture-proposal-actions";
            const preview = document.createElement("button");
            preview.type = "button";
            preview.className = "btn btn-xs btn-default";
            preview.textContent = node.type === "document" ? "Aperçu" : "Détails";
            preview.setAttribute("data-architecture-proposal-preview", nodeRef);
            actions.appendChild(preview);

            if (documentationCanReview() || (node.status === "rejected" && node.canRestore)) {
                const decisions = node.status === "rejected"
                    ? [["restore", "Restaurer"]]
                    : [["accept", "Valider"], ["reject", "Refuser"]];
                decisions.forEach(function(decision) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "btn btn-xs " + (decision[0] === "reject" ? "btn-danger" : "btn-default");
                    button.textContent = decision[1];
                    button.setAttribute("data-architecture-proposal-decision", decision[0]);
                    button.setAttribute("data-architecture-proposal-ref", nodeRef);
                    actions.appendChild(button);
                });
            }
            row.appendChild(actions);
        }
    }

    if (hasChildren) {
        const childCount = document.createElement("span");
        childCount.className = "architecture-child-count";
        childCount.textContent = String(children.length);
        row.appendChild(childCount);
    }

    if (!node.proposed && node.parentRef !== node.originalParentRef) {
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
            return !!node && node.type !== "root" && !node.proposed;
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
                !node.proposed &&
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
        count.textContent = architectureState.overlayMode
            ? architectureState.proposalCount + (architectureState.overlayMode === "corbeille" ? " proposition(s) refusée(s)" : " proposition(s) en attente")
            : changed.length > 0
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
    if (window.DocPropositions && typeof window.DocPropositions.applyPermissions === "function") {
        window.DocPropositions.applyPermissions();
    }
}

function bindArchitectureDragAndDrop() {
    const tree = document.getElementById("architecture-tree");

    if (!tree || tree.hasAttribute("data-drag-ready")) {
        return;
    }

    tree.addEventListener("click", function(event) {
        const decision = event.target.closest("[data-architecture-proposal-decision]");
        const preview = event.target.closest("[data-architecture-proposal-preview]");
        if (decision || preview) {
            event.preventDefault();
            event.stopPropagation();
            const nodeRef = decision
                ? decision.getAttribute("data-architecture-proposal-ref")
                : preview.getAttribute("data-architecture-proposal-preview");
            const node = architectureState && architectureState.nodes[nodeRef];
            if (decision) decideDocumentationProposal(node, decision.getAttribute("data-architecture-proposal-decision"));
            else showDocumentationProposalDetails(node);
            return;
        }
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

    tree.addEventListener("keydown", function(event) {
        if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-architecture-proposal-preview][role=button]")) {
            event.preventDefault();
            event.target.click();
        }
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

        if (!node || node.type === "root" || node.proposed || architectureState.overlayMode || !documentationCanMove()) {
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
        if (!documentationCanMove()) {
            architectureDraggedRef = null;
            alert("Vous n’avez pas le droit de déplacer des éléments ni de proposer leur déplacement.");
            return;
        }

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
            source.proposed ||
            targetNode.proposed ||
            architectureState.overlayMode ||
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
    try {
        await requireExplorerRight("delete");
    } catch (error) {
        alert(getExplorerErrorMessage(error, "Vous n’avez pas le droit de supprimer ces éléments."));
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

            if (!explorerActionSucceeded(result, "SUPPRESSION_OK")) {
                throw new Error(getExplorerActionError(result));
            }

            successCount++;
        } catch (error) {
            failures.push(
                item.title + " : " +
                getExplorerErrorMessage(error, "L’opération documentaire a échoué.")
            );
        }
    }

    if (successCount > 0) {
        try {
            architectureState = await fetchArchitectureState();
            renderArchitectureTree();
        } catch (error) {
            closeArchitectureEditor();
        }
        explorerSelectionMode = false;
        explorerPendingMove = null;
        if (typeof initialPageRef !== "undefined") LienPerso(initialPageRef, box);
    } else {
        updateArchitectureSummary();
    }

    if (failures.length > 0) {
        alert(
            successCount + " élément(s) supprimé(s) sur " +
            selected.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    } else if (window.DocPropositions && typeof window.DocPropositions.notify === "function") {
        window.DocPropositions.notify(successCount + " élément(s) supprimé(s).");
    }
}

async function validateArchitectureChanges(box) {
    if (!architectureState) {
        return;
    }
    try {
        await requireExplorerRight("move");
    } catch (error) {
        alert(getExplorerErrorMessage(error, "Vous n’avez pas le droit de déplacer ces éléments."));
        return;
    }

    const changes = getArchitectureChangedNodes();

    if (changes.length === 0) {
        closeArchitectureEditor();
        return;
    }

    if (
        !window.confirm(
            (documentationMovesAreProposals() ? "Proposer " : "Appliquer ") + changes.length +
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
    let proposalCount = 0;

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

            if (result.proposed) {
                proposalCount++;
                successCount++;
                continue;
            }

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
                getExplorerErrorMessage(error, "Le déplacement a échoué.")
            );
        }
    }

    if (successCount > 0) {
        closeArchitectureEditor();
        explorerPendingMove = null;
        explorerSelectionMode = false;
        if (typeof initialPageRef !== "undefined") LienPerso(initialPageRef, box);
    } else if (validateButton) {
        validateButton.disabled = false;
        validateButton.textContent = documentationMovesAreProposals()
            ? "Proposer les déplacements" : "Valider les déplacements";
    }

    if (failures.length > 0) {
        alert(
            successCount + " opération(s) enregistrée(s) sur " +
            changes.length + ".\n\nÉchecs :\n" +
            failures.join("\n")
        );
    }
    if (proposalCount > 0) await openDocumentationProposals(box);
}

async function openArchitectureEditor(box, overlayMode) {
    const existing = document.getElementById("explorer-architecture-modal");
    if (existing && architectureState && overlayMode) {
        try {
            await setDocumentationProposalOverlay(architectureState.overlayMode === overlayMode ? "" : overlayMode);
        } catch (error) {
            alert(error && error.message ? error.message : "Impossible de charger les propositions.");
        }
        return;
    }
    try {
        if (window.DocPropositions && window.DocPropositions.ready) await window.DocPropositions.ready;
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
    architectureExplorerBox = box;

    const modal = document.createElement("div");
    modal.id = "explorer-architecture-modal";
    modal.className = "architecture-modal-overlay";

    const panel = document.createElement("div");
    panel.className = "architecture-modal-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "architecture-modal-title");

    const header = document.createElement("div");
    header.className = "architecture-modal-header";

    const headerText = document.createElement("div");

    const title = document.createElement("h3");
    title.id = "architecture-modal-title";
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
    instruction.id = "architecture-instruction";
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

    [["propositions", "Propositions"], ["corbeille", "Corbeille"]].forEach(function(view) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-xs btn-default";
        button.textContent = view[1];
        button.setAttribute("data-architecture-overlay", view[0]);
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", async function() {
            button.disabled = true;
            try {
                await setDocumentationProposalOverlay(architectureState.overlayMode === view[0] ? "" : view[0]);
            } catch (error) {
                alert(error && error.message ? error.message : "Impossible de charger les propositions.");
            } finally { button.disabled = false; }
        });
        treeActions.appendChild(button);
    });

    info.appendChild(count);
    info.appendChild(selectionCount);
    info.appendChild(instruction);
    info.appendChild(treeActions);

    const tree = document.createElement("div");
    tree.id = "architecture-tree";
    tree.className = "architecture-tree-editor";

    const details = document.createElement("section");
    details.id = "architecture-proposal-details";
    details.className = "architecture-proposal-details";
    details.setAttribute("aria-label", "Détails de la proposition");
    details.hidden = true;

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
    clearSelectionButton.setAttribute("data-architecture-published-action", "true");
    clearSelectionButton.textContent = "Désélectionner";
    clearSelectionButton.addEventListener("click", function() {
        clearArchitectureSelection();
    });

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "btn btn-default";
    resetButton.setAttribute("data-architecture-published-action", "true");
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
    validateButton.textContent = documentationMovesAreProposals() ? "Proposer les déplacements" : "Valider les déplacements";
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
    panel.appendChild(details);
    panel.appendChild(footer);
    modal.appendChild(panel);

    document.body.appendChild(modal);

    renderArchitectureTree();
    bindArchitectureDragAndDrop();
    if (overlayMode) {
        try {
            await setDocumentationProposalOverlay(overlayMode);
        } catch (error) {
            alert(error && error.message ? error.message : "Impossible de charger les propositions.");
        }
    }
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
