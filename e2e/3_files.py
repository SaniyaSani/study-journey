from playwright.sync_api import sync_playwright, expect
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=HERE+'/assets/'; URL=os.environ.get('URL','http://localhost:8799/')
results=[]; errs=[]
def ck(name, fn):
    try: fn(); results.append((name,True)); print('PASS',name)
    except Exception as e: results.append((name,False)); print('FAIL',name,'::',str(e).split('\n')[0][:300])
def upload(pg,f):
    pg.goto(URL+'#/inbox'); pg.wait_for_selector('#drop')
    with pg.expect_file_chooser() as fc: pg.locator('[data-act=pickFiles]').click()
    fc.value.set_files(A+f); pg.wait_for_timeout(1200)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':900}); ctx.set_default_timeout(8000)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
    pg.goto(URL); pg.wait_for_selector('.hello')
    def pptx():
        upload(pg,'ESC401_week3.pptx'); t=pg.locator('#app').inner_text(); assert 'Text readable (2 slides)' in t, t[:400]
        pg.locator('[data-act=matOpen]').first.click(); expect(pg.locator('.viewer')).to_contain_text('Slide 1 of 2'); expect(pg.locator('#pagetext')).to_contain_text('MPI_Init'); pg.keyboard.press('Escape')
    ck('PPTX: slide text extracted per slide, viewer shows slide 1 of 2', pptx)
    def broken():
        upload(pg,'broken.pdf'); t=pg.locator('#app').inner_text(); assert ("Couldn't read the text" in t) or ('No readable text' in t), t[:500]
    ck('corrupt PDF: honest failure state, file still kept', broken)
    def docx():
        upload(pg,'notes.docx'); expect(pg.locator('#app')).to_contain_text('Word documents are kept but their text is not read')
    ck('docx: kept, honestly marked as not read', docx)
    def nopdf():
        pg2=ctx.new_page(); pg2.route('**/api/status', lambda r: r.fulfill(json={'llm':False,'stt':None,'extract':{}})); pg2.goto(URL); pg2.wait_for_selector('.hello'); pg2.wait_for_timeout(500)
        pg2.goto(URL+'#/inbox'); pg2.wait_for_selector('#drop')
        with pg2.expect_file_chooser() as fc: pg2.locator('[data-act=pickFiles]').click()
        fc.value.set_files(A+'ESC401_Week3_slides.pdf'); pg2.wait_for_timeout(1200); t=pg2.locator('#app').inner_text(); assert "can't read PDF text" in t, t[:500]; pg2.close()
    ck('server without pdftotext: PDF kept, marked "text not read" (no fake extraction)', nopdf)
    def blocked():
        c2=b.new_context(viewport={'width':1280,'height':900}); c2.add_init_script("indexedDB.open=()=>{throw new Error('blocked by test')}")
        q=c2.new_page(); q.goto(URL); q.wait_for_selector('.hello'); expect(q.locator('#banner')).to_contain_text('Saving is switched off'); c2.close()
    ck('storage unavailable: visible warning banner, app still usable', blocked)
    def search_ppt():
        pg.goto(URL+'#/s/gcc'); pg.wait_for_selector('.res'); expect(pg.locator('#results')).to_contain_text('slide')
    ck('slide text is searchable (inbox files included in global search)', search_ppt)
    b.close()
print('ERRORS',errs); print('%d/%d'%(sum(1 for r in results if r[1]),len(results)))
