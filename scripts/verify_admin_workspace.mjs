/* 实际后端只读验收：按浏览器视口截图，检查页面与面板均未靠裁切隐藏溢出。 */
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const out=path.resolve('artifacts/fandian-workspace')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'})
const report={at:new Date().toISOString(),errors:[],pageErrors:[],unexpectedWrites:[],viewports:[],checks:[]}
page.on('pageerror',error=>report.pageErrors.push(error.message))
page.on('request',request=>{if(request.url().includes('/campus/')&&!['GET','HEAD'].includes(request.method())&&!request.url().endsWith('/auth/login'))report.unexpectedWrites.push(request.url())})
const nav=label=>page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name:label,exact:true}).click()
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
try{
  await page.goto('http://127.0.0.1:15173/#/admin')
  await page.screenshot({path:path.join(out,'login.png')})
  await page.getByRole('button',{name:'使用管理体验账号',exact:true}).click()
  await expect(page.locator('.pd-sync')).toContainText('更新于',{timeout:30000})
  await page.locator('.toast').waitFor({state:'hidden'})
  await page.evaluate(()=>document.fonts.ready)
  await expect(page).toHaveTitle(/饭点/)
  await expect(page.locator('.admin-header-inner .fandian-logo')).toHaveJSProperty('complete',true)
  await expect(page.locator('.admin-header-account .avatar svg')).toHaveCount(1)
  report.checks.push('饭点标志、浏览器标题和人物头像')
  for(const [width,height] of [[1440,900],[1366,768],[1440,720],[1920,1080],[1188,800],[1024,768]]){
    await page.setViewportSize({width,height})
    for(const [label,module] of [['经营概览','dashboard'],['预约订单','orders'],['菜品与库存','menu'],['学生反馈','feedback'],['运营设置','settings']]){
      await nav(label);await settle()
      const metrics=await page.evaluate(()=>{
        const selectors=['.fn-card','.fn-metric','.fn-wallets','.fn-list-viewport','.dispatch-list-viewport']
        const panels=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(el=>({selector,classes:el.className,height:el.clientHeight,scrollHeight:el.scrollHeight,rectBottom:el.getBoundingClientRect().bottom})))
        const pagers=[...document.querySelectorAll('.admin-pagination')].map(el=>({label:el.getAttribute('aria-label'),text:el.innerText,bottom:el.getBoundingClientRect().bottom}))
        return {height:innerHeight,width:innerWidth,documentHeight:document.documentElement.scrollHeight,documentWidth:document.documentElement.scrollWidth,panels,pagers}
      })
      report.viewports.push({width,height,module,...metrics})
      if(metrics.documentHeight>height+1||metrics.documentWidth>width+1)report.errors.push(`${width}x${height} ${module}: 页面溢出 ${metrics.documentWidth}x${metrics.documentHeight}`)
      for(const item of metrics.panels){if(item.height>0&&item.scrollHeight>item.height+3)report.errors.push(`${width}x${height} ${module}: 面板溢出 ${item.classes} ${item.scrollHeight}/${item.height}`)}
      for(const pager of metrics.pagers){if(pager.bottom>height-4)report.errors.push(`${width}x${height} ${module}: 分页超出视口`)}
      if(width===1440&&height===900||module==='dashboard'&&[1366,1920].includes(width))await page.screenshot({path:path.join(out,`${module}-${width}x${height}.png`),animations:'disabled'})
    }
  }
  await page.setViewportSize({width:1440,height:900});await nav('菜品与库存');await settle()
  const pager=page.getByRole('navigation',{name:'菜品分页',exact:true})
  const first=await page.locator('.data-table tbody tr').first().innerText()
  await pager.getByRole('button',{name:'下一页',exact:true}).click()
  expect(await page.locator('.data-table tbody tr').first().innerText()).not.toBe(first)
  await expect(pager.getByRole('button',{name:'第2页',exact:true})).toHaveAttribute('aria-current','page')
  await page.getByRole('textbox',{name:'搜索菜品',exact:true}).fill('照烧')
  await expect(pager.getByRole('button',{name:'第1页',exact:true})).toHaveAttribute('aria-current','page')
  await expect(page.locator('.data-table tbody')).toContainText('照烧')
  report.checks.push('菜品分页、页码和搜索重置')
  await nav('预约订单');await page.locator('.dispatch-filters').getByRole('button',{name:'全部',exact:true}).click();await settle()
  const orderPager=page.getByRole('navigation',{name:'预约订单分页',exact:true})
  const orderFirst=await page.locator('.dispatch-order').first().innerText()
  await orderPager.getByRole('button',{name:'下一页',exact:true}).click()
  await expect.poll(()=>page.locator('.dispatch-order').first().innerText()).not.toBe(orderFirst)
  await page.locator('.dispatch-order .dispatch-expand').first().click()
  await expect(page.locator('.pd-dialog[open]')).toContainText('订单明细')
  await page.keyboard.press('Escape')
  report.checks.push('预约分页与详情抽屉')
}catch(error){report.errors.push(error.stack||error.message)}
finally{await browser.close()}
report.pass=!(report.errors.length||report.pageErrors.length||report.unexpectedWrites.length)
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({pass:report.pass,checks:report.checks,errors:report.errors,pageErrors:report.pageErrors,viewports:report.viewports.length,unexpectedWrites:report.unexpectedWrites}))
if(!report.pass)process.exitCode=1
