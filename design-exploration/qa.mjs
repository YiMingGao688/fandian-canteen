/* 只检查独立原型，截图与测试结果写在本目录；不调用真实业务接口。 */
import {chromium} from '../web/node_modules/@playwright/test/index.mjs'
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath, pathToFileURL} from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const root=fileURLToPath(new URL('.',import.meta.url)), project=path.dirname(root)
const read=async rel=>JSON.parse((await readFile(path.join(root,rel),'utf8')).replace(/^\uFEFF/,''))
const concepts=await read('concepts.json'), report={checkedAt:new Date().toISOString(),browser:'Microsoft Edge / Playwright',scope:'Standalone prototypes only',pages:[],errors:[]}
await mkdir(path.join(root,'qa'),{recursive:true})
await mkdir(path.join(root,'screenshots'),{recursive:true})
const context={window:{}};vm.runInNewContext(await readFile(path.join(root,'assets/data.js'),'utf8'),context)
const data=context.window.EXPLORATION_DATA
await writeFile(path.join(root,'mock-data.json'),JSON.stringify(data,null,2))
const sums=['revenue','totalOrders','todayOrders','completed','pending','preparing','ready']
report.dataChecks=sums.map(key=>({key,summary:data.summary[key],windowSum:data.windows.reduce((s,w)=>s+w[key],0),pass:data.summary[key]===data.windows.reduce((s,w)=>s+w[key],0)}))
report.dataChecks.push({key:'categoryTotal',pass:data.sales.reduce((s,x)=>s+x.value,0)===data.preferences.reduce((s,x)=>s+x.value,0)})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const browserContext=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'})
function assert(condition,message){if(!condition)throw Error(message)}
const overflow=()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,offenders:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+2&&getComputedStyle(el).position!=='fixed'&&!el.closest('.table-wrap,.occupancy,dialog')}).slice(0,8).map(el=>({tag:el.tagName,class:el.className,right:Math.round(el.getBoundingClientRect().right)}))})
try{
  for(const c of concepts){
    const page=await browserContext.newPage(), entry={id:c.id,name:c.name,jsErrors:[],externalRequests:[],checks:[]}
    page.on('pageerror',e=>entry.jsErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))entry.externalRequests.push(r.url())})
    await page.goto(pathToFileURL(path.join(root,`prototypes/${c.id}-${c.slug}.html`)).href)
    await page.evaluate(()=>document.fonts.ready)
    assert(await page.locator('h1').count()===1,'Missing page heading')
    assert((await page.locator('.hero-kpi strong,.kpi-strip strong').allTextContents()).join('').includes('18,624'),'Baseline revenue missing')
    entry.desktop=await page.evaluate(overflow)
    entry.desktop.height=await page.evaluate(()=>document.documentElement.scrollHeight)
    await page.screenshot({path:path.join(root,`screenshots/${c.id}-${c.slug}.png`),fullPage:true})
    await page.screenshot({path:path.join(root,`screenshots/${c.id}-${c.slug}-thumb.jpg`),type:'jpeg',quality:83,fullPage:false})
    try{
      await page.locator('[data-scope]').selectOption('1')
      assert((await page.locator('.hero-kpi strong,.kpi-strip strong').allTextContents()).join('').includes('8,240'),'Scope did not update revenue')
      entry.checks.push('scope: all -> window 1 -> all');await page.locator('[data-scope]').selectOption('0')
      await page.locator('[data-period="14"]').first().click();assert(await page.locator('[data-period="14"]').first().evaluate(el=>el.classList.contains('active')),'Period not selected');entry.checks.push('trend: 7 -> 14 days');await page.locator('[data-period="7"]').first().click()
      await page.locator('[data-order]').first().click();assert(await page.locator('#drawer').evaluate(el=>el.open),'Order drawer not open');assert((await page.locator('#drawer').innerText()).includes('预约详情'),'Wrong drawer');await page.keyboard.press('Escape');entry.checks.push('order drawer + Escape')
      await page.keyboard.press('/');assert(await page.locator('#drawer').evaluate(el=>el.open),'Search shortcut failed');await page.locator('#drawer input').fill('库存');await page.locator('#drawer form button').click();assert((await page.locator('#drawer').innerText()).includes('菜品与库存'),'Command search failed');await page.keyboard.press('Escape');entry.checks.push('keyboard search -> inventory')
      const download=page.waitForEvent('download');await page.locator('[data-action="export"]').click();assert((await download).suggestedFilename().endsWith('.csv'),'CSV export failed');entry.checks.push('local CSV export')
      await page.locator('[data-nav="orders"]').first().click();await page.locator('#drawer [data-order="HX11051038"]').click();await page.locator('[data-advance]').click();assert((await page.locator('#drawer .badge').innerText()).includes('备餐中'),'Advance failed');await page.keyboard.press('Escape');entry.checks.push('local order state: pending -> preparing')
      await page.locator('[data-nav="feedback"]').first().click();await page.locator('[data-reply]').first().click();await page.locator('textarea').fill('感谢建议，已收到。');await page.locator('[data-reply-form] button').click();assert(!await page.locator('#drawer').evaluate(el=>el.open),'Reply form failed');entry.checks.push('feedback mock form')
      if(c.id==='11'){
        assert(await page.locator('.hybrid-header .nav-item').count()===4,'Top business navigation missing');assert(await page.locator('.hybrid-toolbar .nav').count()===0,'Toolbar repeats navigation');
        assert(await page.locator('[data-action="export"]').count()===1,'Duplicate export action');
        const clear=await page.evaluate(()=>document.querySelector('.hybrid-main').getBoundingClientRect().bottom<=document.querySelector('.hybrid-toolbar-zone').getBoundingClientRect().top+1);assert(clear,'Toolbar overlaps content');entry.checks.push('top nav + Bento + separate toolbar');
        await page.locator('[data-hybrid="focus"]').click();assert(await page.locator('body').evaluate(el=>el.classList.contains('hybrid-focus')),'Focus mode failed');assert(!await page.locator('.hybrid-header').isVisible(),'Focus header still visible');await page.locator('[data-hybrid="focus"]').click();assert(await page.locator('.hybrid-header').isVisible(),'Focus mode not restored');entry.checks.push('focus mode enter + exit');
        await page.locator('.hybrid-tool-primary').click();assert(await page.locator('#drawer').evaluate(el=>el.open),'Quick order action failed');await page.keyboard.press('Escape');entry.checks.push('toolbar pending action');
        await page.locator('.hybrid-tool-search').click();assert(await page.locator('#drawer input').isVisible(),'Toolbar search failed');await page.keyboard.press('Escape');entry.checks.push('toolbar search');
        const scroll=await page.evaluate(()=>{const main=document.querySelector('.hybrid-main');main.scrollTop=200;return main.scrollTop});await page.locator('[data-hybrid="refresh"]').click();assert(await page.locator('.hybrid-main').evaluate((el,top)=>el.scrollTop===top,scroll),'Refresh lost scroll position');entry.checks.push('view refresh preserves scroll');
      }

    }catch(e){entry.checks.push('FAIL: '+e.message);report.errors.push(`${c.id}: ${e.message}`)}
    await page.reload();await page.setViewportSize({width:1024,height:900});entry.tablet=await page.evaluate(overflow)
    await page.setViewportSize({width:390,height:844});entry.mobile=await page.evaluate(overflow)
    await page.screenshot({path:path.join(root,`screenshots/${c.id}-${c.slug}-mobile.png`),fullPage:true})
    for(const [size,result] of [['desktop',entry.desktop],['tablet',entry.tablet],['mobile',entry.mobile]])if(result.overflow)report.errors.push(`${c.id} ${size} horizontal overflow ${result.scroll}/${result.width}`)
    if(entry.jsErrors.length||entry.externalRequests.length)report.errors.push(`${c.id} JS/network errors`)
    report.pages.push(entry);console.log(JSON.stringify({id:c.id,height:entry.desktop.height,checks:entry.checks.length,overflow:[entry.desktop.overflow,entry.tablet.overflow,entry.mobile.overflow]}));await page.close()
  }
  const gallery=await browserContext.newPage();await gallery.goto(pathToFileURL(path.join(root,'index.html')).href);await gallery.locator('.concept-card').last().waitFor();assert(await gallery.locator('.concept-card').count()===concepts.length,'Gallery missing concepts')
  await gallery.locator('[data-filter="经营分析"]').click();assert(await gallery.locator('.concept-card').count()===3,'Gallery filter failed');await gallery.locator('[data-filter="全部"]').click();await gallery.locator('[data-compare="01"]').check();await gallery.locator('[data-compare="10"]').check();await gallery.locator('#compare-open').click();assert(await gallery.locator('#compare-content section').count()===2,'Comparison failed');await gallery.locator('#compare-close').click();await gallery.locator('#compare-clear').click()
  await gallery.evaluate(async()=>{document.querySelectorAll('img').forEach(x=>x.loading='eager');await Promise.all([...document.images].map(x=>x.decode().catch(()=>{})));scrollTo(0,0)});await gallery.screenshot({path:path.join(root,'screenshots/gallery.png'),fullPage:true});await gallery.screenshot({path:path.join(root,'screenshots/gallery-top.png'),fullPage:false});await gallery.setViewportSize({width:390,height:844});await gallery.evaluate(()=>scrollTo(0,0));report.galleryMobile=await gallery.evaluate(overflow);await gallery.screenshot({path:path.join(root,'screenshots/gallery-mobile.png'),fullPage:false});report.galleryChecks=[`${concepts.length} entries`,'group filters','two-way compare','mobile layout']
  if(report.galleryMobile.overflow)report.errors.push('gallery mobile overflow')
  const research=await browserContext.newPage();await research.goto(pathToFileURL(path.join(root,'research.html')).href);assert(await research.locator('.research-case').count()===20,'Research cases missing');report.researchChecks={visualCases:20,restrictedLinks:18}
  // 1440px contact sheet only assembles screenshots of this task's own prototype pages.
  const sheet=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#e8ece2;font:14px 'Microsoft YaHei';padding:25px;color:#2e4938}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{background:white;padding:12px;border-radius:8px}.card img{width:100%;display:block}.card h2{font-size:15px;margin:5px 0 12px}</style><h1>禾序 · ${concepts.length}套独立管理首页 / 1440px 实际浏览器截图</h1><div class="grid">${concepts.map(c=>`<section class="card"><h2>${c.id} ${c.name} — ${c.tag}</h2><img src="../screenshots/${c.id}-${c.slug}-thumb.jpg"></section>`).join('')}</div>`
  await writeFile(path.join(root,'qa/contact-sheet.html'),sheet);await gallery.setViewportSize({width:1440,height:1000});await gallery.goto(pathToFileURL(path.join(root,'qa/contact-sheet.html')).href);await gallery.screenshot({path:path.join(root,'screenshots/all-concepts.png'),fullPage:true})
}finally{await browser.close()}
const baseline=await read('research/business-baseline.json'), changed=[]
for(const [relative,hash]of Object.entries(baseline)){const current=createHash('sha256').update(await readFile(path.join(project,relative))).digest('hex');if(current!==hash)changed.push(relative)}
report.businessSourceCheck={files:Object.keys(baseline).length,changed,pass:!changed.length};if(changed.length)report.errors.push('Business source files changed')
report.pass=!report.errors.length&&report.dataChecks.every(x=>x.pass)
await writeFile(path.join(root,'qa/verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,errors:report.errors,businessSourceCheck:report.businessSourceCheck}))
if(!report.pass)process.exitCode=1
