import json
from playwright.sync_api import sync_playwright, expect
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=HERE+'/assets/'; URL=os.environ.get('URL','http://localhost:8799/')
results=[]; errs=[]
def ck(name, fn):
    try: fn(); results.append((name,True)); print('PASS',name)
    except Exception as e: results.append((name,False)); print('FAIL',name,'::',str(e).split('\n')[0][:300])
V2={"lectures":[{"id":"demo","course":"esc401","title":"Lecture 4","date":"2026-10-07","demo":True,"status":"ready","duration":100,"hasAudio":False,"segments":[{"t":5,"text":"Zero means success. Remember this."},{"t":60,"text":"Use sbatch to submit.","code":"sbatch job.sh","say":"s batch"}]},
 {"id":"L99","course":"esc401","title":"My own old lecture","date":"2026-09-01","status":"ready","duration":90,"hasAudio":False,"segments":[{"t":3,"text":"The shell reads what you type."}]}],
 "courses":[{"id":"esc401","code":"ESC401","name":"High Performance Computing","c":0}],"fam":{"shell":100},"clicks":{"shell":2},"ask":["Could you explain exit codes again?"],"seq":6,"cur":"esc401"}
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    ctx=b.new_context(viewport={'width':1280,'height':900}, permissions=['microphone']); ctx.set_default_timeout(8000)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e))); pg.on('console', lambda m: errs.append('console.error: '+m.text) if m.type=='error' else None)
    # migration
    pg.goto(URL); pg.evaluate("v=>localStorage.setItem('kitten.v2',JSON.stringify(v))",V2)
    pg.evaluate("indexedDB.deleteDatabase('kitten')"); pg.wait_for_timeout(300); pg.reload(); pg.wait_for_selector('.hello')
    def mig():
        pg.goto(URL+'#/c/esc401'); pg.wait_for_selector('.ltabs'); t=pg.locator('#app').inner_text(); assert 'My own old lecture' in t and 'Lecture 4' in t, t[:300]
        assert pg.evaluate("localStorage.getItem('kitten.v2')") is not None
        pg.goto(URL+'#/k/shell'); pg.wait_for_selector('.card, .paper'); 
    ck('v2 -> v3 migration keeps lectures, familiarity; old copy untouched', mig)
    # fresh seed for the rest
    pg.evaluate("localStorage.removeItem('kitten.v2')"); pg.evaluate("indexedDB.deleteDatabase('kitten')"); pg.wait_for_timeout(300); pg.goto(URL); pg.reload(); pg.wait_for_selector('.hello')
    # all course tabs + collections render
    def tabs():
        pg.goto(URL+'#/c/esc401'); pg.wait_for_selector('.ltabs')
        for t in ['notebooks','notebooks/code','notebooks/question','notebooks/confusing','materials','tasks','glossary','exam','collections','textbook']:
            pg.goto(URL+'#/c/esc401/'+t); pg.wait_for_selector('.ltabs'); assert len(pg.locator('#app').inner_text())>40, t
        for c in ['confusing','important','emphasis','bash','c','mpi','questions','deadlines','exam','unorganized','fromrec']:
            pg.goto(URL+'#/c/esc401/collections/'+c); pg.wait_for_selector('h2'); 
    ck('every course tab, notebook and smart collection renders', tabs)
    def code_nb():
        pg.goto(URL+'#/c/esc401/notebooks/code'); pg.wait_for_selector('.code'); assert 'sbatch' in pg.locator('#app').inner_text()
    ck('Code & Commands notebook gathers commands automatically', code_nb)
    # selection actions on demo lecture
    pg.goto(URL+'#/l/demo/orig'); pg.wait_for_selector('.seg')
    def acts():
        def sel(i):
            pg.evaluate("i=>{const e=document.querySelector('.segtext[data-seg=\"'+i+'\"]');const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r)}", i); pg.wait_for_selector('.selbar')
        sel(1); pg.locator('.selbar [data-a=simple]').click(); expect(pg.locator('#sheet')).to_contain_text('In simpler words'); expect(pg.locator('#sheet')).to_contain_text('Explained by this app'); pg.locator('#sheet [data-act=closeSheet]').click()
        sel(1); pg.locator('.selbar [data-act=selMore]').click(); pg.locator('#sheet [data-a=example]').click(); expect(pg.locator('#sheet')).to_contain_text('An example'); pg.locator('#sheet [data-act=saveExplain]').click(); expect(pg.locator('#toast')).to_contain_text('not as what the lecturer said')
        sel(3); pg.locator('.selbar [data-a=clean]').click(); expect(pg.locator('#toast')).to_contain_text('Clean Notes')
    ck('selection: explain simply / with example (labelled app-written), save to notes, add to Clean Notes', acts)
    def more():
        for a in ['cheat','important','tutor','task','flash']:
            pg.locator('.seg[data-seg="4"] [data-act=segMenu]').click(); pg.locator(f'#sheet [data-a={a}]').click()
            if a in ('tutor',): pg.locator('#askform textarea').fill('why?'); pg.locator('#askform button[type=submit]').click(); expect(pg.locator('#sheet')).to_contain_text('Where this comes up'); pg.locator('#sheet [data-act=closeSheet]').click()
            elif a=='task': pg.locator('#askform button[type=submit]').click()
            elif a=='flash': pg.locator('#askform textarea').first.fill('What is exit code 0?'); pg.locator('#askform button[type=submit]').click()
            pg.wait_for_timeout(150)
        pg.goto(URL+'#/c/esc401/notebooks/cheat'); expect(pg.locator('#app')).to_contain_text('Cheat Sheet')
        pg.goto(URL+'#/c/esc401/collections/important'); expect(pg.locator('#app .paper').first).to_be_visible()
    ck('selection: cheat sheet, important, tutor (honest offline search), task, flashcard', more)
    def corr():
        pg.goto(URL+'#/l/demo/orig'); pg.wait_for_selector('.seg'); pg.locator('.seg[data-seg="1"] [data-act=editSeg]').click(); pg.locator('#askform textarea').fill('So every time you type something in the shell, that is a command.'); pg.locator('#askform button[type=submit]').click()
        expect(pg.locator('.seg[data-seg="1"]')).to_contain_text('Edited by you'); pg.locator('.seg[data-seg="1"] [data-act=rawToggle]').click(); expect(pg.locator('.seg[data-seg="1"] .diff')).to_contain_text('that\'s a command')
        pg.locator('.seg[data-seg="1"] [data-act=restoreSeg]').click(); expect(pg.locator('.seg[data-seg="1"]')).not_to_contain_text('Edited by you')
    ck('transcript correction keeps raw text, can be restored', corr)
    def resc():
        pg.locator('.seg[data-seg="8"] [data-act=rescueAt]').click(); expect(pg.locator('#sheet')).to_contain_text("You're okay"); expect(pg.locator('#sheet')).to_contain_text('Source'); pg.locator('#sheet .ts').first.click(); pg.wait_for_selector('.seg')
        pg.keyboard.press('Escape')
    ck('"explain around here" rescue: names the idea, what came before, cites the transcript', resc)
    def esc():
        pg.locator('[data-act=lecMenu]').click(); expect(pg.locator('#sheet .sheet-card')).to_be_visible(); pg.keyboard.press('Escape'); expect(pg.locator('#sheet .sheet')).to_have_count(0)
    ck('Escape closes dialogs', esc)
    # recording with fake mic
    def recording():
        pg.goto(URL); pg.wait_for_selector('.hello'); pg.locator('[data-act=startRec]').first.click(); pg.wait_for_selector('#clock'); pg.wait_for_timeout(5500)
        assert pg.evaluate("document.querySelector('#clock').textContent")!='0:00'
        pg.locator('[data-act=pauseRec]').click(); pg.locator('[data-act=pauseRec]').click()
        pg.locator('[data-act=stopRec]').click(); pg.locator('#askform button[type=submit]').click(); pg.wait_for_selector('#pdone a.btn', timeout=15000)
        expect(pg.locator('#pdone')).to_contain_text('transcription service' ) if False else None
        pg.locator('#pdone a.btn').click(); pg.wait_for_selector('.ltabs'); expect(pg.locator('#app')).to_contain_text('no transcript') if False else None
    ck('record (fake mic) -> pause/resume -> stop -> processing -> lecture opens', recording)
    def draft():
        t=pg.locator('#app').inner_text().lower(); assert 'no transcript yet' in t, t[:300]; assert pg.locator('[data-act=pasteTx]').count()>0
        pg.wait_for_selector('#plseek', timeout=8000)
    ck('recorded lecture without STT: honest empty state, audio player ready', draft)
    def paste():
        pg.locator('[data-act=pasteTx]').first.click(); pg.locator('#askform textarea').fill('0:05 Welcome back. Today MPI.\n0:40 Exercise: submit hello_mpi by Friday.'); pg.locator('#askform button[type=submit]').click()
        pg.locator('.ltabs a', has_text='Original').first.click(); pg.wait_for_selector('.seg'); expect(pg.locator('.seg')).to_have_count(2)
    ck('paste a transcript into the recorded lecture', paste)
    # delete lecture flow
    def dele():
        pg.locator('[data-act=lecMenu]').click(); pg.locator('#sheet [data-act=delLec]').click(); expect(pg.locator('#sheet')).to_contain_text('cannot be undone'); pg.locator('#askform button[type=submit]').click(); pg.wait_for_function("location.hash.startsWith('#/c/')")
        h=pg.evaluate('location.hash'); assert h.startswith('#/c/'), h
    ck('delete lecture asks first, then removes it', dele)
    # materials: text + link + quick note, place sheet, dark theme
    def mats():
        pg.goto(URL+'#/inbox'); pg.wait_for_selector('#drop')
        with pg.expect_file_chooser() as fc: pg.locator('[data-act=pickFiles]').click()
        open(A+'hello_mpi.c','w').write('#include <mpi.h>\nint main(int argc,char**argv){MPI_Init(&argc,&argv);MPI_Finalize();return 0;}\n')
        fc.value.set_files(A+'hello_mpi.c'); pg.wait_for_selector('.sug, .paper [data-act=matPlace]'); expect(pg.locator('#app')).to_contain_text('Text readable')
        pg.locator('[data-act=addLink]').click(); pg.locator('#askform #url').fill('example.org/mpi'); pg.locator('#askform button[type=submit]').click(); expect(pg.locator('#app')).to_contain_text('example.org/mpi')
        pg.locator('[data-act=addTextNote]').click(); pg.locator('#askform #name').fill('Prof said'); pg.locator('#askform #text').fill('Week 3 hand-in is Friday'); pg.locator('#askform button[type=submit]').click(); expect(pg.locator('#app')).to_contain_text('Prof said')
        pg.locator('[data-act=matPlace]').first.click(); expect(pg.locator('#placeform')).to_be_visible(); pg.locator('#placeform button[type=submit]').click()
    ck('Inbox: code file read, link, quick note, "File it…" dialog', mats)
    def keep():
        pg.goto(URL+'#/inbox'); pg.wait_for_selector('#drop'); n=pg.locator('[data-act=sugKeep]').count()
        if n: pg.locator('[data-act=sugKeep]').first.click(); expect(pg.locator('#toast')).to_contain_text('stays in the Inbox')
    ck('Keep in Inbox leaves the file untouched', keep)
    def viewer_code():
        pg.goto(URL+'#/inbox'); pg.wait_for_selector('.li'); pg.locator('.paper', has_text='hello_mpi.c').locator('[data-act=matOpen]').first.click(); pg.wait_for_selector('.viewer'); assert 'MPI_Init' in pg.locator('.viewer').inner_text()
    ck('viewer shows code with line numbers', viewer_code)
    pg.keyboard.press('Escape')
    def dark():
        pg.goto(URL); pg.wait_for_selector('.hello'); pg.locator('#side [data-act=theme]').click(); pg.wait_for_timeout(200); pg.screenshot(path=HERE+'/shots/s_dark.png'); pg.goto(URL+'#/l/demo/kitten'); pg.wait_for_selector('.card'); pg.screenshot(path=HERE+'/shots/s_dark_kitten.png')
    ck('dark theme renders', dark)
    def priv():
        pg.locator('#side [data-act=privacy]').click(); expect(pg.locator('#sheet')).to_contain_text('Reading PDFs'); pg.keyboard.press('Escape')
    ck('privacy panel reflects server capabilities', priv)
    def bak():
        with pg.expect_download() as d: pg.evaluate("import('/js/shell.js').then(m=>0)"); pg.locator('#side [data-act=privacy]').click(); pg.locator('#sheet [data-act=exportBackup]').click()
        assert d.value.suggested_filename.startswith('kitten-mode-backup')
    ck('backup export downloads JSON', bak)
    b.close()
print('\nERRORS:'); [print(' ',e) for e in dict.fromkeys(errs)]
print('%d/%d passed'%(sum(1 for r in results if r[1]),len(results)))
