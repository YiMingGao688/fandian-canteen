/* 运行中的完整服务核对：业务表只读；格式错误、越权请求由服务端拒绝，上传验证文件随后定点清理。 */
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd(),out=path.join(root,'artifacts/menu-management')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const base='http://127.0.0.1:15173',report={checks:[],errors:[],pageErrors:[],uploadedFileCleaned:false}
let uploadedUrl=''
const digest=menu=>createHash('sha256').update(JSON.stringify(menu.map(({id,name,categoryId,price,image,status,windowId,stock})=>({id,name,categoryId,price,image,status,windowId,stock})))).digest('hex')
async function check(name,task){await task();report.checks.push(name);console.log('PASS',name)}
async function login(username){const response=await page.request.post(base+'/campus/auth/login',{data:{username,password:'Campus@2026'}});const result=await response.json();expect(result.code).toBe(1);return result.data}
try{
  page.on('pageerror',cause=>report.pageErrors.push(cause.message))
  await page.goto(base+'/#/admin/login');await page.getByRole('button',{name:'使用管理体验账号',exact:true}).click()
  await expect(page.locator('.pd-sync')).toContainText('更新于')
  const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hexu.session'))),headers={Authorization:`Bearer ${session.token}`}
  const menuResponse=await page.request.get(base+'/campus/staff/menu',{headers}),before=(await menuResponse.json()).data
  const metadataResponse=await page.request.get(base+'/campus/staff/menu/options',{headers}),metadata=(await metadataResponse.json()).data
  report.menuCount=before.length;report.windowCount=metadata.windows.length;report.categoryCount=metadata.categories.length
  await check('新版真实菜单接口返回授权窗口、分类和现有菜品',async()=>{expect(before.length).toBeGreaterThan(0);expect(metadata.windows.length).toBeGreaterThan(0);expect(metadata.categories.length).toBeGreaterThan(0)})
  await check('真实 HTTP 链路拒绝小数库存和非法价格，业务菜单不落测试记录',async()=>{
    const active=metadata.categories.find(c=>c.status===1),input={name:'接口验证不应写入',categoryId:active.id,windowId:metadata.windows[0].id,price:15.8,stock:1.5,status:0,image:before[0].image}
    const fractional=await page.request.post(base+'/campus/staff/menu',{headers,data:input});expect((await fractional.json()).code).toBe(0)
    const invalid=await page.request.post(base+'/campus/staff/menu',{headers,data:{...input,stock:1,price:0}});const result=await invalid.json();expect(result.code).toBe(0);expect(result.msg).toContain('价格')
  })
  await check('真实身份拦截拒绝匿名、学生和窗口越权',async()=>{
    expect((await page.request.get(base+'/campus/staff/menu/options')).status()).toBe(401)
    const student=await login('20260001'),staff=await login('window01')
    expect((await page.request.post(base+'/campus/staff/menu',{headers:{Authorization:`Bearer ${student.token}`},data:{}})).status()).toBe(403)
    const denied=await page.request.post(base+'/campus/staff/menu/categories',{headers:{Authorization:`Bearer ${staff.token}`},data:{name:'越权请求不可写入',sort:0,status:1}})
    const result=await denied.json();expect(result.code).toBe(0);expect(result.msg).toContain('管理员')
    const scope=await page.request.get(base+'/campus/staff/menu/options',{headers:{Authorization:`Bearer ${staff.token}`}});const staffOptions=(await scope.json()).data
    expect(staffOptions.windows).toHaveLength(1);expect(staffOptions.windows[0].id).toBe(staff.account.windowId)
  })
  await check('超限图片与伪造图片返回可读错误，不生成文件',async()=>{
    const oversized=await page.request.post(base+'/campus/staff/menu/image',{headers,multipart:{file:{name:'oversized.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(1200*1024)}}})
    expect(oversized.status()).toBe(413);const rejected=await oversized.json();expect(rejected.code).toBe(0);expect(rejected.msg).toContain('图片过大')
    const disguised=await page.request.post(base+'/campus/staff/menu/image',{headers,multipart:{file:{name:'fake.jpg',mimeType:'image/jpeg',buffer:Buffer.from('<html>not an image</html>')}}})
    const invalid=await disguised.json();expect(invalid.code).toBe(0);expect(invalid.msg).toContain('图片')
  })
  await page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name:'菜品与库存',exact:true}).click()
  await page.getByRole('button',{name:'分类管理',exact:true}).click();await expect(page.locator('.am-category-item').first()).toBeVisible()
  await page.screenshot({path:path.join(out,'live-category-manager.png')});await page.getByRole('button',{name:'关闭分类管理',exact:true}).click()
  await check('实际页面通过真实后端上传并读取图片，未提交新增菜品',async()=>{
    await page.getByRole('button',{name:'新增菜品',exact:true}).click();await expect(page.getByRole('combobox',{name:'菜品分类',exact:true})).not.toContainText('请选择')
    const response=page.waitForResponse(value=>value.url().endsWith('/campus/staff/menu/image')&&value.request().method()==='POST')
    await page.getByLabel('上传菜品图片',{exact:true}).setInputFiles(path.join(root,'web/public/images/chicken.jpg'))
    const result=await (await response).json();expect(result.code).toBe(1);uploadedUrl=result.data.url
    expect(uploadedUrl).toMatch(/^\/campus\/public\/dish-images\/[a-f0-9]{32}\.jpg$/)
    await expect(page.getByAltText('菜品图片预览')).toBeVisible()
    const image=await page.request.get(base+uploadedUrl);expect(image.status()).toBe(200);expect(image.headers()['content-type']).toContain('image/jpeg')
    await page.getByRole('textbox',{name:'菜品名称',exact:true}).fill('香煎鸡胸配时蔬')
    await page.getByRole('spinbutton',{name:'菜品单价',exact:true}).fill('18.80')
    await page.getByRole('spinbutton',{name:'可售库存',exact:true}).fill('40')
    await page.screenshot({path:path.join(out,'live-new-dish-editor.png')})
    await page.getByRole('button',{name:'关闭新增菜品',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
  const afterResponse=await page.request.get(base+'/campus/staff/menu',{headers}),after=(await afterResponse.json()).data
  report.beforeDigest=digest(before);report.afterDigest=digest(after);expect(report.afterDigest).toBe(report.beforeDigest)
  report.checks.push('真实菜单记录及库存前后指纹一致')
}catch(cause){report.errors.push(cause.stack||cause.message)}finally{
  await browser.close()
  if(/^\/campus\/public\/dish-images\/[a-f0-9]{32}\.jpg$/.test(uploadedUrl)){
    const directory=path.resolve(root,'.local/uploads/dishes'),file=path.resolve(directory,path.basename(uploadedUrl))
    if(path.dirname(file)===directory){await unlink(file);report.uploadedFileCleaned=true}
  }
}
report.pass=!(report.errors.length||report.pageErrors.length)
await writeFile(path.join(out,'live-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
if(!report.pass)process.exitCode=1
