let branchImportSelection = null;

function ajouterFichier() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    const content = document.getElementById("popupContent");

    branchImportSelection = null;

    content.innerHTML = `
<h4>Ajouter un dossier</h4>
<input type="hidden" name="action" value="ajouter un fichier" />
<input type="hidden" name="type" value="folder" />
<input type="hidden" name="page" value="${parentPage}" />

<div class="form-group">
    <label for="folder-name-input">Créer un dossier vide</label>
    <input id="folder-name-input" class="form-control" type="text" name="nom_fichier"
        placeholder="Nom du dossier" />
</div>

<div class="branch-import-separator">
    <span>ou</span>
</div>

<div class="form-group">
    <label>Importer une arborescence depuis l'ordinateur</label>
    <div class="branch-import-actions">
        <button id="branch-folder-picker-btn" type="button" class="btn btn-default">
            Parcourir un dossier
        </button>
        <button id="branch-folder-clear-btn" type="button" class="btn btn-default" style="display:none;">
            Retirer la sélection
        </button>
    </div>

    <input id="branch-folder-input" type="file" webkitdirectory directory multiple
        style="display:none;" />

    <p class="help-block">
        Les dossiers, sous-dossiers et fichiers sont recréés dans la même arborescence.
        Les Word deviennent des pages XWiki éditables, les PDF gardent leur affichage,
        et les autres fichiers sont conservés comme pièces jointes sur leur propre page.
    </p>

    <div id="branch-import-preview"></div>
</div>
`;

    const folderNameInput = document.getElementById("folder-name-input");
    const pickerButton = document.getElementById("branch-folder-picker-btn");
    const clearButton = document.getElementById("branch-folder-clear-btn");
    const fallbackInput = document.getElementById("branch-folder-input");

    if (pickerButton) {
        pickerButton.addEventListener("click", async function() {
            await chooseBranchDirectory();
        });
    }

    if (clearButton) {
        clearButton.addEventListener("click", function() {
            clearBranchImportSelection();
        });
    }

    if (fallbackInput) {
        fallbackInput.addEventListener("change", function() {
            const files = Array.prototype.slice.call(fallbackInput.files || []);
            if (!files.length) return;

            const root = buildBranchTreeFromFiles(files);
            prepareBranchTree(root);

            branchImportSelection = {
                root: root,
                sourceMode: "webkitdirectory"
            };

            if (folderNameInput) {
                folderNameInput.value = "";
                folderNameInput.disabled = true;
            }

            renderBranchImportPreview();
        });
    }

    document.getElementById("popup").style.display = "block";
}

async function chooseBranchDirectory() {
    const fallbackInput = document.getElementById("branch-folder-input");

    // Cette API permet de récupérer aussi les dossiers vides.
    if (window.showDirectoryPicker) {
        try {
            const handle = await window.showDirectoryPicker();
            const root = await buildBranchTreeFromDirectoryHandle(handle);
            prepareBranchTree(root);

            branchImportSelection = {
                root: root,
                sourceMode: "directory-handle"
            };

            const folderNameInput = document.getElementById("folder-name-input");
            if (folderNameInput) {
                folderNameInput.value = "";
                folderNameInput.disabled = true;
            }

            renderBranchImportPreview();
            return;
        } catch (error) {
            if (error && error.name === "AbortError") {
                return;
            }

            console.warn("Sélecteur de dossier natif indisponible, utilisation du mode de repli.", error);
        }
    }

    // Repli compatible avec les navigateurs qui supportent webkitdirectory.
    if (fallbackInput) {
        fallbackInput.click();
    }
}

function clearBranchImportSelection() {
    branchImportSelection = null;

    const folderNameInput = document.getElementById("folder-name-input");
    const fallbackInput = document.getElementById("branch-folder-input");
    const preview = document.getElementById("branch-import-preview");
    const clearButton = document.getElementById("branch-folder-clear-btn");

    if (folderNameInput) {
        folderNameInput.disabled = false;
        folderNameInput.value = "";
    }

    if (fallbackInput) {
        fallbackInput.value = "";
    }

    if (preview) {
        preview.innerHTML = "";
    }

    if (clearButton) {
        clearButton.style.display = "none";
    }
}

function createBranchFolderNode(name) {
    return {
        kind: "folder",
        name: name,
        pageName: name,
        technicalName: "",
        children: []
    };
}

function createBranchFileNode(file) {
    return {
        kind: "file",
        name: file.name,
        pageName: getPageNameFromFile(file),
        technicalName: "",
        file: file,
        sourceKind: getBranchFileKind(file),
        safeName: getSafeAttachmentName(file.name)
    };
}

async function buildBranchTreeFromDirectoryHandle(directoryHandle) {
    const node = createBranchFolderNode(directoryHandle.name);

    for await (const entry of directoryHandle.values()) {
        if (entry.kind === "directory") {
            node.children.push(await buildBranchTreeFromDirectoryHandle(entry));
        } else if (entry.kind === "file") {
            const file = await entry.getFile();
            node.children.push(createBranchFileNode(file));
        }
    }

    return node;
}

function buildBranchTreeFromFiles(files) {
    let rootName = "Import";

    if (files.length > 0) {
        const firstPath = files[0].webkitRelativePath || files[0].name;
        const firstParts = firstPath.split("/").filter(Boolean);
        if (firstParts.length > 1) {
            rootName = firstParts[0];
        }
    }

    const root = createBranchFolderNode(rootName);

    files.forEach(function(file) {
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split("/").filter(Boolean);

        if (parts.length > 1 && parts[0] === rootName) {
            parts.shift();
        }

        let currentFolder = root;

        for (let i = 0; i < parts.length - 1; i++) {
            const folderName = parts[i];
            let childFolder = currentFolder.children.find(function(child) {
                return child.kind === "folder" && child.name === folderName;
            });

            if (!childFolder) {
                childFolder = createBranchFolderNode(folderName);
                currentFolder.children.push(childFolder);
            }

            currentFolder = childFolder;
        }

        currentFolder.children.push(createBranchFileNode(file));
    });

    return root;
}

function getBranchFileKind(file) {
    const dot = file.name.lastIndexOf(".");
    const extension = dot >= 0 ? file.name.substring(dot + 1).toLowerCase() : "";

    if (extension === "pdf") {
        return "pdf";
    }

    if (extension === "doc" || extension === "docx") {
        return "word";
    }

    return "file";
}

function getSafeAttachmentName(name) {
    return String(name || "").replace(/[\\\/:*?"<>|#%{}\[\]]/g, "_");
}

function prepareBranchTree(root) {
    assignUniqueTechnicalNames(root);
    sortBranchTree(root);
}

function assignUniqueTechnicalNames(folderNode) {
    const used = {};

    folderNode.children.forEach(function(child) {
        const baseName = child.kind === "folder" ? child.name : child.pageName;
        const baseTechnicalName = getTechnicalPageName(baseName);

        let technicalName = baseTechnicalName;
        let suffix = 2;

        while (used[technicalName.toLowerCase()]) {
            technicalName = baseTechnicalName + "_" + suffix;
            suffix++;
        }

        used[technicalName.toLowerCase()] = true;
        child.technicalName = technicalName;

        if (child.kind === "folder") {
            assignUniqueTechnicalNames(child);
        }
    });

    folderNode.technicalName = folderNode.technicalName || getTechnicalPageName(folderNode.pageName || folderNode.name);
}

function sortBranchTree(folderNode) {
    folderNode.children.sort(function(a, b) {
        if (a.kind !== b.kind) {
            return a.kind === "folder" ? -1 : 1;
        }

        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    folderNode.children.forEach(function(child) {
        if (child.kind === "folder") {
            sortBranchTree(child);
        }
    });
}

function getBranchStats(root) {
    const stats = {
        folders: 0,
        files: 0,
        word: 0,
        pdf: 0,
        other: 0
    };

    function walk(node) {
        if (node.kind === "folder") {
            stats.folders++;
            node.children.forEach(walk);
        } else {
            stats.files++;

            if (node.sourceKind === "word") {
                stats.word++;
            } else if (node.sourceKind === "pdf") {
                stats.pdf++;
            } else {
                stats.other++;
            }
        }
    }

    walk(root);
    return stats;
}

function renderBranchImportPreview() {
    const preview = document.getElementById("branch-import-preview");
    const clearButton = document.getElementById("branch-folder-clear-btn");

    if (!preview || !branchImportSelection || !branchImportSelection.root) {
        return;
    }

    const stats = getBranchStats(branchImportSelection.root);
    const emptyFolderNote = branchImportSelection.sourceMode === "webkitdirectory"
        ? '<p class="branch-import-note">Le navigateur utilise le mode de compatibilité : les dossiers totalement vides peuvent ne pas être détectés.</p>'
        : "";

    preview.innerHTML = `
<div class="branch-preview-header">
    <strong>Aperçu de l'arborescence</strong>
    <span>
        ${stats.folders} dossier(s), ${stats.files} fichier(s)
    </span>
</div>
<div class="branch-preview-summary">
    Word : ${stats.word} | PDF : ${stats.pdf} | Autres fichiers : ${stats.other}
</div>
<div class="branch-tree">
    <ul>${renderBranchTreeNode(branchImportSelection.root)}</ul>
</div>
${emptyFolderNote}
`;

    if (clearButton) {
        clearButton.style.display = "inline-block";
    }
}

function renderBranchTreeNode(node) {
    if (node.kind === "folder") {
        const children = node.children.map(renderBranchTreeNode).join("");

        return `
<li class="branch-tree-folder">
    <div class="branch-tree-row">
        <span class="branch-tree-type">Dossier</span>
        <strong>${escapeDocumentText(node.name)}</strong>
    </div>
    ${children ? "<ul>" + children + "</ul>" : '<ul><li class="branch-tree-empty">Dossier vide</li></ul>'}
</li>
`;
    }

    let label = "Fichier";
    if (node.sourceKind === "word") {
        label = "Word";
    } else if (node.sourceKind === "pdf") {
        label = "PDF";
    }

    return `
<li class="branch-tree-file">
    <div class="branch-tree-row">
        <span class="branch-tree-type">${label}</span>
        <span>${escapeDocumentText(node.name)}</span>
    </div>
</li>
`;
}

function ajouterDocument() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    const content = document.getElementById("popupContent");

    branchImportSelection = null;

    content.innerHTML = `
<h4>Ajouter un ou plusieurs documents</h4>
<input type="hidden" name="action" value="ajouter un document" />
<input type="hidden" name="type" value="document" />
<input type="hidden" name="page" value="${parentPage}" />

<div class="form-group">
    <label for="document-name-input">Nom de la page</label>
    <input id="document-name-input" class="form-control" type="text" name="nom_fichier"
        placeholder="Facultatif si un fichier est sélectionné" />
    <p id="document-name-help" class="help-block">
        Pour un seul document, tu peux modifier le nom de la page. Pour plusieurs documents, chaque page reprend le nom de son fichier.
    </p>
</div>

<div class="form-group">
    <label for="document-file-input">Documents PDF ou Word</label>
    <input id="document-file-input" class="form-control" type="file" multiple
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
    <p class="help-block">Tu peux sélectionner plusieurs fichiers en une seule fois. Une page XWiki sera créée pour chaque document.</p>
    <div id="document-selection-info"></div>
</div>
`;

    const fileInput = document.getElementById("document-file-input");
    const nameInput = document.getElementById("document-name-input");
    const selectionInfo = document.getElementById("document-selection-info");

    if (fileInput && nameInput) {
        fileInput.addEventListener("change", function() {
            const files = Array.prototype.slice.call(fileInput.files || []);

            if (files.length === 1) {
                nameInput.disabled = false;
                if (!nameInput.value) {
                    nameInput.value = getPageNameFromFile(files[0]);
                }
            } else if (files.length > 1) {
                nameInput.value = "";
                nameInput.disabled = true;
                nameInput.placeholder = "Nom automatique pour chaque document";
            } else {
                nameInput.disabled = false;
                nameInput.placeholder = "Facultatif si un fichier est sélectionné";
            }

            if (selectionInfo) {
                if (files.length === 0) {
                    selectionInfo.innerHTML = "";
                } else {
                    const names = files.map(function(file) {
                        return "<li>" + escapeDocumentText(file.name) + "</li>";
                    }).join("");

                    selectionInfo.innerHTML =
                        "<strong>" + files.length + " document(s) sélectionné(s)</strong>" +
                        "<ul>" + names + "</ul>";
                }
            }
        });
    }

    document.getElementById("popup").style.display = "block";
}

function escapeDocumentText(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getPageNameFromFile(file) {
    if (!file) return "";

    const lastDot = file.name.lastIndexOf(".");
    if (lastDot > 0) {
        return file.name.substring(0, lastDot);
    }

    return file.name;
}

function getTechnicalPageName(pageName) {
    let value = String(pageName || "");

    if (value.normalize) {
        value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    value = value
        .replace(/[\\\/:*?"<>|#%{}.$\[\]]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return value || "Document";
}

function getDocumentImportInfo(file, pageName) {
    if (!file) {
        return {
            file: null,
            kind: "",
            safeName: "",
            pageName: pageName || "",
            technicalName: getTechnicalPageName(pageName || "")
        };
    }

    const dot = file.name.lastIndexOf(".");
    const extension = dot >= 0 ? file.name.substring(dot + 1).toLowerCase() : "";

    let kind = "";
    if (extension === "pdf") {
        kind = "pdf";
    } else if (extension === "doc" || extension === "docx") {
        kind = "word";
    } else {
        throw new Error("FORMAT_DOCUMENT_NON_SUPPORTE:" + file.name);
    }

    return {
        file: file,
        kind: kind,
        safeName: getSafeAttachmentName(file.name),
        pageName: pageName || getPageNameFromFile(file),
        technicalName: getTechnicalPageName(pageName || getPageNameFromFile(file))
    };
}

function getSelectedDocumentImports() {
    const fileInput = document.getElementById("document-file-input");
    const nameInput = document.getElementById("document-name-input");
    const files = fileInput
        ? Array.prototype.slice.call(fileInput.files || [])
        : [];

    const manualName = nameInput && !nameInput.disabled ? nameInput.value : "";

    if (files.length === 0) {
        if (!manualName) {
            throw new Error("NOM_DOCUMENT_MANQUANT");
        }

        return [getDocumentImportInfo(null, manualName)];
    }

    return files.map(function(file) {
        const pageName = files.length === 1 && manualName
            ? manualName
            : getPageNameFromFile(file);

        return getDocumentImportInfo(file, pageName);
    });
}

async function uploadImportedDocument(uploadUrl, file, safeName, formToken) {
    const uploadData = new FormData();
    uploadData.append("filepath", file, safeName);
    uploadData.append("form_token", formToken);

    const response = await fetch(uploadUrl, {
        method: "POST",
        body: uploadData,
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    if (!response.ok) {
        throw new Error("UPLOAD_DOCUMENT_ECHOUE_" + response.status);
    }
}

async function sendCreationRequest(formulaire, parentPage, importInfo, formToken, creationType) {
    const formData = new FormData(formulaire);
    const type = creationType || "document";

    formData.set("action", type === "folder" ? "ajouter un fichier" : "ajouter un document");
    formData.set("type", type);
    formData.set("page", parentPage);
    formData.set("nom_fichier", importInfo.pageName || "");
    formData.set(
        "technical_name",
        importInfo.technicalName || getTechnicalPageName(importInfo.pageName || "")
    );
    formData.set("source_filename", importInfo.safeName || "");
    formData.set("source_kind", importInfo.kind || "");

    if (importInfo.file && importInfo.kind === "word") {
        formData.append("filePath", importInfo.file, importInfo.safeName);
    }

    const response = await fetch(urlCommande, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    const resultat = await response.text();

    if (!resultat.includes("LIEN_AJOUTE_OK")) {
        throw new Error(resultat);
    }

    const parsed = new DOMParser().parseFromString(resultat, "text/html");
    const creationResult = parsed.getElementById("creation-result");
    const pageRef = creationResult
        ? creationResult.getAttribute("data-page-ref")
        : "";
    const uploadUrl = creationResult
        ? creationResult.getAttribute("data-upload-url")
        : "";

    if (!pageRef) {
        throw new Error("REFERENCE_PAGE_INTROUVABLE");
    }

    if (importInfo.file) {
        if (!uploadUrl) {
            throw new Error("URL_UPLOAD_INTROUVABLE");
        }

        await uploadImportedDocument(
            uploadUrl,
            importInfo.file,
            importInfo.safeName,
            formToken
        );
    }

    return {
        pageRef: pageRef,
        uploadUrl: uploadUrl
    };
}

function formatDocumentImportError(error, pageName) {
    const message = error && error.message ? error.message : String(error || "");

    if (message.indexOf("ERREUR_PAGE_EXISTE") !== -1) {
        return pageName + " : une page avec ce nom existe déjà.";
    }

    if (message.indexOf("ERREUR_IMPORT_OFFICE") !== -1) {
        return pageName + " : la conversion Word vers XWiki a échoué.";
    }

    if (message.indexOf("ERREUR_DOCUMENT_MANQUANT") !== -1) {
        return pageName + " : le fichier Word n'a pas été reçu.";
    }

    if (message.indexOf("ERREUR_CSRF") !== -1) {
        return pageName + " : la session de sécurité a expiré.";
    }

    return pageName + " : " + message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function countBranchNodes(node) {
    let total = 1;

    if (node.kind === "folder") {
        node.children.forEach(function(child) {
            total += countBranchNodes(child);
        });
    }

    return total;
}

async function importBranchTree(formulaire, parentPage, formToken, button) {
    const root = branchImportSelection.root;
    const total = countBranchNodes(root);
    const failures = [];
    let completed = 0;
    let successCount = 0;

    async function importFolderNode(folderNode, targetParentPage) {
        const folderInfo = {
            file: null,
            kind: "",
            safeName: "",
            pageName: folderNode.pageName || folderNode.name,
            technicalName: folderNode.technicalName || getTechnicalPageName(folderNode.name)
        };

        if (button) {
            button.textContent =
                "Import " + (completed + 1) + "/" + total +
                " : " + folderInfo.pageName;
        }

        let folderResult;

        try {
            folderResult = await sendCreationRequest(
                formulaire,
                targetParentPage,
                folderInfo,
                formToken,
                "folder"
            );

            completed++;
            successCount++;
        } catch (error) {
            completed++;
            failures.push(formatDocumentImportError(error, folderInfo.pageName));

            // Sans la page dossier parente, on ne peut pas respecter
            // l'arborescence pour ses descendants.
            return;
        }

        for (let i = 0; i < folderNode.children.length; i++) {
            const child = folderNode.children[i];

            if (child.kind === "folder") {
                await importFolderNode(child, folderResult.pageRef);
                continue;
            }

            const importInfo = {
                file: child.file,
                kind: child.sourceKind,
                safeName: child.safeName,
                pageName: child.pageName,
                technicalName: child.technicalName
            };

            if (button) {
                button.textContent =
                    "Import " + (completed + 1) + "/" + total +
                    " : " + importInfo.pageName;
            }

            try {
                await sendCreationRequest(
                    formulaire,
                    folderResult.pageRef,
                    importInfo,
                    formToken,
                    "document"
                );
                successCount++;
            } catch (error) {
                failures.push(formatDocumentImportError(error, importInfo.pageName));
            }

            completed++;
        }
    }

    await importFolderNode(root, parentPage);

    return {
        total: total,
        successCount: successCount,
        failures: failures
    };
}

async function popupValider() {
    const formulaire = document.getElementById("formulairePopup");
    const pageData = document.getElementById("pageData");
    const parentPage = pageData ? pageData.getAttribute("parent-page") : null;
    const box = document.getElementById("box");
    const actionInput = formulaire
        ? formulaire.querySelector('input[name="action"]')
        : null;
    const formTokenInput = formulaire
        ? formulaire.querySelector('input[name="form_token"]')
        : null;
    const button = document.getElementById("btn-popup-valide");

    if (!formulaire || !parentPage || !box || !actionInput) return;

    try {
        if (button) {
            button.disabled = true;
        }

        if (actionInput.value === "ajouter un fichier") {
            const formToken = formTokenInput ? formTokenInput.value : "";

            // Import récursif d'une branche complète.
            if (branchImportSelection && branchImportSelection.root) {
                const result = await importBranchTree(
                    formulaire,
                    parentPage,
                    formToken,
                    button
                );

                if (result.successCount > 0) {
                    document.getElementById("popup").style.display = "none";
                    formulaire.reset();
                    branchImportSelection = null;
                    LienPerso(parentPage, box);
                }

                if (result.failures.length > 0) {
                    alert(
                        result.successCount + " élément(s) créé(s) sur " + result.total + ".\n\n" +
                        "Échecs :\n" + result.failures.join("\n")
                    );
                }

                return;
            }

            // Création d'un dossier vide.
            const folderNameInput = formulaire.querySelector('input[name="nom_fichier"]');
            const folderName = folderNameInput ? folderNameInput.value : "";

            if (!folderName) {
                throw new Error("NOM_DOSSIER_MANQUANT");
            }

            const folderInfo = {
                file: null,
                kind: "",
                safeName: "",
                pageName: folderName,
                technicalName: getTechnicalPageName(folderName)
            };

            if (button) button.textContent = "Création...";

            await sendCreationRequest(
                formulaire,
                parentPage,
                folderInfo,
                formToken,
                "folder"
            );

            document.getElementById("popup").style.display = "none";
            formulaire.reset();
            LienPerso(parentPage, box);
            return;
        }

        // Ajout manuel d'un ou plusieurs documents.
        const imports = getSelectedDocumentImports();
        const formToken = formTokenInput ? formTokenInput.value : "";
        const failures = [];
        let successCount = 0;

        for (let i = 0; i < imports.length; i++) {
            const importInfo = imports[i];

            if (button) {
                button.textContent =
                    "Import " + (i + 1) + "/" + imports.length +
                    " : " + importInfo.pageName;
            }

            try {
                await sendCreationRequest(
                    formulaire,
                    parentPage,
                    importInfo,
                    formToken,
                    "document"
                );
                successCount++;
            } catch (error) {
                console.error("Erreur import " + importInfo.pageName + " :", error);
                failures.push(formatDocumentImportError(error, importInfo.pageName));
            }
        }

        if (successCount > 0) {
            document.getElementById("popup").style.display = "none";
            formulaire.reset();
            LienPerso(parentPage, box);
        }

        if (failures.length > 0) {
            alert(
                successCount + " document(s) créé(s) sur " + imports.length + ".\n\n" +
                "Échecs :\n" + failures.join("\n")
            );
        }
    } catch (error) {
        console.error("Erreur création/import :", error);

        const message = error && error.message ? error.message : String(error || "");

        if (message.indexOf("FORMAT_DOCUMENT_NON_SUPPORTE:") === 0) {
            alert(
                "Format non supporté pour " +
                message.substring("FORMAT_DOCUMENT_NON_SUPPORTE:".length) +
                ". Choisis uniquement des fichiers PDF, DOC ou DOCX."
            );
        } else if (message === "NOM_DOCUMENT_MANQUANT") {
            alert("Entre un nom de page ou sélectionne au moins un document.");
        } else if (message === "NOM_DOSSIER_MANQUANT") {
            alert("Entre un nom de dossier ou sélectionne une arborescence à importer.");
        } else {
            alert("Erreur lors de la création : " + message);
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Valider";
        }
    }
}

function popupAnnuler() {
    branchImportSelection = null;
    document.getElementById("popup").style.display = "none";
}

document.addEventListener("DOMContentLoaded", function() {
    const popup = document.getElementById("popup");
    const closeButtons = document.getElementsByClassName("close");

    if (closeButtons.length > 0) {
        const span = closeButtons[closeButtons.length - 1];
        span.onclick = function() {
            branchImportSelection = null;
            popup.style.display = "none";
        };
    }

    window.addEventListener("click", function(event) {
        if (event.target === popup) {
            branchImportSelection = null;
            popup.style.display = "none";
        }
    });
});
