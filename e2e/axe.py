from playwright.sync_api import sync_playwright
import json
AX=open('node_modules/axe-core/axe.min.js').read()
import os
URL=os.environ.get('URL','http://localhost:8799/')
pages=[('home','#/'),('course','#/c/esc401'),('lecture orig','#/l/demo/orig'),('clean','#/l/demo/notes'),('kitten','#/l/demo/kitten'),('tasks','#/l/demo/tasks'),('inbox','#/inbox'),('search','#/s/exit'),('concept','#/k/shell'),('glossary','#/c/esc401/glossary')]
with sync_playwright() as p:
    b=p.chromium.launch()
    for scheme in ['light','dark']:
        ctx=b.new_context(viewport={'width':1280,'height':900}, color_scheme=scheme); pg=ctx.new_page(); pg.goto(URL); pg.wait_for_selector('.hello')
        for n,h in pages:
            pg.goto(URL+h); pg.wait_for_timeout(500)
            pg.evaluate("document.querySelectorAll('canvas').forEach(c=>c.remove())")
            pg.add_script_tag(content=AX)
            r=pg.evaluate("axe.run({runOnly:['wcag2a','wcag2aa','wcag21aa']}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,2).map(x=>x.target.join(' ')+' :: '+(x.failureSummary||'').split('\\n')[1]).join(' | ')})))")
            print(scheme,n,[ (v['id'],v['n']) for v in r])
            for v in r: print('    ',v['id'],v['impact'],v['ex'][:300])
    b.close()
