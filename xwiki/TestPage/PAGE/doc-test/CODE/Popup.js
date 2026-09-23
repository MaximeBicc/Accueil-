function ajouterFichier() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    const content = document.getElementById("popupContent");

    content.innerHTML = `
<h4>Nom du fichier ${parentPage}</h4>
<input type="hidden" name="action" value="ajouter un fichier" />
<input type="hidden" name="type" value="folder" />
<input type="hidden" name="page" value="${parentPage}" />
<input type="text" name="nom_fichier" placeholder="nom du fichier" />
`;

    document.getElementById("popup").style.display = "block";
}

function ajouterDocument() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    const content = document.getElementById("popupContent");

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

    // Retire les accents pour garder une référence XWiki simple et stable.
    if (value.normalize) {
        value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    // Évite que les points, slashs et autres caractères spéciaux soient
    // interprétés comme une nouvelle arborescence XWiki.
    value = value
        .replace(/[\\\/:*?"<>|#%{}.$]/g, "_")
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
            pageName: pageName || ""
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

    const safeName = file.name.replace(/[\\\/:*?"<>|#%{}]/g, "_");

    return {
        file: file,
        kind: kind,
        safeName: safeName,
        pageName: pageName || getPageNameFromFile(file)
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

async function sendCreationRequest(formulaire, parentPage, importInfo, formToken) {
    const formData = new FormData(formulaire);

    formData.set("page", parentPage);
    formData.set("nom_fichier", importInfo.pageName || "");
    formData.set("technical_name", getTechnicalPageName(importInfo.pageName || ""));
    formData.set("source_filename", importInfo.safeName || "");
    formData.set("source_kind", importInfo.kind || "");

    // Pour Word, COMMANDE reçoit le fichier directement afin de le convertir
    // en contenu XWiki éditable avec l'Office Importer.
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

    if (importInfo.file) {
        const parsed = new DOMParser().parseFromString(resultat, "text/html");
        const creationResult = parsed.getElementById("creation-result");
        const uploadUrl = creationResult
            ? creationResult.getAttribute("data-upload-url")
            : "";

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

        // ---------------------------------------------------------
        // Création d'un dossier : comportement existant inchangé.
        // ---------------------------------------------------------
        if (actionInput.value === "ajouter un fichier") {
            const formData = new FormData(formulaire);
            formData.set("page", parentPage);
            const folderNameInput = formulaire.querySelector('input[name="nom_fichier"]');
            formData.set("technical_name", getTechnicalPageName(folderNameInput ? folderNameInput.value : ""));
            formData.set("source_filename", "");
            formData.set("source_kind", "");

            if (button) button.textContent = "Création...";

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

            document.getElementById("popup").style.display = "none";
            formulaire.reset();
            LienPerso(parentPage, box);
            return;
        }

        // ---------------------------------------------------------
        // Documents : un appel de création par fichier sélectionné.
        // ---------------------------------------------------------
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
                    formToken
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
    document.getElementById("popup").style.display = "none";
}

document.addEventListener("DOMContentLoaded", function() {
    const popup = document.getElementById("popup");
    const closeButtons = document.getElementsByClassName("close");

    if (closeButtons.length > 0) {
        const span = closeButtons[closeButtons.length - 1];
        span.onclick = function() {
            popup.style.display = "none";
        };
    }

    window.addEventListener("click", function(event) {
        if (event.target === popup) {
            popup.style.display = "none";
        }
    });
});
