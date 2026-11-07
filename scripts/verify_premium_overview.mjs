/* 管理端参考图验收：真实会话只读；业务流写入全部由隔离浏览器拦截，不写数据库。 */
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import { orderPageFixture } from './lib/order-page-fixture.mjs'

const root=fileURLToPath(new URL('../',import.meta.url)), out=path.join(root,'artifacts/finexy-reference')
const base='http://127.0.0.1:15173', report={at:new Date().toISOString(),scope:'Finexy 参考图管理端 · 浏览器验收',checks:[],errors:[],writes:[],consoleErrors:[]}
const sandbox={window:{}};vm.runInNewContext(await readFile(path.join(root,'design-exploration/assets/data.js'),'utf8'),sandbox)
const sample=sandbox.window.EXPLORATION_DATA
// 样本订单固定在同一个午餐班次，便于复查风险边界；真实会话仍使用当前日期。
const today='2026-11-05'
const dates=Array.from({length:7},(_,i)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(new Date(`${today}T12:00:00+08:00`).getTime()-(6-i)*86400000)))
const dishes=sample.sales.map(d=>({...d,id:d.id,name:d.name,windowName:sample.windows.find(w=>w.id===d.windowId).name,image:`/images/${d.image}.jpg`,categoryName:d.category,status:1,tags:'校园餐食'}))
const orders=sample.orders.map((o,i)=>({...o,id:1000+i,number:o.id,studentNo:`2026000${i+1}`,serviceDate:today,orderTime:`${today}T10:${10+i}:00`,windowName:sample.windows.find(w=>w.id===o.windowId).name,canteenName:sample.windows.find(w=>w.id===o.windowId).canteenName,items:[{id:i+1,name:sample.sales.find(d=>d.windowId===o.windowId).name,number:1,image:dishes.find(d=>d.windowId===o.windowId).image}]}))
orders.push({...orders[0],id:1010,number:'HX11051030',studentName:'赵同学',status:5},{...orders[1],id:1011,number:'HX11051029',studentName:'何同学',status:5})
await mkdir(out,{recursive:true})
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const options={viewport:{width:1440,height:960},deviceScaleFactor:1,reducedMotion:'reduce'}
const live=await browser.newPage(options)
const catalog=()=>JSON.parse(JSON.stringify(orders))
let records = catalog(), mode='sample', failPickup=false
const mockWrites=[]
const capture = (page,name,fullPage=false)=>page.screenshot({path:path.join(out,name+'.png'),fullPage,animations:'disabled'})
const nav=(page,label)=>page.getByRole('navigation',{name:'管理导航'}).getByRole('button',{name:label,exact:true}).click()
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width+1)
const issues=page=>page.on('pageerror',e=>report.consoleErrors.push(e.message))
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name)}
try {
  issues(live)
  await check('真实登录与管理员权限',async()=>{
    await live.goto(base+'/#/admin')
    await expect(live).toHaveURL(/admin\/login$/)
    await live.getByRole('button',{name:'使用管理体验账号',exact:true}).click()
    await expect(live.locator('.pd-sync')).toContainText('更新于')
  })
  await live.locator('.toast').waitFor({state:'hidden'})
  await capture(live,'live-overview')
  await nav(live,'预约订单')
  await expect(live.locator('#dispatch-code')).toBeVisible()
  await capture(live,'live-orders')
  const session=await live.evaluate(()=>sessionStorage.getItem('hexu.session'))
  const account=JSON.parse(session).account
  const ctx=await browser.newContext(options)
  // 所有模拟写入都在浏览器路由内处理，拒绝向真实服务转发。
  await ctx.addInitScript(value=>sessionStorage.setItem('hexu.session',value),session)
  await ctx.route('**/campus/**',async route=>{
    const req=route.request(), p=new URL(req.url()).pathname.replace('/campus','')
    const ok=data=>route.fulfill({json:{code:1,data}})
    if(req.method()!=='GET'){
      mockWrites.push([req.method(),p,req.postDataJSON()])
      const transition=p.match(/^\/staff\/orders\/(\d+)\/(accept|ready)$/)
      if(req.method()==='POST' && transition){
        const row=records.find(o=>o.id===Number(transition[1])), required=transition[2]==='accept'?2:3
        if(row?.status===required){row.status++;return ok(row)}
      }
      if(req.method()==='POST' && p==='/staff/pickup'){
        if(failPickup)return route.fulfill({json:{code:0,msg:'本窗口没有找到这个取餐码'}})
        const row=records.find(o=>o.id===1000)
        if(req.postDataJSON()?.code==='ABCDEFGH' && row.status===4){row.status=5;return ok(row)}
      }
      report.errors.push('Unexpected write '+p);return route.abort()
    }
    if(p==='/staff/orders/page')return ok(orderPageFixture(mode==='empty'?[]:records,req.url()))
    const empty=mode==='empty'
    const data={
      '/me':account,'/public/windows':sample.windows,'/public/menu':dishes,
      '/staff/dashboard':{summary:empty?{}:{...sample.summary,...(mode==='large'?{revenue:9876543210.99}:{})},
        trend:dates.map((day,i)=>({day,amount:empty?0:sample.trend[i]})),
        sales:empty?[]:sample.sales.map(s=>({name:s.name,value:s.value})),preferences:empty?[]:sample.preferences},
      '/staff/orders':empty?[]:records,'/staff/menu':empty?[]:dishes,'/staff/menu/options':{windows:sample.windows,categories:dishes.map(d=>({id:d.categoryId,name:d.categoryName,status:1}))},
      '/staff/feedback':empty?[]:sample.feedback.map(row=>({...row,displayName:'示例学生',createdAt:'11-05 10:00'}))
    }
    if(!(p in data)){report.errors.push('Unexpected GET '+p);return route.abort()}
    return ok(data[p])
  })
  const page=await ctx.newPage();issues(page)
  await page.clock.setFixedTime(new Date(today+'T11:35:00+08:00'))
  await page.goto(base+'/#/admin')
  await expect(page.locator('.pd-revenue-number')).toContainText('18,624')
  await page.locator('.edition-feature img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())))
  await capture(page,'overview');await capture(page,'overview-full',true)
  await check('总览营收、均价与榜首均可追溯',async()=>{
    await expect(page.locator('.edition-facts')).toContainText('18.33')
    await expect(page.locator('.edition-feature').first()).toContainText('照烧鸡腿饭')
    await page.locator('.edition-feature').first().click()
    await expect(page.locator('dialog[open]')).toContainText('23 份')
    await page.keyboard.press('Escape')
    await expect(page.locator('.fn-metric')).toHaveCount(4)
    await expect(page.locator('.fn-card')).toHaveCount(6)
    await expect(page.getByRole('progressbar',{name:'累计订单核销比例'})).toHaveAttribute('aria-valuenow','80.8')
  })
  await check('ECharts 切换时段、加载真实画布',async()=>{
    await expect(page.locator('.pd-chart canvas')).toHaveCount(1)
    await page.getByRole('button',{name:'取餐',exact:true}).click()
    await expect(page.locator('.ed-trend h2')).toHaveText('取餐时段')
    await page.getByRole('button',{name:'近七日',exact:true}).click()
  })
  await check('查找预约、详情、专注、导出',async()=>{
    await page.keyboard.press('/');await expect(page.getByLabel('搜索近期预约')).toBeFocused()
    await page.getByLabel('搜索近期预约').fill('林同学')
    await page.getByRole('button',{name:'查看林同学的预约详情'}).click()
    await expect(page.locator('dialog[open]')).toContainText('少辣');await page.keyboard.press('Escape')
    await page.getByTitle('进入专注视图').click();await expect(page.locator('.site-header')).toBeHidden()
    await page.getByTitle('退出专注视图').click()
    const result=page.waitForEvent('download');await page.getByTitle('导出经营概览').click();expect((await result).suggestedFilename()).toMatch(/经营概览.*csv/)
  })
  await check('状态筛选、帮助和主题切换可用',async()=>{
    await page.getByLabel('搜索近期预约').fill('')
    await page.locator('.fn-filter summary').click()
    await page.locator('.fn-filter').getByRole('button',{name:'已完成',exact:true}).click()
    await expect(page.locator('.fn-orders-table tbody tr')).toHaveCount(2)
    await page.locator('.fn-filter summary').click()
    await page.locator('.fn-filter').getByRole('button',{name:'全部预约',exact:true}).click()
    await page.getByRole('button',{name:'深色外观',exact:true}).click()
    await expect(page.locator('body')).toHaveClass(/admin-dark/)
    await page.getByRole('button',{name:'浅色外观',exact:true}).click()
    await expect(page.locator('body')).not.toHaveClass(/admin-dark/)
    await page.getByRole('button',{name:'管理端使用帮助',exact:true}).click()
    await expect(page.locator('.fn-help-dialog[open]')).toContainText('八位取餐码')
    await page.keyboard.press('Escape')
  })
  await check('总览状态直接进入对应队列',async()=>{
    await page.getByRole('button',{name:'处理待接单预约'}).click()
    await expect(page.locator('.dispatch-filters button[aria-pressed=true]')).toHaveText('待接单')
    await expect(page.locator('.dispatch-order')).toHaveCount(2)
    await page.locator('.dispatch-filters').getByRole('button',{name:'进行中'}).click()
    await expect(page.locator('.dispatch-order')).toHaveCount(6)
    await expect(page.locator('.dispatch-risk').first()).toContainText('距结束 5 分钟')
    await expect(page.locator('.dispatch-risk').filter({hasText:'已过取餐时段'}).first()).toBeVisible()
  })
  await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.toast').waitFor({state:'hidden'})
  await capture(page,'orders');await noOverflow(page)
  await check('订单搜索、备注、菜品明细与独立核销工具',async()=>{
    await page.getByLabel('搜索预约订单').fill('林同学');await expect(page.locator('.dispatch-order')).toHaveCount(1)
    await page.getByRole('button',{name:'展开林同学的订单明细'}).click()
    await expect(page.locator('.dispatch-details')).toContainText('20260001')
    await page.keyboard.press('Escape')
    await page.getByLabel('搜索预约订单').fill('')
    await page.getByRole('button',{name:'输入取餐码',exact:true}).first().click()
    await expect(page.locator('#dispatch-code')).toBeFocused();await expect(page.locator('#dispatch-code')).toHaveValue('')
  })
  await check('隔离样本接单→备妥→凭码核销，校验失败允许重试',async()=>{
    await page.getByLabel('搜索预约订单').fill('林同学')
    await expect(page.locator('.dispatch-order')).toHaveCount(1)
    await page.getByRole('button',{name:'接单并备餐'}).click()
    await page.getByRole('button',{name:'标记备妥'}).click()
    await page.getByRole('button',{name:'输入取餐码',exact:true}).click()
    failPickup=true
    await page.locator('#dispatch-code').fill('AAAAAAAA');await page.getByRole('button',{name:'确认核销'}).click()
    await expect(page.locator('.toast')).toContainText('本窗口没有找到这个取餐码')
    await expect(page.locator('#dispatch-code')).toHaveValue('AAAAAAAA')
    failPickup=false
    await page.locator('#dispatch-code').fill('abcdefgh');await page.getByRole('button',{name:'确认核销'}).click()
    await expect(page.locator('.ticket-result')).toContainText('林同学 已取餐')
    await page.getByLabel('关闭核销结果').click()
    await page.locator('.dispatch-filters').getByRole('button',{name:'已完成'}).click()
    await expect(page.locator('.dispatch-order')).toHaveCount(1)
    expect(mockWrites.map(w=>w[1])).toEqual(['/staff/orders/1000/accept','/staff/orders/1000/ready','/staff/pickup','/staff/pickup'])
  })
  await check('其余管理模块与表单仍可进入',async()=>{
    await page.getByRole('button',{name:'打开订单搜索',exact:true}).click()
    await expect(page.getByRole('textbox',{name:'搜索预约订单',exact:true})).toBeFocused()
    await nav(page,'菜品与库存');await page.getByRole('button',{name:'编辑',exact:true}).first().click()
    await page.getByRole('button',{name:'关闭菜品编辑'}).click()
    await capture(page,'menu')
    await nav(page,'学生反馈');await page.getByRole('button',{name:'回复这条建议'}).first().click()
    await page.getByRole('button',{name:'关闭回复'}).click()
    await capture(page,'feedback')
  })
  records=catalog();await page.reload();await expect(page.locator('.pd-sync')).toContainText('更新于')
  await check('1440、1188、1024、768、390 和 360 像素布局，无整页横向溢出',async()=>{
    for(const width of [1440,1188,1024,768,390,360]){
      await page.setViewportSize({width,height:width<=390?844:width===1188?869:960})
      await nav(page,'经营概览');await noOverflow(page)
      if(width===1188)await capture(page,'overview-reference-size')
      if(width===390)await capture(page,'overview-mobile')
      await nav(page,'预约订单');await noOverflow(page)
      if(width===390)await capture(page,'orders-mobile')
      for(const label of ['菜品与库存','学生反馈']){await nav(page,label);await noOverflow(page)}
    }
  })
  await check('空数据、大金额和刷新退出',async()=>{
    mode='empty';await page.reload();await expect(page.locator('.pd-revenue-number')).toContainText('0.00')
    await expect(page.locator('.pd-chart-empty')).toBeVisible()
    await expect(page.locator('.edition-feature')).toHaveCount(0);await noOverflow(page)
    mode='large';await page.reload();await expect(page.locator('.pd-revenue-number')).toContainText('9,876,543,210');await noOverflow(page)
    await live.reload();await expect(live.locator('.premium-overview')).toBeVisible()
    await live.locator('.admin-header-account summary').click()
    await live.locator('.admin-logout').click();await expect(live).toHaveURL(/admin\/login$/)
  })
} catch(error){report.errors.push(error.stack || error.message)}
finally {await browser.close()}
const prior=path.join(root,'design-exploration/premium-dark')
const baseline=JSON.parse(await readFile(path.join(prior,'before.json'),'utf8'))
// 菜品与运营扩展的授权文件由真实 SQL 测试覆盖；其余文件仍与原始界面改版基线逐项比较。
const menuExtensionFiles=new Set(['backend/sky-server/src/main/java/com/sky/campus/CampusAuthService.java','backend/sky-server/src/main/java/com/sky/campus/CampusRealm.java','backend/sky-server/src/main/java/com/sky/campus/CampusPassword.java','backend/sky-server/src/main/java/com/sky/campus/CampusOrderService.java','backend/sky-server/src/main/java/com/sky/handler/GlobalExceptionHandler.java','backend/.gitignore','backend/sky-pojo/src/main/java/com/sky/campus/CampusModels.java','backend/sky-server/src/main/java/com/sky/mapper/CampusMapper.java','backend/sky-server/src/main/resources/mapper/CampusMapper.xml','backend/sky-server/src/main/java/com/sky/campus/CampusCatalogService.java','web/src/state.js'])
report.menuExtensionVerification='scripts/verify_catalog_backend.py + scripts/verify_menu_management.mjs + scripts/verify_operations.mjs'
// 学生网页下线后的 Web 路由由独立浏览器回归覆盖。
report.webEntryVerification='scripts/verify_browser.mjs'
for(const [name,hash] of Object.entries(baseline)){
  if(menuExtensionFiles.has(name) || name==='web/src/main.js')continue
  if(name.startsWith('backend/') || name==='web/src/state.js'){
    if(createHash('sha256').update(await readFile(path.join(root,name))).digest('hex')!==hash)report.errors.push('业务基线有变化 '+name)
  }
}
const oldWorkbench=await readFile(path.join(prior,'Workbench.before.vue'),'utf8')
const current=await readFile(path.join(root,'web/src/pages/Workbench.vue'),'utf8')
for(const name of ['load','advance','pickup','sendReply']){
  const signature=source=>source.split(/\r?\n/).find(line=>line.startsWith('async function '+name+'('))
  if(!signature(current) || signature(current)!==signature(oldWorkbench))report.errors.push('业务处理有变化 '+name)
}
report.mockWrites=mockWrites.map(([method,p])=>({method,path:p}))
report.pass=!(report.errors.length || report.consoleErrors.length)
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1
