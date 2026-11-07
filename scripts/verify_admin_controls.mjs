/* 控件交互回归：全部 API 均在独立浏览器上下文拦截，写入不进入真实数据库。 */
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const baseline=process.argv.includes('--baseline'), phase=baseline?'before':'after'
const out=path.resolve('artifacts/admin-controls')
await mkdir(out,{recursive:true})
const report={phase,checks:[],errors:[],pageErrors:[],writes:[]}
const account={userId:1,role:'ADMIN',username:'ui_controls_test',displayName:'食堂管理员'}
const dishes=Array.from({length:14},(_,index)=>({id:index+1,name:['红烧牛肉面','鲜肉小馄饨','香煎鸡胸低脂餐','葱油拌面'][index%4]+(index>3?' '+(index+1):''),categoryId:11,calories:580,categoryName:'面点小吃',windowName:'麦香面馆',canteenName:'一食堂',windowId:1,image:'/images/noodles.jpg',price:16,stock:35,status:1,tags:'经典口味'}))
const feedback=[{id:1,displayName:'林同学',windowName:'麦香面馆',content:'希望增加取餐指引。',reply:null,createdAt:'11-07 10:00'},{id:2,displayName:'周同学',windowName:'麦香面馆',content:'希望增加清淡口味。',reply:'已收到建议。',createdAt:'11-07 09:00'}]
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addInitScript(value=>sessionStorage.setItem('hexu.session',JSON.stringify(value)),{token:'isolated-ui-test',account})
let failNext=false
await context.route('**/campus/**',async route=>{
  const request=route.request(),endpoint=new URL(request.url()).pathname.replace('/campus','')
  const ok=data=>route.fulfill({json:{code:1,data}})
  if(request.method()!=='GET'){
    const body=request.postDataJSON();report.writes.push({method:request.method(),endpoint,body})
    if(request.method()==='PUT'&&(endpoint==='/staff/menu'||/^\/staff\/menu\/\d+$/.test(endpoint))){
      if(failNext){failNext=false;return route.fulfill({json:{code:0,msg:'模拟更新失败，请重试'}})}
      const dish=dishes.find(item=>item.id===(body.id||Number(endpoint.split('/').at(-1))))
      if(dish){Object.assign(dish,body);return ok(dish)}
    }
    report.errors.push('Unexpected isolated write '+endpoint);return route.abort()
  }
  const data={
    '/me':account,'/public/windows':[{id:1,name:'麦香面馆',canteenName:'一食堂'}],'/public/menu':dishes,
    '/staff/orders/page':{total:0,records:[]},'/staff/menu':dishes,'/staff/menu/options':{windows:[{id:1,name:'麦香面馆',canteenName:'一食堂'}],categories:[{id:11,name:'面点小吃',status:1,sort:1,dishCount:14}]},'/staff/orders':[],'/staff/feedback':feedback,
    '/staff/dashboard':{summary:{revenue:669.8,totalOrders:118,completed:34,todayOrders:0,pending:0,preparing:0,ready:6},trend:[{day:'2026-11-07',amount:100}],sales:[],preferences:[]},
  }
  if(!(endpoint in data)){report.errors.push('Unexpected isolated read '+endpoint);return route.abort()}
  return ok(data[endpoint])
})
const page=await context.newPage()
page.on('pageerror',error=>report.pageErrors.push(error.message))
const nav=label=>page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name:label,exact:true}).click()
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
const rect=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})
async function check(name,task){await task();report.checks.push(name)}
try{
  await page.goto('http://127.0.0.1:15173/#/admin')
  await expect(page.locator('.pd-sync')).toContainText('更新于')
  await nav('菜品与库存');await page.evaluate(()=>document.fonts.ready);await settle()
  const headers=()=>page.locator('.data-table th').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,width:r.width}}))
  const beforeColumns=await headers(),beforeSwitch=await rect(page.locator('.status-toggle').first())
  await page.mouse.move(beforeSwitch.x+beforeSwitch.width/2,beforeSwitch.y+beforeSwitch.height/2)
  await page.mouse.down();await page.waitForTimeout(80)
  const pressedSwitch=await rect(page.locator('.status-toggle').first())
  await page.mouse.up()
  await expect(page.locator('.status-toggle').first()).toContainText('已下架')
  await settle()
  const afterColumns=await headers(),afterSwitch=await rect(page.locator('.status-toggle').first())
  report.movement={beforeColumns,afterColumns,beforeSwitch,pressedSwitch,afterSwitch,maxColumnDelta:Math.max(...beforeColumns.map((item,index)=>Math.abs(item.x-afterColumns[index].x))),pressedDeltaY:pressedSwitch.y-beforeSwitch.y}
  if(!baseline){
    expect(report.movement.maxColumnDelta).toBeLessThan(.5)
    expect(Math.abs(report.movement.pressedDeltaY)).toBeLessThan(.5)
    expect(Math.abs(beforeSwitch.width-afterSwitch.width)).toBeLessThan(.5)
    report.checks.push('上架状态切换不改变列宽、按钮宽度和按下位置')
    failNext=true
    await page.locator('.status-toggle').first().click()
    await expect(page.locator('.toast')).toContainText('模拟更新失败')
    await expect(page.locator('.status-toggle').first()).toContainText('已下架')
    report.checks.push('更新失败保留原状态并可重试')
  }
  await nav('预约订单')
  await page.locator('.toast').waitFor({state:'hidden'})
  const search=page.getByRole('textbox',{name:'搜索预约订单',exact:true})
  await search.click()
  // 截图等待现有150ms颜色过渡完成，避免把过渡中间帧当成最终焦点效果。
  await page.waitForTimeout(180)
  report.focus=await search.evaluate(el=>({outline:getComputedStyle(el).outlineStyle,outlineWidth:getComputedStyle(el).outlineWidth,parentBorder:getComputedStyle(el.parentElement).borderColor,parentShadow:getComputedStyle(el.parentElement).boxShadow}))
  await page.screenshot({path:path.join(out,phase+'-search.png')})
  if(!baseline){expect(report.focus.outline).toBe('none');expect(report.focus.parentShadow).not.toBe('none');report.checks.push('搜索框焦点统一显示在完整圆角容器')}
  await nav('菜品与库存')
  await page.getByRole('button',{name:'编辑',exact:true}).first().click()
  if(baseline){
    report.nativeSelects=await page.locator('.modal select').count()
    await page.screenshot({path:path.join(out,'before-modal.png')})
  }else{
    const select=page.getByRole('combobox',{name:'上架状态',exact:true})
    const modal=page.getByRole('dialog',{name:'编辑菜品',exact:true}),beforeModal=await rect(modal),beforeSelect=await rect(select)
    const writes=report.writes.length
    await select.click()
    await page.waitForTimeout(180)
    await expect(page.getByRole('listbox',{name:'上架状态',exact:true})).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(2)
    await expect(page.locator('.modal select')).toHaveCount(0)
    await page.screenshot({path:path.join(out,'after-dropdown.png')})
    await page.getByRole('option',{name:'在售',exact:true}).click()
    await expect(select).toContainText('在售')
    expect(await rect(modal)).toEqual(beforeModal)
    expect(await rect(select)).toEqual(beforeSelect)
    expect(report.writes.length).toBe(writes)
    await select.press('ArrowDown');await select.press('ArrowUp');await select.press('Enter')
    await expect(select).toContainText('已下架')
    await select.click();await select.press('Escape')
    await expect(select).toHaveAttribute('aria-expanded','false')
    await expect(modal).toBeVisible()
    await select.click();await modal.getByRole('heading',{name:'编辑菜品',exact:true}).click()
    await expect(select).toHaveAttribute('aria-expanded','false')
    await select.click();await select.press('Tab')
    await expect(select).toHaveAttribute('aria-expanded','false')
    await expect(page.getByRole('spinbutton',{name:'菜品单价',exact:true})).toBeFocused()
    await page.getByRole('button',{name:'保存修改',exact:true}).click()
    await expect(modal).toHaveCount(0)
    const save=report.writes.at(-1).body
    expect(save).toMatchObject({status:0,price:16,categoryId:11,windowId:1});expect(save).not.toHaveProperty('stock')
    report.checks.push('自定义下拉的选择、键盘、Escape、Tab、外部关闭及数值提交')
    await nav('学生反馈')
    const filter=page.getByRole('combobox',{name:'反馈状态筛选',exact:true})
    const beforeFilter=await rect(filter)
    await filter.click();await page.getByRole('option',{name:'待回复',exact:true}).click()
    await expect(page.locator('.fn-feedback-table tbody tr')).toHaveCount(1)
    expect(await rect(filter)).toEqual(beforeFilter)
    await filter.click();await page.getByRole('option',{name:'已回复',exact:true}).click()
    await expect(page.locator('.fn-feedback-table tbody')).toContainText('周同学')
    report.checks.push('反馈筛选共用下拉组件且宽度稳定')
    await nav('菜品与库存')
    await page.getByRole('button',{name:'深色外观',exact:true}).click()
    await page.getByRole('button',{name:'编辑',exact:true}).first().click()
    await page.getByRole('combobox',{name:'上架状态',exact:true}).click()
    expect(await page.getByRole('listbox',{name:'上架状态',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)')
    await page.screenshot({path:path.join(out,'after-dropdown-dark.png')})
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'关闭菜品编辑',exact:true}).click()
    await page.getByRole('button',{name:'浅色外观',exact:true}).click()
    report.checks.push('下拉弹层与深浅外观一致')
    for(const [width,height] of [[1366,768],[1024,768],[390,844]]){
      await page.setViewportSize({width,height});await page.getByRole('button',{name:'编辑',exact:true}).first().click()
      const control=page.getByRole('combobox',{name:'上架状态',exact:true});await control.click()
      const menu=await rect(page.getByRole('listbox',{name:'上架状态',exact:true}))
      expect(menu.x).toBeGreaterThanOrEqual(7);expect(menu.x+menu.width).toBeLessThanOrEqual(width-7)
      expect(menu.y).toBeGreaterThanOrEqual(7);expect(menu.y+menu.height).toBeLessThanOrEqual(height-7)
      await control.press('Escape');await page.getByRole('button',{name:'关闭菜品编辑',exact:true}).click()
    }
    report.checks.push('桌面与窄屏下拉定位在视口内')
  }
}catch(error){report.errors.push(error.stack||error.message)}
finally{await browser.close()}
report.pass=!(report.errors.length||report.pageErrors.length)
await writeFile(path.join(out,phase+'-verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
if(!report.pass)process.exitCode=1
