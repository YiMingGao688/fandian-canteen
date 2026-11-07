/* 菜品维护浏览器验收：所有 API 写操作只进入本脚本的隔离路由，真实数据库由独立后端测试验证。 */
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output=path.resolve('artifacts/menu-management');await mkdir(output,{recursive:true})
const report={checks:[],errors:[],pageErrors:[],writes:[]}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const windows=[{id:101,name:'烟火小炒',canteenName:'一食堂'},{id:102,name:'轻食计划',canteenName:'二食堂'}]
let categories=[{id:11,name:'家常小炒',sort:1,status:1,dishCount:14},{id:12,name:'清爽轻食',sort:2,status:1,dishCount:0}]
let dishes=Array.from({length:14},(_,i)=>({id:i+1,name:'现有菜品 '+(i+1),windowId:101,windowName:'烟火小炒',canteenName:'一食堂',categoryId:11,categoryName:'家常小炒',price:16,stock:32,status:1,image:'/images/rice.jpg',description:'每日现做',calories:580,tags:'清淡'}))
let failUpload=false,failCreate=false
async function session(role='ADMIN'){
  const account={userId:9001,username:'isolated_test',displayName:'测试管理员',role,windowId:role==='STAFF'?101:null}
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addInitScript(value=>sessionStorage.setItem('hexu.session',JSON.stringify(value)),{token:'isolated-test',account})
  await context.route('**/campus/**',async route=>{
    const req=route.request(), endpoint=new URL(req.url()).pathname.replace('/campus',''), method=req.method()
    const ok=data=>route.fulfill({json:{code:1,data}}), fail=msg=>route.fulfill({json:{code:0,msg}})
    if(method==='GET'){
      const data={
        '/me':account,'/public/windows':windows,'/public/menu':dishes,
        '/staff/orders/page':{total:0,records:[]},'/staff/menu':role==='ADMIN'?dishes:dishes.filter(d=>d.windowId===101),'/staff/orders':[],'/staff/feedback':[],
        '/staff/menu/options':{windows:role==='ADMIN'?windows:windows.slice(0,1),categories:role==='ADMIN'?categories:categories.filter(c=>c.status===1)},
        '/staff/dashboard':{summary:{revenue:0,totalOrders:0,pending:0,preparing:0,ready:0,completed:0},trend:[],sales:[],preferences:[],window:windows[0]},
      }
      if(endpoint in data)return ok(data[endpoint]);report.errors.push('Unexpected GET '+endpoint);return route.abort()
    }
    if(endpoint==='/staff/menu/image'){
      report.writes.push({method,endpoint,multipart:req.headers()['content-type']?.startsWith('multipart/form-data; boundary=')})
      if(failUpload){failUpload=false;return fail('图片上传失败，请重试')}
      return ok({url:'/images/chicken.jpg'})
    }
    const body=req.postDataJSON();report.writes.push({method,endpoint,body})
    if(method==='POST'&&endpoint==='/staff/menu'){
      if(failCreate){failCreate=false;return fail('这个菜品名称已存在，请换一个名称')}
      await new Promise(resolve=>setTimeout(resolve,150))
      const category=categories.find(c=>c.id===body.categoryId),window=windows.find(w=>w.id===body.windowId)
      const created={id:Math.max(...dishes.map(d=>d.id))+1,...body,categoryName:category.name,windowName:window.name,canteenName:window.canteenName}
      dishes.push(created);return ok(created)
    }
    const dishMatch=endpoint.match(/^\/staff\/menu\/(\d+)$/)
    if(dishMatch){
      const dish=dishes.find(d=>d.id===Number(dishMatch[1]))
      if(method==='PUT'){Object.assign(dish,body);return ok(dish)}
      if(method==='DELETE'){
        if(dish.id<15)return fail('菜品已有订单或套餐引用，请保留下架记录')
        dishes=dishes.filter(d=>d.id!==dish.id);return ok(null)
      }
    }
    const categoryMatch=endpoint.match(/^\/staff\/menu\/categories(?:\/(\d+))?$/)
    if(categoryMatch){
      if(role!=='ADMIN')return fail('只有全校管理员可以维护菜品分类')
      const id=categoryMatch[1]?Number(categoryMatch[1]):null
      if(method==='DELETE'){
        if(id===11)return fail('分类下还有菜品或套餐，请先调整分类')
        categories=categories.filter(c=>c.id!==id);return ok(null)
      }
      if(categories.some(c=>c.name===body.name&&c.id!==id))return fail('这个分类名称已存在')
      if(id){const item=categories.find(c=>c.id===id);Object.assign(item,body);return ok(item)}
      const item={id:Math.max(...categories.map(c=>c.id))+1,dishCount:0,...body};categories.push(item);return ok(item)
    }
    report.errors.push('Unexpected write '+endpoint);return route.abort()
  })
  const page=await context.newPage();page.on('pageerror',cause=>report.pageErrors.push(cause.message))
  await page.goto('http://127.0.0.1:15173/#/admin');await expect(page.locator('.pd-sync')).toContainText('更新于')
  await page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name:'菜品与库存',exact:true}).click()
  return {context,page}
}
async function check(name,task){await task();report.checks.push(name);console.log('PASS',name)}
const combo=async(page,label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click()}
try{
  const {page,context}=await session()
  await check('新增入口与真实窗口分类选项；默认下架',async()=>{
    await page.getByRole('button',{name:'新增菜品',exact:true}).click()
    await expect(page.getByRole('dialog',{name:'新增菜品',exact:true})).toBeVisible()
    await expect(page.getByRole('combobox',{name:'上架状态',exact:true})).toContainText('已下架')
    await expect(page.getByRole('combobox',{name:'菜品分类',exact:true})).toContainText('家常小炒')
    await combo(page,'所属窗口','二食堂 · 轻食计划')
    await page.getByRole('textbox',{name:'菜品名称',exact:true}).fill('香煎鸡胸配时蔬')
    await page.getByRole('spinbutton',{name:'菜品单价',exact:true}).fill('18.80')
    await page.getByRole('spinbutton',{name:'可售库存',exact:true}).fill('40')
    await page.getByRole('button',{name:'创建菜品',exact:true}).click();await expect(page.getByRole('alert')).toContainText('上传菜品图片')
  })
  await check('图片失败可重试，照片自动压缩并使用 multipart',async()=>{
    failUpload=true
    await page.getByLabel('上传菜品图片',{exact:true}).setInputFiles(path.resolve('web/public/images/chicken.jpg'))
    await expect(page.getByRole('alert')).toContainText('图片上传失败')
    await expect(page.getByRole('textbox',{name:'菜品名称',exact:true})).toHaveValue('香煎鸡胸配时蔬')
    await page.getByLabel('上传菜品图片',{exact:true}).setInputFiles(path.resolve('web/public/images/chicken.jpg'))
    await expect(page.getByAltText('菜品图片预览')).toBeVisible()
    expect(report.writes.filter(w=>w.endpoint.endsWith('/image')).every(w=>w.multipart)).toBe(true)
  })
  await check('重复名称错误保留表单；保存期间防止重复提交并定位新记录',async()=>{
    failCreate=true;await page.getByRole('button',{name:'创建菜品',exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('已存在')
    await expect(page.getByRole('textbox',{name:'菜品名称',exact:true})).toHaveValue('香煎鸡胸配时蔬')
    await page.screenshot({path:path.join(output,'create-form.png')})
    const before=report.writes.filter(w=>w.endpoint==='/staff/menu').length
    await page.getByRole('button',{name:'创建菜品',exact:true}).evaluate(button=>{button.click();button.click()})
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(report.writes.filter(w=>w.endpoint==='/staff/menu').length-before).toBe(1)
    await expect(page.locator('.am-just-saved')).toContainText('香煎鸡胸配时蔬')
    const record=report.writes.filter(w=>w.endpoint==='/staff/menu').at(-1).body
    expect(record).toMatchObject({windowId:102,categoryId:11,status:0,price:18.8,stock:40})
    await page.screenshot({path:path.join(output,'created-in-list.png')})
  })
  await check('完整编辑保留并发扣减库存，失败删除保留原记录',async()=>{
    await page.getByRole('textbox',{name:'搜索菜品',exact:true}).fill('现有菜品 1')
    await page.getByRole('button',{name:'编辑',exact:true}).first().click()
    const original=dishes[0];original.stock=27
    await page.getByRole('textbox',{name:'菜品名称',exact:true}).fill('更新后的招牌菜')
    await page.getByRole('button',{name:'保存修改',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(report.writes.at(-1).body).not.toHaveProperty('stock');expect(original.stock).toBe(27)
    await page.getByRole('textbox',{name:'搜索菜品',exact:true}).fill('更新后的招牌菜')
    await page.getByRole('button',{name:'编辑',exact:true}).click()
    await page.getByRole('button',{name:'删除菜品',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('已有订单');await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button',{name:'关闭菜品编辑',exact:true}).click()
  })
  await check('新增、编辑、停用分类及引用删除保护',async()=>{
    await page.getByRole('button',{name:'分类管理',exact:true}).click()
    await page.getByRole('textbox',{name:'分类名称',exact:true}).fill('暖心汤饮')
    await page.getByRole('button',{name:'创建分类',exact:true}).click()
    await expect(page.locator('.am-category-item.is-current')).toContainText('暖心汤饮')
    await combo(page,'分类状态','停用');await page.getByRole('button',{name:'保存分类',exact:true}).click()
    await expect(page.locator('.am-category-item.is-current')).toContainText('停用')
    await page.locator('.am-category-item').filter({hasText:'家常小炒'}).click()
    await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('分类下还有菜品')
    await page.screenshot({path:path.join(output,'category-manager.png')})
    await page.getByRole('button',{name:'关闭分类管理',exact:true}).click()
  })
  await check('桌面表单不撑出视口，窄屏按钮可见，深色外观一致',async()=>{
    await page.getByRole('textbox',{name:'搜索菜品',exact:true}).fill('')
    for(const [width,height] of [[1440,900],[1366,768],[1024,768],[390,844]]){
      await page.setViewportSize({width,height});await page.getByRole('button',{name:'新增菜品',exact:true}).click()
      await expect(page.getByRole('combobox',{name:'菜品分类',exact:true})).toContainText('家常小炒')
      const bounds=await page.locator('.am-editor').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(height)
      const footer=await page.getByRole('button',{name:'创建菜品',exact:true}).boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(height)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if(width>=900)expect(await page.locator('.am-editor-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2)
      await page.screenshot({path:path.join(output,`editor-${width}.png`)})
      await page.getByRole('button',{name:'关闭新增菜品',exact:true}).click()
    }
    await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'深色外观',exact:true}).click();await page.getByRole('button',{name:'新增菜品',exact:true}).click()
    expect(await page.locator('.am-editor').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)')
    await page.screenshot({path:path.join(output,'editor-dark.png')});await page.getByRole('button',{name:'关闭新增菜品',exact:true}).click()
  })
  await context.close()
  await check('窗口账号自动绑定本窗口且不展示共享分类管理',async()=>{
    const {page:staff,context:staffContext}=await session('STAFF')
    await expect(staff.getByRole('button',{name:'分类管理',exact:true})).toHaveCount(0)
    await staff.getByRole('button',{name:'新增菜品',exact:true}).click()
    await expect(staff.getByRole('combobox',{name:'所属窗口',exact:true})).toBeDisabled()
    await expect(staff.getByRole('combobox',{name:'所属窗口',exact:true})).toContainText('烟火小炒')
    await staffContext.close()
  })
}catch(cause){report.errors.push(cause.stack||cause.message)}finally{await browser.close()}
report.pass=!(report.errors.length||report.pageErrors.length)
await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
if(!report.pass)process.exitCode=1
