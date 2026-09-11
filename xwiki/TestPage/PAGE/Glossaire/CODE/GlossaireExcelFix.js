// Correctif Excel à charger APRES GlossaireExtension.js
// Évite les collisions avec un objet global XLSX déjà présent dans XWiki.

var glossarySheetJS = null;
var GLOSSARY_SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

function isValidGlossarySheetJS(candidate) {
    return !!candidate &&
        typeof candidate.read === 'function' &&
        candidate.utils &&
        typeof candidate.utils.sheet_to_json === 'function';
}

function loadGlossarySheetJS() {
    if (isValidGlossarySheetJS(glossarySheetJS)) {
        return Promise.resolve(glossarySheetJS);
    }

    if (isValidGlossarySheetJS(window.XLSX)) {
        glossarySheetJS = window.XLSX;
        return Promise.resolve(glossarySheetJS);
    }

    return new Promise(function(resolve, reject) {
        var previousXLSX = window.XLSX;
        var previousDefine = window.define;
        var previousDefineAmd = previousDefine && previousDefine.amd;

        // XWiki utilise RequireJS. On force ici le build standalone SheetJS à
        // s'installer sur window.XLSX au lieu de s'enregistrer comme module AMD.
        try {
            if (previousDefine && previousDefineAmd) {
                window.define = undefined;
            }
            window.XLSX = undefined;
        } catch (e) {
            // Rien : on vérifiera réellement l'API après chargement.
        }

        var oldScript = document.getElementById('sheetJsGlossaryLibrary');
        if (oldScript && oldScript.parentNode) {
            oldScript.parentNode.removeChild(oldScript);
        }

        var script = document.createElement('script');
        script.id = 'sheetJsGlossaryLibrary';
        script.type = 'text/javascript';
        script.src = GLOSSARY_SHEETJS_URL;

        function restoreDefine() {
            if (previousDefine && previousDefineAmd) {
                window.define = previousDefine;
            }
        }

        script.onload = function() {
            restoreDefine();

            if (isValidGlossarySheetJS(window.XLSX)) {
                glossarySheetJS = window.XLSX;
                resolve(glossarySheetJS);
                return;
            }

            // Si le CDN a chargé sans exposer l'API attendue, on remet l'ancien
            // global pour ne pas casser une éventuelle autre bibliothèque XWiki.
            window.XLSX = previousXLSX;
            reject(new Error('SheetJS chargé mais API read/utils indisponible'));
        };

        script.onerror = function() {
            restoreDefine();
            window.XLSX = previousXLSX;
            reject(new Error('Impossible de charger SheetJS depuis cdn.sheetjs.com'));
        };

        document.head.appendChild(script);
    });
}

// Cette fonction remplace volontairement celle de GlossaireExtension.js.
async function readGlossaryExcelFile(file) {
    var xlsxLibrary;

    try {
        xlsxLibrary = await loadGlossarySheetJS();
    } catch (error) {
        console.error(error);
        alert('La bibliothèque Excel n\'a pas pu être chargée correctement : ' + error.message);
        return;
    }

    try {
        var buffer = await file.arrayBuffer();

        if (!isValidGlossarySheetJS(xlsxLibrary)) {
            throw new Error('La bibliothèque SheetJS chargée ne possède pas read()');
        }

        var workbook = xlsxLibrary.read(buffer, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            alert('Le fichier Excel ne contient aucune feuille lisible.');
            return;
        }

        excelImportSheetName = workbook.SheetNames[0];
        var worksheet = workbook.Sheets[excelImportSheetName];
        var rawRows = xlsxLibrary.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            defval: ''
        });

        if (!rawRows.length) {
            alert('La première feuille du fichier est vide.');
            return;
        }

        var headerInfo = detectExcelHeader(rawRows[0] || []);
        excelImportHeaderDetected = headerInfo.detected;
        excelImportColumnMap = headerInfo.map;
        excelImportRows = analyzeExcelRows(rawRows, headerInfo);

        if (!excelImportRows.length) {
            alert('Aucune ligne de données n\'a été trouvée dans les trois colonnes attendues.');
            return;
        }

        renderExcelImportPreview(file.name);
        jQuery('#excelGlossaryModal').modal('show');
    } catch (error) {
        console.error(error);
        alert('Impossible de lire ce fichier Excel : ' + error.message);
    }
}
