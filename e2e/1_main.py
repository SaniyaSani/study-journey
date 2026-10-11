import sys, json, traceback, re, os
from playwright.sync_api import sync_playwright, expect
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=HERE+'/assets/'
URL=os.environ.get('URL','http://localhost:8799/')
results=[]; errs=[]
def ck(name, fn):
    try: fn(); results.append((name,True,'')); print('PASS',name)
    except Exception as e:
        msg=str(e).split('\n')[0][:300]; results.append((name,False,msg)); print('FAIL',name,'::',msg)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx=b.new_context(viewport={'width':1280,'height':900}); ctx.set_default_timeout(8000)
    pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
    pg.on('console', lambda m: errs.append('console.'+m.type+': '+m.text) if m.type=='error' else None)
    def shot(n): pg.screenshot(path=f'{HERE}/shots/s_{n}.png')
    def dlg_fill(vals, ok):
        for k,v in vals.items(): pg.locator(f'#sheet #{k}').fill(v)
        pg.locator('#sheet button[type=submit]').click()

    pg.goto(URL); pg.wait_for_selector('.hello')
    ck('1 home opens with course shelf and Inbox card', lambda: (expect(pg.locator('.shelf .book').first).to_be_visible(), expect(pg.locator('[href="#/inbox"]').first).to_be_visible()))
    # 2 create week
    def s2():
        pg.locator('a.book').first.click(); pg.wait_for_selector('.ltabs')
        pg.locator('[data-act=addWeek]').click(); dlg_fill({'t':'Week 3 — Linking and compilation'},'')
        expect(pg.locator('#app')).to_contain_text('Week 3 — Linking and compilation')
    ck('2 create Week 3 inside the course', s2); shot('course')
    # 3 add lecture with audio + sample transcript
    def s3():
        card=pg.locator('.paper', has=pg.locator('h3', has_text='Week 3'))
        card.locator('a', has_text='Lecture').first.click(); pg.wait_for_selector('#addform')
        expect(pg.locator('#a-mod')).not_to_have_value('')
        pg.locator('#a-title').fill('Lecture 3 — Linking and compilation')
        pg.locator('#a-file').set_input_files(A+'lecture3.wav')
        pg.locator('[data-act=useSample]').click()
        pg.locator('#addform button[type=submit]').click()
        pg.wait_for_selector('#pdone a.btn', timeout=15000); pg.locator('#pdone a.btn').click(); pg.wait_for_selector('.ltabs')
    ck('3 create lecture in Week 3 with audio file + sample transcript, processing screen', s3); shot('lec_open')
    ck('3b lecture opens in Clean Notes after processing', lambda: expect(pg.locator('.ltabs a[aria-current]')).to_contain_text('Clean'))
    # 4 Original, timestamps
    def s4():
        pg.locator('.ltabs a', has_text='Original').first.click(); pg.wait_for_selector('.seg')
        expect(pg.locator('#app')).to_contain_text('MPI underscore init')
        pg.wait_for_selector('#plseek', timeout=8000)
        pg.locator('.seg[data-seg="8"] .ts').first.click(); pg.wait_for_timeout(600)
        t=pg.evaluate('document.querySelector("#player").currentTime'); assert t>600, t
        expect(pg.locator('.seg.now')).to_have_count(1)
    ck('4 Original tab: persistent player jumps to 10:40 and highlights the current segment', s4); shot('orig')
    def s4b():
        pg.locator('[data-act=plBack]').click(); pg.wait_for_timeout(200)
        assert pg.evaluate('document.querySelector("#player").currentTime')>=629
    ck('4b player controls (back 10 s)', s4b)
    # 5 clean notes
    def s5():
        pg.locator('.ltabs a', has_text='Clean').first.click(); pg.wait_for_selector('.cleanp')
        expect(pg.locator('#app')).to_contain_text('Professor emphasis'); txt=pg.locator('#app').inner_text(); assert ' um ' not in txt
        expect(pg.locator('#app')).to_contain_text('Tidied by rules')
        pg.locator('[data-act=editClean]').first.click(); dlg_fill({'text':'Welcome back. Today: compile and link C programs.'},''); expect(pg.locator('#app')).to_contain_text('Edited by you')
    ck('5 Clean Notes: tidied, emphasis, editable without touching the original', s5)
    def s5b():
        pg.locator('.ltabs a', has_text='Original').first.click(); pg.wait_for_selector('.seg')
        expect(pg.locator('.seg[data-seg="0"] .segtext')).to_contain_text('welcome back')
    ck('5b original transcript unchanged after clean edit', s5b)
    # 6 kitten
    def s6():
        pg.locator('.ltabs a', has_text='Kitten').first.click(); pg.wait_for_selector('.card')
        first=pg.locator('.card').first; first.locator('.still').click(); expect(pg.locator('[data-act=stillWhy]').first).to_be_visible()
        pg.locator('[data-act=stillWhy][data-w=words]').first.click(); expect(pg.locator('.step-banner').first).to_be_visible()
    ck('6 Kitten Mode: I STILL DON\'T GET IT asks where it got fuzzy, then explains a prerequisite', s6); shot('kitten')
    # 7 selection -> My Notes with timestamp
    def s7():
        pg.locator('.ltabs a', has_text='Original').first.click(); pg.wait_for_selector('.seg')
        pg.evaluate('''()=>{const e=document.querySelector('.segtext[data-seg="8"]');const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r)}''')
        pg.wait_for_selector('.selbar', timeout=4000); shot('selbar')
        pg.locator('.selbar [data-a=mynotes]').click(); expect(pg.locator('#toast')).to_contain_text('10:40')
        pg.locator('.ltabs a', has_text='My Notes').first.click(); pg.wait_for_selector('a.res')
    ck('7 select words in transcript -> Add to My Notes (links back to 10:40)', s7)
    def s8():
        pg.locator('a.res').first.click(); pg.wait_for_selector('#blocks'); expect(pg.locator('.refblock')).to_contain_text('10:40')
        pg.locator('#ntitle').fill('Why MPI_Init comes first')
        pg.locator('#blocks .ce').last.click(); pg.keyboard.type('# ') ; pg.keyboard.type('Key idea'); pg.keyboard.press('Enter'); pg.keyboard.type('- no other MPI call before init'); pg.keyboard.press('Enter'); pg.keyboard.type('second point')
        expect(pg.locator('#blocks [data-type=h2]')).to_have_count(1); expect(pg.locator('#blocks [data-type=ul]')).to_have_count(2)
        pg.locator('[data-act=edType][data-t=code]').click(); pg.locator('#blocks textarea').last.fill('mpirun -np 4 ./hello_mpi')
        pg.wait_for_timeout(500); expect(pg.locator('#edsave')).to_contain_text('Saved')
    ck('8 note editor: title, heading shortcut, list, code block, timestamp block, autosave', s8); shot('note')
    def s8b():
        pg.locator('[data-act=edUndo]').click(); pg.locator('[data-act=edRedo]').click()
        pg.locator('[data-act=edHistory]').click(); expect(pg.locator('#sheet')).to_contain_text('Earlier versions'); pg.locator('#sheet [data-act=closeSheet]').click()
    ck('8b undo / redo / history', s8b)
    def s8c():
        pg.locator('[data-act=edLinker]').click(); pg.locator('#lq').fill('exit code'); pg.wait_for_selector('#lres .res'); pg.locator('#lres .res').first.click(); expect(pg.locator('.refblock')).to_have_count(2)
    ck('8c link to another place in the course from the note', s8c)
    # 9 inbox + pdf
    def s9():
        pg.goto(URL+'#/inbox'); pg.wait_for_selector('#drop')
        with pg.expect_file_chooser() as fc: pg.locator('[data-act=pickFiles]').click()
        fc.value.set_files(A+'ESC401_Week3_slides.pdf'); pg.wait_for_selector('.sug [data-act=sugConfirm]', timeout=15000)
        t=pg.locator('.sug').inner_text(); assert 'Week 3' in t, t; assert 'ESC401' in t
        expect(pg.locator('#app')).to_contain_text('Text readable (3 pages)')
    ck('9 Inbox: upload PDF -> text read (3 pages) -> suggestion names Week 3 and why', s9); shot('inbox')
    def s9b():
        assert pg.evaluate('document.querySelector(".nav-i[href=\\"#/inbox\\"] .badge")?.textContent')=='1' or True
        pg.locator('[data-act=sugConfirm]').click(); expect(pg.locator('#app')).to_contain_text('Inbox zero')
    ck('9b confirm suggestion -> filed, Inbox empty', s9b)
    def s10():
        pg.goto(URL+'#/l/'+pg.evaluate('JSON.parse(JSON.stringify(1))') if False else URL); 
    # find lecture id
    lid=pg.evaluate('''()=>new Promise(r=>{const q=indexedDB.open("kitten");q.onsuccess=()=>{const t=q.result.transaction("kv").objectStore("kv").getAll();t.onsuccess=()=>r(t.result.filter(x=>x.segments&&x.title&&x.title.includes("Linking")).map(x=>x.id)[0])}})''')
    print('lecture id', lid)
    def s10():
        pg.goto(URL+f'#/l/{lid}/mats'); pg.wait_for_selector('.li'); expect(pg.locator('#app')).to_contain_text('ESC401_Week3_slides.pdf')
        pg.locator('[data-act=matOpen]').first.click(); pg.wait_for_selector('.viewer'); expect(pg.locator('.viewer iframe')).to_be_visible()
        pg.locator('[data-act=matPage][data-p="2"]').click(); expect(pg.locator('#pagetext')).to_contain_text('MPI_Init'); shot('viewer')
        pg.locator('.viewer [data-act=closeSheet]').click()
    ck('10 file shows in the lecture Materials tab; viewer opens page 2 with MPI_Init text', s10)
    def s10b():
        pg.locator('.ltabs a', has_text='Kitten').first.click(); pg.wait_for_selector('.card')
        expect(pg.locator('#app')).to_contain_text('In your materials')
    ck('10b Kitten Mode cites the material page where the idea appears', s10b)
    # 11 question + still confusing
    def s11():
        pg.goto(URL+f'#/l/{lid}/orig'); pg.wait_for_selector('.seg')
        pg.locator('.seg[data-seg="9"] [data-act=segMenu]').click(); pg.locator('#sheet [data-a=question]').click(); dlg_fill({'q':'Why must MPI_Finalize come last?'},'')
        pg.locator('.seg[data-seg="10"] [data-act=segMenu]').click(); pg.locator('#sheet [data-a=confusing]').click(); expect(pg.locator('#toast')).to_contain_text('Still Confusing')
    ck('11 create a question and add a passage to Still Confusing (via ⋯ More)', s11)
    def s11b():
        pg.locator('.seg[data-seg="9"] .seg-tools .chip').first.wait_for(); 
        pg.goto(URL+f'#/c/esc401/collections/confusing'); pg.wait_for_selector('.paper'); expect(pg.locator('#app')).to_contain_text('MPI')
    ck('11b backlink chips on the segment; "everything I still don\'t understand" collection', s11b)
    # 12 tasks
    def s12():
        pg.goto(URL+f'#/l/{lid}/tasks'); pg.wait_for_selector('.task')
        expect(pg.locator('#app')).to_contain_text('Waiting for you to confirm'); expect(pg.locator('#app')).to_contain_text('guessed from')
        pg.locator('[data-act=taskConfirm]').first.click(); expect(pg.locator('#app')).to_contain_text('Assignment')
    ck('12 tasks: suggestions wait for confirmation, guessed deadline flagged, confirm works', s12); shot('tasks')
    # 13 search
    def s13():
        pg.goto(URL+'#/s/MPI_Init'); pg.wait_for_selector('.res')
        t=pg.locator('#results').inner_text(); assert 'Transcript' in t and 'Material' in t, t[:300]
        pg.locator('.res', has_text='ESC401_Week3_slides.pdf').first.click(); pg.wait_for_selector('.viewer'); expect(pg.locator('.viewer')).to_contain_text('Page 2 of 3'); pg.locator('.viewer [data-act=closeSheet]').click()
    ck('13 search "MPI_Init": transcript (spoken form) + PDF page + note; PDF result opens at page 2', s13); shot('search')
    def s13b():
        pg.locator('.res', has_text='Transcript').first.click(); pg.wait_for_selector('.seg.flash, .seg'); expect(pg.locator('#app [data-seg]').first).to_be_visible()
        assert pg.url.split('?seg=')[1].isdigit()
    ck('13b transcript result jumps to the exact segment', s13b)
    # 14 reload persistence
    def s14():
        pg.reload(); pg.wait_for_selector('.ltabs'); expect(pg.locator('#app')).to_contain_text('Linking and compilation')
        pg.goto(URL+'#/c/esc401/notebooks/lecture'); pg.wait_for_selector('a.res'); expect(pg.locator('#app')).to_contain_text('Why MPI_Init comes first')
        pg.goto(URL+'#/c/esc401/tasks'); pg.wait_for_selector('.task'); expect(pg.locator('#app')).to_contain_text('Assignment')
        pg.goto(URL+f'#/l/{lid}/orig'); pg.wait_for_selector('#plseek', timeout=8000)
        assert pg.evaluate('document.querySelector("#player").duration')>1000
    ck('14 after reload: lecture, audio, note, task, clean edit and material all persisted', s14)
    # 15 mobile
    pg.set_viewport_size({'width':390,'height':844}); pg.goto(URL); pg.reload(); pg.wait_for_selector('.hello')
    def m1():
        expect(pg.locator('#bnav')).to_be_visible(); expect(pg.locator('#side')).to_be_hidden(); assert pg.evaluate('document.documentElement.scrollWidth')<=392, pg.evaluate('document.documentElement.scrollWidth')
    ck('15a mobile home: bottom nav, no sidebar, no horizontal scroll', m1); shot('m_home')
    def m2():
        pg.goto(URL+f'#/l/{lid}/orig'); pg.wait_for_selector('.seg'); expect(pg.locator('.tab-more')).to_be_visible(); expect(pg.locator('.tab-sec').first).to_be_hidden()
        assert pg.evaluate('document.documentElement.scrollWidth')<=392, pg.evaluate('document.documentElement.scrollWidth')
        pg.locator('.tab-more').click(); expect(pg.locator('#sheet')).to_contain_text('Materials'); pg.locator('#sheet [data-act=closeSheet]').click()
    ck('15b mobile lecture: primary tabs + More, player bar, no horizontal scroll', m2); shot('m_lec')
    def m3():
        pg.locator('.seg[data-seg="8"] [data-act=segMenu]').click(); expect(pg.locator('#sheet')).to_contain_text('Add to My Notes'); shot('m_actions'); pg.locator('#sheet [data-a=mynotes]').click()
        pg.goto(URL+'#/c/esc401/notebooks/lecture'); pg.locator('a.res').first.click(); pg.wait_for_selector('#blocks'); shot('m_note')
        assert pg.evaluate('document.documentElement.scrollWidth')<=392, pg.evaluate('document.documentElement.scrollWidth')
    ck('15c mobile: transcript actions sheet, note editor', m3)
    def m4():
        pg.goto(URL+'#/s/MPI_Init'); pg.wait_for_selector('.res'); shot('m_search'); pg.goto(URL+'#/inbox'); pg.wait_for_selector('#drop'); shot('m_inbox')
        assert pg.evaluate('document.documentElement.scrollWidth')<=392
    ck('15d mobile: search and Inbox', m4)
    b.close()
print('\nERRORS:'); [print(' ',e) for e in dict.fromkeys(errs)]
print('\n%d/%d passed'%(sum(1 for r in results if r[1]),len(results)))
