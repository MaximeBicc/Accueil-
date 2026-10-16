/* Les propositions utilisent les pages PROPOSITIONS/CORBEILLE et COMMANDE. */
(function () {
    "use strict";
    var permissions = {}, workflowDocument, batch = "";
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });
    var rights = [
        ["create", "Créer"], ["move", "Déplacer"], ["modify", "Modifier les informations"],
        ["import", "Importer"], ["content", "Modifier le contenu"],
        ["propose", "Proposer"], ["review", "Valider"], ["delete", "Supprimer"]
    ];
    function node(tag, text, className) {
        var result = document.createElement(tag);
        if (text !== undefined) result.textContent = text;
        if (className) result.className = className;
        return result;
    }
    function token() {
        var input = document.querySelector('input[name="form_token"]');
        var meta = document.querySelector('meta[name="form_token"]');
        return input ? input.value : meta ? meta.content : "";
    }
    function can(right) { return permissions[right] === true; }
    function modeFor(right) {
        if (can(right)) return "direct";
        var proposable = ["create", "import", "move", "modify", "content"].indexOf(right) !== -1;
        return proposable && can("propose") ? "proposal" : "";
    }
    var errorMessages = {
        ERREUR_DROITS:"Vous n’avez pas le droit d’effectuer cette action.",
        ERREUR_DROITS_NATIFS:"Les droits XWiki nécessaires à cette action sont manquants.",
        ERREUR_CSRF:"Votre session a expiré. Rechargez la page avant de réessayer.",
        ERREUR_CONFLIT_VERSION:"Cet élément a changé. Rechargez-le avant de réessayer.",
        ERREUR_PAGE_EXISTE:"Un élément portant ce nom existe déjà à cet emplacement.",
        ERREUR_SOURCE_INTROUVABLE:"Cet élément n’existe plus. Rechargez la documentation.",
        ERREUR_DESTINATION_EXISTE:"Un élément portant ce nom existe déjà dans la destination.",
        ERREUR_DESTINATION_DANS_SOURCE:"Un dossier ne peut pas être déplacé dans lui-même.",
        ERREUR_DEPLACEMENT_IDENTIQUE:"Cet élément se trouve déjà dans ce dossier.",
        ERREUR_DEPENDANCE_PROPOSITION:"Le dossier proposé doit d’abord être validé.",
        ERREUR_IMPORT_OFFICE:"Le fichier Word n’a pas pu être converti. Contactez un administrateur.",
        ERREUR_DOCUMENT_MANQUANT:"Choisissez un fichier non vide de moins de 50 Mo.",
        ERREUR_FORMAT_DOCUMENT:"Le format du fichier n’est pas accepté.",
        ERREUR_SUPPRESSION:"La suppression n’a pas abouti. Rechargez la documentation.",
        ERREUR_DEPLACEMENT:"Le déplacement n’a pas abouti. Rechargez la documentation."
    };
    function errorMessage(error, fallback) {
        var generic = fallback || "La commande documentaire a échoué. Rechargez la page avant de réessayer.";
        var value = error && typeof error.message === "string" ? error.message : typeof error === "string" ? error : "";
        value = value.replace(/\s+/g, " ").trim();
        if (errorMessages[value]) return errorMessages[value];
        if (/^(Failed to fetch|NetworkError|Load failed)/i.test(value)) return "La connexion au serveur a échoué. Réessayez dans un instant.";
        // Une page d’erreur XWiki ou une trace Java ne doit jamais devenir le message affiché.
        if (!value || value.length > 320 || /[<>{}]|\bERREUR_[A-Z_]+\b|Exception|\bat [\w.$]+\(|org\.xwiki|com\.xpn/.test(value)) return generic;
        return value;
    }
    function responseError(text, fallback, status) {
        var generic = fallback || "La commande documentaire a échoué. Rechargez la page avant de réessayer.";
        var parsed = new DOMParser().parseFromString(String(text || ""), "text/html");
        var marker = parsed.getElementById("documentation-error");
        if (marker) {
            var code = marker.getAttribute("data-code") || marker.textContent.trim();
            return errorMessage(marker.getAttribute("data-message"), errorMessages[code] || generic);
        }
        var plain = parsed.body.textContent.trim();
        if (/^ERREUR_[A-Z_]+$/.test(plain)) return errorMessages[plain] || generic;
        if (status === 401) return "Connectez-vous puis rechargez la documentation.";
        if (status === 403) return errorMessages.ERREUR_DROITS;
        if (status >= 400 || parsed.querySelector(".xwiki-rendering-error,.xwikirenderingerror,.xwiki-exception,.macro-error,.errormessage")) return generic;
        return "";
    }
    var successCodes = {
        "ajouter un fichier":["LIEN_AJOUTE_OK", "PROPOSITION_OK"],
        "ajouter un document":["LIEN_AJOUTE_OK", "PROPOSITION_OK"],
        "deplacer element":["DEPLACEMENT_OK", "PROPOSITION_OK"],
        "supprimer element":["SUPPRESSION_OK"],
        "modifier metadonnees document":["METADONNEES_OK", "PROPOSITION_OK"],
        "modifier contenu document":["CONTENU_OK", "PROPOSITION_OK"],
        "enregistrer parametres":["PARAMETRES_OK"],
        "valider proposition":["PROPOSITION_VALIDEE_OK"],
        "refuser proposition":["PROPOSITION_REFUSEE_OK"],
        "restaurer proposition":["PROPOSITION_RESTAUREE_OK"],
        "purger corbeille":["CORBEILLE_PURGEE_OK"]
    };
    function resultCode(parsed) {
        var marker = parsed.getElementById("creation-result");
        return marker && marker.getAttribute("data-code") || parsed.body.textContent.trim();
    }
    function notify(text, error) {
        var host = document.getElementById("notification");
        if (!host) return;
        host.replaceChildren(node("div", error ? errorMessage(text) : text, error ? "alert alert-danger" : "alert alert-success"));
    }
    async function request(action, parameters, files) {
        var url = new URL(window.urlCommande, window.location.href);
        url.searchParams.set("xpage", "plain");
        var readOnly = ["workflow", "propositions", "corbeille", "contenu document"].indexOf(action) !== -1;
        var options = {credentials:"same-origin", headers:{"X-Requested-With":"XMLHttpRequest"}};
        var values = Object.assign({}, parameters || {}, {action:action});
        if (readOnly) {
            Object.keys(values).forEach(function (key) { url.searchParams.set(key, values[key]); });
        } else {
            var data = new FormData();
            Object.keys(values).forEach(function (key) { data.set(key, values[key]); });
            data.set("form_token", token());
            Object.keys(files || {}).forEach(function (key) { data.append(key, files[key], files[key].name); });
            options.method = "POST";
            options.body = data;
        }
        var response, text;
        try { response = await fetch(url.href, options); text = await response.text(); }
        catch (error) { throw new Error(errorMessage(error, "La connexion au serveur a échoué. Réessayez dans un instant.")); }
        var parsed = new DOMParser().parseFromString(text, "text/html");
        parsed.rawText = text;
        var message = responseError(text, undefined, response.status);
        if (message || !response.ok) throw new Error(message || "La commande documentaire a échoué.");
        parsed.resultCode = resultCode(parsed);
        if (!readOnly && successCodes[action] && successCodes[action].indexOf(parsed.resultCode) === -1)
            throw new Error("L’action n’a pas pu être confirmée. Rechargez la documentation avant de réessayer.");
        return parsed;
    }
    function beginBatch() {
        batch = window.crypto && crypto.randomUUID ? crypto.randomUUID() :
            "lot-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        return batch;
    }
    function endBatch() { batch = ""; }
    async function postActionParameters(right, parameters) {
        await ready;
        var mode = modeFor(right);
        if (!mode) throw new Error(right === "delete" ? "Vous n’avez pas le droit de supprimer des documents ou des dossiers." : "Vous n’avez pas le droit d’effectuer cette action ni de la proposer.");
        var result = Object.assign({}, parameters, {mode:mode});
        if (batch) result.batch_id = batch;
        if (result.source_ref && !result.base_version) {
            var source = await request("contenu document", {source_ref:result.source_ref, ref:result.source_ref});
            var details = source.querySelector("#documentation-content");
            if (!details) throw new Error("Le document n'a pas pu être chargé.");
            result.base_version = details.getAttribute("data-version");
        }
        return result;
    }
    async function proposalAction(ref, decision, reason, version) {
        var actions = {accept:"valider proposition", reject:"refuser proposition", restore:"restaurer proposition"};
        if (!can("review") || !actions[decision]) throw new Error("Le droit de validation est nécessaire.");
        var result = await request(actions[decision], {proposal_ref:ref, version:version || "", comment:reason || ""});
        notify(decision === "reject" ? "La proposition a été placée dans la corbeille pour sept jours." :
            decision === "restore" ? "La proposition est de nouveau en attente." : "Cette partie de la proposition a été validée.");
        return result;
    }
    function applyPermissions() {
        var settings = document.getElementById("doc-settings");
        if (settings) settings.hidden = !can("configure");
        var creation = !!modeFor("create") || !!modeFor("import");
        document.querySelectorAll("#doc-add-folder, #doc-add-document").forEach(function (item) {
            item.hidden = !creation;
            var proposalOnly = !can("create") && !can("import") && can("propose");
            var importOnly = can("import") && !can("create") && !can("propose");
            item.textContent = (proposalOnly ? "Proposer un " : importOnly ? "Importer un " : "Ajouter un ") + (item.id === "doc-add-folder" ? "dossier" : "document");
        });
        var mapping = {"#explorer-move-btn,#explorer-move-here-btn,#architecture-validate-btn":"move",
            "#explorer-delete-btn,#architecture-delete-btn":"delete", "#sidebar-metadata-save,#sidebar-tag-add":"modify",
            "#doc-content-edit":"content"};
        Object.keys(mapping).forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (item) { item.hidden = !modeFor(mapping[selector]); });
        });
        document.querySelectorAll("#sidebar-desc-input,#sidebar-tag-input").forEach(function (item) { item.disabled = !modeFor("modify"); });
        document.querySelectorAll(".sidebar-tag-remove").forEach(function (item) {
            item.hidden = !modeFor("modify");
            item.disabled = !modeFor("modify");
        });
        var metadataSave = document.getElementById("sidebar-metadata-save");
        var metadataStatus = document.getElementById("sidebar-metadata-status");
        if (metadataSave && (!metadataStatus || !metadataStatus.classList.contains("is-saving")))
            metadataSave.textContent = modeFor("modify") === "proposal" ? "Proposer la modification" : "Enregistrer";
        document.querySelectorAll("#branch-folder-picker-btn,#branch-folder-input,#document-file-picker-btn,#document-file-input").forEach(function (item) { item.disabled = !modeFor("import"); });
        var content = document.getElementById("doc-content-edit");
        if (content) content.textContent = can("content") ? "Modifier le contenu" : "Proposer une modification du contenu";
    }
    async function loadPermissions() {
        workflowDocument = await request("workflow");
        var state = workflowDocument.getElementById("documentation-permissions");
        if (!state) throw new Error("Installez les classes et la page COMMANDE de la documentation.");
        rights.concat([["view", "Voir"],["configure", "Paramètres"]]).forEach(function (right) {
            permissions[right[0]] = /^(true|1)$/.test(state.getAttribute("data-can-" + right[0]) || "");
        });
        applyPermissions();
    }
    function dialog(title) {
        var previous = document.activeElement;
        var result = node("dialog", undefined, "doc-propositions-dialog");
        result.setAttribute("aria-label", title);
        result.appendChild(node("h3", title));
        var body = node("div", undefined, "doc-propositions-dialog-body");
        var status = node("p"); status.setAttribute("role","status");
        var footer = node("div", undefined, "doc-propositions-dialog-actions");
        var close = node("button", "Fermer", "btn btn-default"); close.type = "button";
        close.onclick = function () { result.close(); result.remove(); if (previous && previous.isConnected) previous.focus(); };
        footer.appendChild(close); result.append(body,status,footer); document.body.appendChild(result); result.showModal();
        return {dialog:result, body:body, footer:footer, status:status, close:close.onclick};
    }
    async function openSettings() {
        await ready;
        if (!can("configure")) return;
        await loadPermissions();
        var view = dialog("Paramètres de la documentation");
        var table = node("table", undefined, "table table-bordered doc-permissions-table");
        var heading = node("tr"); heading.appendChild(node("th","Groupe XWiki"));
        rights.forEach(function (right) { heading.appendChild(node("th",right[1])); });
        var head = node("thead"); head.appendChild(heading); table.appendChild(head);
        var body = node("tbody");
        var grants = {};
        workflowDocument.querySelectorAll(".doc-grant-data").forEach(function (item) {
            grants[item.getAttribute("data-right") + "|" + item.getAttribute("data-group")] = true;
        });
        workflowDocument.querySelectorAll(".doc-group-data").forEach(function (group) {
            var ref = group.getAttribute("data-ref");
            var row = node("tr"); row.appendChild(node("th",group.getAttribute("data-title") || ref));
            rights.forEach(function (right) {
                var input = node("input"); input.type = "checkbox";
                input.dataset.right = right[0]; input.dataset.group = ref;
                input.checked = !!grants[right[0]+"|"+ref];
                input.setAttribute("aria-label",right[1]+" : "+ref);
                var cell = node("td"); cell.appendChild(input); row.appendChild(cell);
            }); body.appendChild(row);
        });
        table.appendChild(body); view.body.appendChild(table);
        view.body.appendChild(node("p", "Attribuez les droits aux groupes puis enregistrez. Sans attribution, aucune action n’est autorisée, même pour les administrateurs. Ceux-ci conservent l’accès aux paramètres.", "help-block"));
        view.body.appendChild(node("p", "Chaque opération autorisée s’effectue directement. Le droit Proposer permet de soumettre les autres opérations à validation, sauf la suppression.", "help-block"));
        var save = node("button","Enregistrer les autorisations","btn btn-primary"); save.type="button";
        save.onclick = async function () {
            save.disabled=true;
            var parameters = {expectedVersion:workflowDocument.getElementById("documentation-permissions").getAttribute("data-settings-version") || ""};
            rights.forEach(function (right) {
                parameters[right[0]+"_groups"] = Array.from(body.querySelectorAll('input[data-right="'+right[0]+'"]:checked')).map(function (input) { return input.dataset.group; }).join("\n");
            });
            try { await request("enregistrer parametres", parameters); await loadPermissions(); view.close(); notify("Les autorisations des groupes ont été enregistrées."); }
            catch (error) { view.status.textContent=errorMessage(error); save.disabled=false; }
        };
        view.footer.appendChild(save);
    }
    async function openContentEditor(ref) {
        await ready;
        var mode = modeFor("content");
        if (!mode) { notify("Vous n’avez pas le droit de modifier le contenu ni de proposer une modification.", true); return; }
        var view = dialog(mode === "direct" ? "Modifier le contenu du document" : "Proposer une modification du contenu");
        try {
            var result = await request("contenu document", {source_ref:ref, ref:ref});
            var source = result.querySelector("#documentation-source");
            var details = result.querySelector("#documentation-content");
            if (!source || !details) throw new Error("Le contenu du document est introuvable.");
            var label=node("label","Contenu XWiki");
            var field=node("textarea",undefined,"form-control"); field.rows=18; field.value=source.value;
            label.appendChild(field); view.body.appendChild(label);
            var replacementLabel=node("label","Remplacer le fichier (facultatif)");
            var replacement=node("input");replacement.type="file";replacement.className="form-control";
            replacementLabel.appendChild(replacement);view.body.appendChild(replacementLabel);
            view.body.appendChild(node("p","La mise en forme XWiki est conservée. Les macros de script sont désactivées dans ce contenu.","help-block"));
            var save=node("button",mode === "direct" ? "Enregistrer les modifications" : "Proposer les modifications","btn btn-primary"); save.type="button";
            save.onclick=async function () {
                save.disabled=true;
                try {
                    var params=await postActionParameters("content",{source_ref:ref,base_version:details.getAttribute("data-version"),content:field.value});
                    var files={};
                    if(replacement.files.length) {
                        var file=replacement.files[0], extension=file.name.split(".").pop().toLowerCase();
                        params.source_filename=file.name.replace(/[^A-Za-z0-9_.() -]/g,"_");
                        params.source_kind=extension==="pdf" ? "pdf" : /^(doc|docx)$/.test(extension) ? "word" : "file";
                        files.filePath=file;
                    }
                    var answer=await request("modifier contenu document",params,files);
                    var proposed=answer.resultCode === "PROPOSITION_OK";
                    view.close(); notify(proposed ? "La modification de contenu a été proposée." : "Le contenu a été enregistré.");
                    if (proposed && typeof window.openDocumentationProposals === "function") window.openDocumentationProposals(document.getElementById("box"));
                } catch (error) { view.status.textContent=errorMessage(error); save.disabled=false; }
            }; view.footer.appendChild(save);
        } catch(error) { view.status.textContent=errorMessage(error); }
    }
    window.DocPropositions = {ready:ready,can:can,modeFor:modeFor,request:request,proposalAction:proposalAction,
        postActionParameters:postActionParameters,beginBatch:beginBatch,endBatch:endBatch,batchId:function(){return batch;},
        applyPermissions:applyPermissions,openSettings:openSettings,openContentEditor:openContentEditor,notify:notify,
        responseError:responseError,errorMessage:errorMessage};
    async function init() {
        if (!window.urlCommande) { resolveReady(); return; }
        applyPermissions();
        document.addEventListener("click",function(event){
            var button=event.target.closest("#doc-settings,#doc-proposals,#doc-trash,#doc-content-edit"); if(!button)return;
            if(button.id==="doc-settings")openSettings().catch(function(error){notify(errorMessage(error),true);});
            else if(button.id==="doc-content-edit") {
                var ref=typeof sidebarCurrentDocumentRef!=="undefined" ? sidebarCurrentDocumentRef : button.dataset.ref;
                if(ref)openContentEditor(ref);
            } else {
                var fn=button.id==="doc-trash" ? window.openDocumentationTrash : window.openDocumentationProposals;
                if(fn)fn(document.getElementById("box"));
            }
        });
        try { await loadPermissions(); resolveReady(); request("purger corbeille").catch(function(){/* Les dates restent filtrées côté serveur. */}); }
        catch(error) { resolveReady();notify(error.message,true); }
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
}());
