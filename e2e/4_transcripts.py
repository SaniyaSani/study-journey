"""Transcript versions, re-transcription and honest 'unclear' marking.
Needs a server started with STT_PROVIDER=fake (canned output, no model) on URL (default http://localhost:8798/)."""
from playwright.sync_api import sync_playwright, expect
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=HERE+'/assets/'; URL=os.environ.get('URL2','http://localhost:8798/')
results=[]; errs=[]
def ck(name, fn):
    try: fn(); results.append((name,True)); print('PASS',name)
    except Exception as e: results.append((name,False)); print('FAIL',name,'::',str(e).split('\n')[0][:300])
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    ctx=b.new_context(viewport={'width':1280,'height':900}); ctx.set_default_timeout(10000)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
    pg.goto(URL); pg.wait_for_selector('.hello')
    def upload():
        pg.goto(URL+'#/add'); pg.wait_for_selector('#addform')
        pg.select_option('#a-lang','de'); pg.locator('#a-file').set_input_files(A+'lecture3.wav')
        pg.locator('#addform button[type=submit]').click(); pg.wait_for_selector('#pdone a.btn', timeout=20000); pg.locator('#pdone a.btn').click(); pg.wait_for_selector('.ltabs')
    ck('upload audio with language chosen -> transcript written from the recording', upload)
    def orig():
        pg.goto(pg.url.split('#')[0]+'#/l/'+pg.evaluate("location.hash.split('/')[2]")+'/orig'); pg.wait_for_selector('.seg')
        t=pg.locator('#app').inner_text()
        assert 'Transcribed from the recording' in t and 'German' in t, t[:400]
        assert '1 passage is marked unclear' in t, t[:600]
        assert pg.locator('.seg.unclear').count()==1
        expect(pg.locator('.seg.unclear .lowp')).to_have_text('Der')
        expect(pg.locator('.seg.unclear')).to_contain_text('I have not guessed or fixed anything')
        # the words are shown exactly as heard
        assert 'Der Wert ist etwa vierzig, glaube ich.' in pg.locator('.seg.unclear .segtext').inner_text()
    ck('unclear passage: marked, uncertain word underlined, text untouched', orig)
    lid=lambda: pg.evaluate("location.hash.split('/')[2]")
    def cite():
        L=lid()
        pg.evaluate("""async (L)=>{const s=await import('/js/store.js');
          s.add('notes',{id:'nt1',courseId:s.lec(L).courseId,title:'t',blocks:[{id:'b1',type:'ref',ref:{type:'seg',lectureId:L,seg:1,t:6},quote:'Der Wert ist etwa vierzig, glaube ich.'}],created:Date.now()});
          s.add('tasks',{id:'tk1',courseId:s.lec(L).courseId,title:'x',status:'open',ref:{type:'seg',lectureId:L,seg:1,t:6}});}""",L)
    ck('(setup) a note and a task cite line 2', cite)
    def again():
        pg.locator('[data-act=lecMenu]').click(); pg.locator('#sheet [data-act=retranscribe]').click()
        expect(pg.locator('#sheet')).to_contain_text('never changed'); pg.select_option('#askform select','en')
        pg.locator('#askform button[type=submit]').click(); pg.wait_for_selector('#pdone a.btn', timeout=20000); pg.locator('#pdone a.btn').click(); pg.wait_for_selector('.ltabs')
        r=pg.evaluate("""async (L)=>{const s=await import('/js/store.js');const l=s.lec(L);const ch=await s.getChunks(L+':');
          return {versions:(l.tversions||[]).length, old:(l.tversions||[])[0]&&l.tversions[0].segments.length, audio:ch.length, ref:s.D.notes.find(n=>n.id==='nt1').blocks[0].ref, task:s.D.tasks.find(t=>t.id==='tk1').ref, lang:l.lang}}""",lid())
        assert r['versions']==1 and r['old']==2, r
        assert r['audio']>=1, r                      # the recording is still there
        assert r['ref']['type']=='audio' and r['ref']['t']==6 and 'seg' not in r['ref'], r   # citation now points at the exact moment of the recording
        assert r['task']['type']=='audio', r
        assert r['lang']=='en', r
    ck('transcribe again: old version archived, recording kept, citations become exact audio moments', again)
    def versions():
        pg.goto(URL+'#/l/'+lid()+'/orig'); pg.wait_for_selector('.seg')
        expect(pg.locator('#app')).to_contain_text('1 earlier version'); pg.locator('[data-act=tversions]').first.click()
        expect(pg.locator('#sheet')).to_contain_text('Transcript versions'); pg.locator('#sheet [data-act=restoreVersion]').click()
        pg.locator('#askform button[type=submit], #sheet [data-act=yes], #sheet .btn:not(.ghost):not(.soft)').last.click() if pg.locator('#askform').count() else None
    ck('versions sheet opens and offers to switch back', versions)
    def live():
        pg.goto(URL); pg.wait_for_selector('.hello'); pg.locator('[data-act=startRec]').first.click(); pg.wait_for_selector('#clock'); pg.wait_for_timeout(2500)
        expect(pg.locator('#reclang')).to_be_visible(); expect(pg.locator('#app')).to_contain_text('rough preview')
        pg.locator('[data-act=stopRec]').click(); pg.locator('#askform button[type=submit]').click(); pg.wait_for_selector('#pdone a.btn', timeout=20000)
        pg.locator('#pdone a.btn').click(); pg.wait_for_selector('.ltabs')
        r=pg.evaluate("""async ()=>{const s=await import('/js/store.js');const l=s.D.lectures[s.D.lectures.length-1];return {src:l.transcriptSource,n:l.segments.length,eng:l.stt&&l.stt.engine}}""")
        assert r['src']=='stt' and r['n']==2 and r['eng']=='fake', r
    ck('live recording: stop -> faithful transcript made from the recording automatically', live)
    ck('no page errors', lambda: (_ for _ in ()).throw(AssertionError(errs)) if errs else None)
    b.close()
bad=[n for n,ok in results if not ok]
print('\n%d/%d passed'%(len(results)-len(bad),len(results)))
raise SystemExit(1 if bad else 0)
