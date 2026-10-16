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
        var select = document.getElementById("doc-contribution-mode");
        if (select && select.value === "proposal" && can("propose")) return "proposal";
        return can(right) ? "direct" : can("propose") ? "proposal" : "";
    }
    function notify(text, error) {
        var host = document.getElementById("notification");
        if (!host) return;
        host.replaceChildren(node("div", text, error ? "alert alert-danger" : "alert alert-success"));
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
        var response = await fetch(url.href, options);
        var text = await response.text();
        var parsed = new DOMParser().parseFromString(text, "text/html");
        parsed.rawText = text;
        var error = parsed.querySelector("#documentation-error");
        var code = parsed.body.textContent.trim().match(/^(ERREUR_[A-Z_]+)$/);
        if (!response.ok || error || code) {
            throw new Error(error && (error.getAttribute("data-message") || error.textContent.trim()) ||
                (code ? code[0] : "La commande documentaire a échoué."));
        }
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
        if (!mode) throw new Error("Votre groupe ne dispose pas de ce droit.");
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
        document.querySelectorAll("#doc-add-folder, #doc-add-document").forEach(function (item) { item.hidden = !creation; });
        var mapping = {"#explorer-move-btn,#explorer-move-here-btn,#architecture-validate-btn":"move",
            "#explorer-delete-btn,#architecture-delete-btn":"delete", "#sidebar-metadata-save,#sidebar-tag-add":"modify",
            "#doc-content-edit":"content"};
        Object.keys(mapping).forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (item) { item.hidden = !modeFor(mapping[selector]); });
        });
        document.querySelectorAll("#sidebar-desc-input,#sidebar-tag-input").forEach(function (item) { item.disabled = !modeFor("modify"); });
        document.querySelectorAll("#branch-folder-picker-btn,#branch-folder-input,#document-file-picker-btn,#document-file-input").forEach(function (item) { item.disabled = !modeFor("import"); });
        var select = document.getElementById("doc-contribution-mode");
        if (select) {
            var direct = rights.some(function (right) { return ["propose","review"].indexOf(right[0]) === -1 && can(right[0]); });
            select.querySelector('[value="direct"]').disabled = !direct;
            select.querySelector('[value="proposal"]').disabled = !can("propose");
            if (!direct && can("propose")) select.value = "proposal";
            if (!can("propose") && direct) select.value = "direct";
            select.disabled = !direct || !can("propose");
        }
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
        var save = node("button","Enregistrer les autorisations","btn btn-primary"); save.type="button";
        save.onclick = async function () {
            save.disabled=true;
            var parameters = {expectedVersion:workflowDocument.getElementById("documentation-permissions").getAttribute("data-settings-version") || ""};
            rights.forEach(function (right) {
                parameters[right[0]+"_groups"] = Array.from(body.querySelectorAll('input[data-right="'+right[0]+'"]:checked')).map(function (input) { return input.dataset.group; }).join("\n");
            });
            try { await request("enregistrer parametres", parameters); await loadPermissions(); view.close(); notify("Les autorisations des groupes ont été enregistrées."); }
            catch (error) { view.status.textContent=error.message; save.disabled=false; }
        };
        view.footer.appendChild(save);
    }
    async function openContentEditor(ref) {
        await ready;
        if (!modeFor("content")) return;
        var view = dialog("Modifier le contenu du document");
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
            var save=node("button","Enregistrer / proposer","btn btn-primary"); save.type="button";
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
                    var proposed=answer.rawText.indexOf("PROPOSITION_OK")!==-1;
                    view.close(); notify(proposed ? "La modification de contenu a été proposée." : "Le contenu a été enregistré.");
                    if (proposed && typeof window.openDocumentationProposals === "function") window.openDocumentationProposals(document.getElementById("box"));
                } catch (error) { view.status.textContent=error.message; save.disabled=false; }
            }; view.footer.appendChild(save);
        } catch(error) { view.status.textContent=error.message; }
    }
    window.DocPropositions = {ready:ready,can:can,modeFor:modeFor,request:request,proposalAction:proposalAction,
        postActionParameters:postActionParameters,beginBatch:beginBatch,endBatch:endBatch,batchId:function(){return batch;},
        applyPermissions:applyPermissions,openSettings:openSettings,openContentEditor:openContentEditor,notify:notify};
    async function init() {
        if (!window.urlCommande) { resolveReady(); return; }
        applyPermissions();
        document.addEventListener("change",function(event){if(event.target.id==="doc-contribution-mode")applyPermissions();});
        document.addEventListener("click",function(event){
            var button=event.target.closest("#doc-settings,#doc-proposals,#doc-trash,#doc-content-edit"); if(!button)return;
            if(button.id==="doc-settings")openSettings().catch(function(error){notify(error.message,true);});
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
