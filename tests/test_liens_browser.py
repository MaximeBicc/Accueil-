"""Tests du vrai JavaScript dans Chromium, avec API XWiki et lecture Excel simulées.
Installation de test : pip install pytest playwright ; playwright install chromium
Exécution : pytest -q tests/test_liens_browser.py
LIENS_CHROMIUM=/usr/bin/chromium permet d'utiliser un Chromium déjà installé.
Ces tests ne valident PAS l'exécution du Velocity ni les jobs du serveur XWiki.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs
import pytest
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'xwiki/TestPage/PAGE/Liens/CODE/LiensExtension.js').read_text()
CSS = (ROOT / 'xwiki/TestPage/PAGE/Liens/CODE/LiensExtension.css').read_text()

def row(name='API', owner='Alice', kind='personnel'):
    return dict(acronym=name, label='Libellé '+name, definition='Définition '+name,
                type=kind, author=owner, ref='TestPage.PAGE.Liens.DATA.LIENDATA.'+owner+'.'+name, version='1.1')

@pytest.fixture
def browser():
    with sync_playwright() as p:
        kwargs = dict(headless=True)
        if os.getenv('LIENS_CHROMIUM'):
            kwargs['executable_path'] = os.environ['LIENS_CHROMIUM']
        b = p.chromium.launch(**kwargs)
        yield b
        b.close()

class Harness:
    def __init__(self, browser, manager=False, records=None, hook=None, excel=None):
        self.records = records or [row(), row('PUBLIC','Bob','commun'), row('SECRET','Bob')]
        self.calls = []
        self.pending = {}
        self.page = browser.new_page(viewport={'width':1440,'height':1000})
        self.errors=[]
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('dialog', lambda d: d.accept())
        def backend(data):
            self.calls.append(data)
            assert data['form_token']=='test'
            if data['action']=='list':
                # Intentionnellement inclure SECRET pour éprouver aussi la barrière client.
                answer=dict(ok=True,user='Alice',isManager=manager,managerGroup='XWiki.IVQ_Gestionnaires',records=self.records)
            else:
                answer = hook(data, self) if hook else None
                if answer is None:
                    if data['action']=='delete':
                        self.records=[r for r in self.records if r['ref']!=data['targetRef']]
                        answer=dict(ok=True,code='DELETED',ref=data['targetRef'])
                    else:
                        r=row(data['acronym'],data['author'],data['type'])
                        r.update(label=data['label'],definition=data['definition'],version='2.1')
                        self.records=[old for old in self.records if old['ref'] not in [r['ref'],data.get('targetRef')]]+[r]
                        answer=dict(ok=True,code='SAVED',ref=r['ref'],visible=r['type']=='commun' or r['author']=='Alice')
                        if answer['visible']: answer['record']=r
            if isinstance(answer,str): return answer
            answer['schema']='liens-v2'
            return json.dumps(answer)
        self.page.expose_function('liensTestAPI',backend)
        # Aucune navigation réseau : API et stockage de session en mémoire.
        self.page.evaluate("""() => {
            const memory = new Map();
            Object.defineProperty(window, 'sessionStorage', {value:{
              getItem:k=>memory.get(k)||null, setItem:(k,v)=>memory.set(k,v), removeItem:k=>memory.delete(k)}});
            window.fetch=async (url,init)=>{
                if(init.method!=='POST'||init.credentials!=='same-origin') throw Error('transport invalide');
                const text=await window.liensTestAPI(Object.fromEntries(init.body.entries()));
                return {ok:true,status:200,text:async()=>text};
            };
        }""")
        if excel:
            self.page.evaluate('window.XLSX={version:"0.20.3", read:()=>({SheetNames:["Liens"],Sheets:{Liens:{}}}),utils:{sheet_to_json:()=>'+json.dumps(excel)+'}};')
        self.page.set_content('<!doctype html><meta charset="utf-8"><style>'+CSS+'</style><div id="liens-app" data-endpoint="/api" data-csrf="test" data-xlsx-url="/xlsx.js"></div><script>'+JS+'</script>')
        self.page.wait_for_function('document.querySelector("[data-notice]").textContent.startsWith("Liens chargés")')
        self.page.wait_for_function('document.querySelector("#liens-app").getAttribute("aria-busy")==="false"')
    def ready(self):
        self.page.wait_for_function('document.querySelector("#liens-app").getAttribute("aria-busy")==="false"')
    def click(self, selector):
        self.page.locator(selector).click()
    def close(self):
        assert self.errors==[],self.errors
        self.page.close()

def test_nonmanager_private_matches_and_absent_common_actions(browser):
    h=Harness(browser); p=h.page
    assert 'SECRET' not in p.locator('#liens-app').inner_text()
    h.click('[data-add]')
    assert p.locator('[data-editor-fields] [name="author"]').input_value()=='Alice'
    assert p.locator('[data-editor-fields] [name="author"]').get_attribute('readonly') is not None
    assert 'SECRET' not in p.locator('[data-existing]').inner_text()
    assert 'PUBLIC' in p.locator('[data-existing]').inner_text()
    assert p.locator('[data-editor-fields] [name="type"] option[value="commun"]').count()==0
    h.click('[data-editor-close]');h.click('[data-tab="commun"]')
    assert p.locator('[data-table] thead tr').first.locator('th').count()==5
    assert p.locator('[data-table] tbody button').count()==0
    assert p.locator('[data-table] input[type=checkbox]').count()==0
    expect(p.locator('[data-bulk]')).to_be_hidden();h.close()

def test_sort_filter_and_select_all_across_pages_partial_delete(browser):
    source=[row('A'+str(i)) for i in range(1,13)]
    def hook(data,h):
        if data['action']=='delete' and data['targetRef'].endswith('.A4'):
            return dict(ok=False,code='ACCESS',message='Refus test')
    h=Harness(browser,records=source,hook=hook);p=h.page
    p.locator('[data-size]').select_option('5')
    h.click('[data-table] thead tr:first-child th:nth-child(2) button')
    assert p.locator('[data-table] tbody tr:first-child .liens-acronym').inner_text()=='A12'
    p.get_by_label('Filtrer Acronyme',exact=True).fill('A')
    p.locator('[data-table] thead input[type=checkbox]').check()
    expect(p.locator('[data-bulk]')).to_have_text('Supprimer la sélection (12)')
    h.click('[data-bulk]');p.wait_for_function('document.querySelector("[data-notice]").textContent.includes("11 suppression(s) confirmée(s), 1 échec(s)")');h.ready()
    assert len([x for x in h.calls if x['action']=='delete'])==12
    assert p.locator('[data-table] tbody .liens-acronym').all_inner_texts()==['A4']
    assert 'Refus test' in p.locator('[data-notice]').inner_text();h.close()

def test_manager_move_poll_uses_new_reference_and_transfer_removes_private(browser):
    def hook(data,h):
        if data['action']=='save':
            h.pending[data['operationId']]=data
            return dict(ok=True,pending=True)
        if data['action']=='finish':
            data=h.pending.pop(data['operationId'])
            r=row(data['acronym'],data['author'],data['type']);r.update(label=data['label'],definition=data['definition'],version='3.1')
            h.records=[x for x in h.records if x['ref']!=data['targetRef']]+[r]
            out=dict(ok=True,ref=r['ref'],visible=r['type']=='commun' or r['author']=='Alice',code='SAVED')
            if out['visible']:out['record']=r
            return out
    h=Harness(browser,manager=True,records=[row('API','Bob','commun')],hook=hook);p=h.page
    h.click('[data-tab="commun"]');h.click('[data-table] tbody button:first-child')
    p.locator('[name="acronym"]').fill('REST');p.locator('[name="author"]').fill('Charlie')
    h.click('[data-editor-form] button[type="submit"]');expect(p.locator('[data-editor]')).not_to_be_visible();h.ready()
    h.click('[data-table] tbody button:first-child')
    p.locator('[name="type"]').select_option('personnel');h.click('[data-editor-form] button[type="submit"]')
    expect(p.locator('[data-editor]')).not_to_be_visible();h.ready()
    saves=[x for x in h.calls if x['action']=='save']
    assert saves[1]['targetRef'].endswith('.Charlie.REST');assert saves[1]['version']=='3.1'
    assert p.locator('[data-table] tbody .liens-acronym').count()==0
    assert 'ne fait plus partie' in p.locator('[data-notice]').inner_text();h.close()

def test_excel_nonmanager_multiple_successes_visible_without_reload(browser):
    excel=[['Acronyme','Libellé','Définition','Type','Auteur'],['ONE','L1','D1','',''],['TWO','L2','D2','personnel',''],['THREE','L3','D3','commun',''],['FOUR','L4','D4','personnel','Bob']]
    h=Harness(browser,excel=excel);p=h.page
    p.locator('[data-file]').set_input_files(dict(name='exemple.xlsx',mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer=b'test'))
    expect(p.locator('[data-excel]')).to_be_visible();h.ready()
    assert p.locator('[data-preview] tr').count()==4
    assert p.get_by_label('Auteur, ligne 2',exact=True).input_value()=='Alice'
    assert 'Commun réservé aux managers' in p.locator('[data-preview]').inner_text()
    h.click('[data-import-new]')
    p.wait_for_function('document.querySelector("[data-import-summary]").textContent.includes("2 ajout(s) déjà confirmé(s)")');h.ready()
    assert len([x for x in h.calls if x['action']=='import'])==2
    assert all(x['author']=='Alice' and x['type']=='personnel' for x in h.calls if x['action']=='import')
    assert p.locator('[data-table] tbody .liens-acronym').all_inner_texts()==['API','ONE','TWO']
    assert p.locator('[data-sheet]').is_disabled()
    assert len([x for x in h.calls if x['action']=='list'])==1
    h.click('[data-import-new]');assert len([x for x in h.calls if x['action']=='import'])==2
    h.close()

def test_untrusted_text_never_becomes_markup(browser):
    r=row('SAFE');r['label']='<img src=x onerror="window.pwned=true">';r['definition']='<script>window.pwned=true</script>'
    h=Harness(browser,records=[r]);p=h.page
    assert p.locator('[data-table] img').count()==0
    assert p.locator('[data-table] .liens-label').inner_text()==r['label']
    assert p.evaluate('!!window.pwned') is False
    h.click('[data-add]');assert p.locator('[data-existing] img').count()==0;h.close()

def test_nonjson_response_is_not_success_and_replay_keeps_operation_id(browser):
    seen=[]
    def hook(data,h):
        if data['action']=='create':
            seen.append(data['operationId'])
            if len(seen)==1:return 'GLOSSAIRE_OK <html>réponse parasite</html>'
    h=Harness(browser,hook=hook);p=h.page
    h.click('[data-add]')
    for key,value in [('acronym','NEW'),('label','NEWLABEL'),('definition','NEWDEF')]:p.locator('[name="'+key+'"]').fill(value)
    h.click('[data-editor-form] button[type=submit]');expect(p.locator('[data-editor-error]')).to_contain_text('non JSON');h.ready()
    assert 'NEW' not in p.locator('[data-table] tbody').inner_text()
    h.click('[data-editor-close]');h.click('[data-resume]')
    p.wait_for_function('document.querySelector("[data-notice]").textContent.includes("Résultat confirmé")');h.ready()
    assert len(seen)==2 and seen[0]==seen[1];assert 'NEW' in p.locator('[data-table] tbody').inner_text();h.close()
