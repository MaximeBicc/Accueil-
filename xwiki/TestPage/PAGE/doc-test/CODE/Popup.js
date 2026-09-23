function ajouterFichier() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    popupContent.innerHTML = `
<h4>Nom du fichier ${parentPage}</h4>
<input type="hidden" name="action" value="ajouter un fichier" />
<input type="hidden" name="type" value="folder" />
<input type="hidden" name="page" value="${parentPage}" />
<input type="text" name="nom_fichier" placeholder="nom du fichier" />
`;
    popup.style.display = "block";
}

function ajouterDocument() {
    const pageData = document.getElementById("pageData");
    const parentPage = pageData.getAttribute("parent-page");
    popupContent.innerHTML = `
<h4>Ajouter un document</h4>
<input type="hidden" name="action" value="ajouter un document" />
<input type="hidden" name="type" value="document" />
<input type="hidden" name="page" value="${parentPage}" />

<div class="form-group">
    <label for="document-name-input">Nom de la page</label>
    <input id="document-name-input" class="form-control" type="text" name="nom_fichier" placeholder="Nom du document" />
</div>

<div class="form-group">
    <label for="document-file-input">Document PDF ou Word</label>
    <input id="document-file-input" class="form-control" type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
    <p class="help-block">DOC et DOCX sont convertis en contenu XWiki éditable. PDF conserve son affichage d'origine.</p>
</div>
`;

    const fileInput = document.getElementById("document-file-input");
    const nameInput = document.getElementById("document-name-input");

    if (fileInput && nameInput) {
        fileInput.addEventListener("change", function() {
            const file = fileInput.files && fileInput.files[0];
            if (!file || nameInput.value) return;

            const lastDot = file.name.lastIndexOf(".");
            nameInput.value = lastDot > 0 ? file.name.substring(0, lastDot) : file.name;
        });
    }

    popup.style.display = "block";
}

function getDocumentImportInfo() {
    const fileInput = document.getElementById("document-file-input");
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        return { file: null, kind: "", safeName: "" };
    }

    const file = fileInput.files[0];
    const dot = file.name.lastIndexOf(".");
    const extension = dot >= 0 ? file.name.substring(dot + 1).toLowerCase() : "";

    let kind = "";
    if (extension === "pdf") {
        kind = "pdf";
    } else if (extension === "doc" || extension === "docx") {
        kind = "word";
    } else {
        throw new Error("FORMAT_DOCUMENT_NON_SUPPORTE");
    }

    // Le nom de l'attachement est nettoyé pour ne pas casser la syntaxe XWiki
    // utilisée dans le contenu de la nouvelle page.
    const safeName = file.name.replace(/[\\\/:*?"<>|#%{}]/g, "_");

    return { file: file, kind: kind, safeName: safeName };
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

async function popupValider() {
    const formulaire = document.getElementById("formulairePopup");
    const pageData = document.getElementById("pageData");
    const parentPage = pageData ? pageData.getAttribute("parent-page") : null;
    const box = document.getElementById("box");
    const actionInput = formulaire ? formulaire.querySelector('input[name="action"]') : null;
    const formTokenInput = formulaire ? formulaire.querySelector('input[name="form_token"]') : null;
    const button = document.getElementById("btn-popup-valide");

    if (!formulaire || !parentPage || !box || !actionInput) return;

    let importInfo = { file: null, kind: "", safeName: "" };

    try {
        if (actionInput.value === "ajouter un document") {
            importInfo = getDocumentImportInfo();
        }

        const formData = new FormData(formulaire);
        formData.set("page", parentPage);

        if (importInfo.file) {
            formData.set("source_filename", importInfo.safeName);
            formData.set("source_kind", importInfo.kind);

            // Pour Word, COMMANDE reçoit directement le fichier et utilise
            // l'Office Importer XWiki pour générer du contenu XWiki éditable.
            if (importInfo.kind === "word") {
                formData.append("filePath", importInfo.file, importInfo.safeName);
            }
        } else {
            formData.set("source_filename", "");
            formData.set("source_kind", "");
        }

        if (button) {
            button.disabled = true;
            button.textContent = importInfo.file ? "Création..." : "Chargement...";
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
            const uploadUrl = creationResult ? creationResult.getAttribute("data-upload-url") : "";

            if (!uploadUrl) {
                throw new Error("URL_UPLOAD_INTROUVABLE");
            }

            if (button) button.textContent = "Import du document...";

            await uploadImportedDocument(
                uploadUrl,
                importInfo.file,
                importInfo.safeName,
                formTokenInput ? formTokenInput.value : ""
            );
        }

        document.getElementById("popup").style.display = "none";
        formulaire.reset();
        LienPerso(parentPage, box);
    } catch (error) {
        console.error("Erreur création/import :", error);

        if (error && error.message === "FORMAT_DOCUMENT_NON_SUPPORTE") {
            alert("Format non supporté. Choisis un fichier PDF, DOC ou DOCX.");
        } else {
            alert("Erreur lors de la création ou de l'import du document : " + (error.message || error));
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Valider";
        }
    }
}

function popupAnnuler() {
    popup.style.display = "none";
}

document.addEventListener("DOMContentLoaded", function() {
    const popup = document.getElementById("popup");
    const popupContent = document.getElementById("popupContent");
    const span = document.getElementsByClassName("close")[1];

    span.onclick = function() {
        popup.style.display = "none";
    }

    window.onclick = function(event) {
        if (event.target == popup) {
            popup.style.display = "none";
        }
    }
});
