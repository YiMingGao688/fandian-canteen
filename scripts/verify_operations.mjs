/* 运营功能浏览器验收：所有业务写入由隔离上下文拦截，真实 SQL/权限/退款边界另由临时数据库测试。 */
import { chromium,expect } from '../web/node_modules/@playwright/test/index.mjs'
import { mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
import { orderPageFixture } from './lib/order-page-fixture.mjs'
const output=path.resolve('artifacts/operations');await mkdir(output,{recursive:true})
const report={checks:[],errors:[],pageErrors:[],writes:[],queries:[],viewports:[]}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const windows=[{id:101,canteenName:'一食堂',name:'烟火小炒',location:'一层东侧',description:'家常菜',capacity:12,openingHours:'07:00-09:00 / 11:00-13:20 / 17:00-19:20',enabled:1},{id:102,canteenName:'二食堂',name:'轻食计划',location:'一层西侧',description:'清爽轻食',capacity:12,openingHours:'11:00-13:00 / 17:00-19:00',enabled:1},{id:103,canteenName:'一食堂',name:'麦香面馆',location:'二层北侧',description:'手工面点',capacity:10,openingHours:'07:00-09:00 / 11:00-13:00',enabled:0}]
let accounts=[{userId:1,username:'canteen_admin',displayName:'食堂管理员',role:'ADMIN',windowId:null,enabled:1},{userId:2,username:'window01',displayName:'烟火小炒工作人员',role:'STAFF',windowId:101,enabled:1},{userId:3,username:'admin_backup',displayName:'备用管理员',role:'ADMIN',windowId:null,enabled:1},{userId:4,username:'screen01',displayName:'食堂大屏',role:'SCREEN',windowId:null,enabled:1},...Array.from({length:15},(_,i)=>({userId:i+5,username:`staff_${i+5}`,displayName:`窗口工作人员 ${i+5}`,role:'STAFF',windowId:i%2?102:101,enabled:i%3?1:0}))]
const dish={id:301,name:'香菇滑鸡饭',windowId:101,windowName:'烟火小炒',categoryId:11,categoryName:'人气主食',price:15.8,stock:30,status:1,image:'/images/rice.jpg',tags:'家常',calories:500}
const orders=Array.from({length:137},(_,i)=>({id:i+1,number:`HISTORY${String(i+1).padStart(4,'0')}`,studentName:`历史同学 ${i+1}`,studentNo:'20260001',status:5,payStatus:1,paymentChannel:'demo',amount:15.8,windowId:i%2?102:101,canteenName:i%2?'二食堂':'一食堂',windowName:i%2?'轻食计划':'烟火小炒',serviceDate:'2026-11-01',startTime:'11:00',endTime:'11:20',items:[{id:i+1,name:`历史餐品 ${i+1}`,number:1}],remark:''}))
for(const [i,status] of [2,3,4,1,6].entries())orders.push({...orders[0],id:1000+i,number:`CURRENT${i}`,studentName:['当前待接单学生','当前备餐学生','当前取餐学生','当前未支付学生','当前取消学生'][i],status,payStatus:status===1?0:status===6?2:1,paymentChannel:i===0?'alipay':'demo',windowId:101,windowName:'烟火小炒',serviceDate:'2026-11-07',cancelReason:status===6?'学生取消预约':null})
let failWindow=false,failAccount=false,failRefund=false,failQuery=false,expire=false
async function session(role='ADMIN'){
  const account=role==='ADMIN'?accounts[0]:accounts[1],context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addInitScript(value=>sessionStorage.setItem('hexu.session',JSON.stringify(value)),{token:'isolated-operations-test',account})
  await context.route('**/campus/**',async route=>{
    const request=route.request(),url=new URL(request.url()),endpoint=url.pathname.replace('/campus',''),method=request.method()
    const ok=data=>route.fulfill({json:{code:1,data}}),fail=msg=>route.fulfill({json:{code:0,msg}})
    if(method==='GET'){
      if(endpoint==='/staff/accounts'){
        if(expire){expire=false;return route.fulfill({status:401,json:{code:0,msg:'请重新登录'}})}
        const term=(url.searchParams.get('keyword')||'').toLowerCase(),roleFilter=url.searchParams.get('role'),status=url.searchParams.get('enabled')
        const rows=accounts.map(item=>({...item,windowName:windows.find(w=>w.id===item.windowId)?.name,canteenName:windows.find(w=>w.id===item.windowId)?.canteenName})).filter(item=>(!roleFilter||item.role===roleFilter)&&(status===null||String(item.enabled)===status)&&(!term||[item.username,item.displayName,item.windowName,item.canteenName].join(' ').toLowerCase().includes(term)))
        const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||6);return ok({total:rows.length,records:rows.slice((page-1)*size,page*size)})
      }
      if(endpoint==='/staff/orders/page'){
        report.queries.push(Object.fromEntries(url.searchParams));if(failQuery){failQuery=false;return fail('订单查询暂时不可用')}
        return ok(orderPageFixture(orders,request.url(),role==='STAFF'?101:null))
      }
      const data={'/me':account,'/public/windows':windows,'/public/menu':[dish],'/staff/menu':[dish],'/staff/orders':orders.slice(-100),'/staff/feedback':[],
        '/staff/settings/windows':role==='ADMIN'?windows:windows.filter(window=>window.id===101),
        '/staff/menu/options':{windows:role==='ADMIN'?windows:windows.slice(0,1),categories:[{id:11,name:'人气主食',status:1}]},
        '/staff/dashboard':{window:role==='STAFF'?windows[0]:{name:'全校食堂'},summary:{revenue:1000,totalOrders:142,pending:1,preparing:1,ready:1,completed:137},trend:[],sales:[],preferences:[]}}
      if(endpoint in data)return ok(data[endpoint]);report.errors.push('Unexpected GET '+endpoint);return route.abort()
    }
    const body=request.postDataJSON(),logged={...body};if('password'in logged)logged.password='[redacted]';report.writes.push({method,endpoint,body:logged})
    if(endpoint==='/staff/settings/windows'&&method==='POST'){
      if(failWindow){failWindow=false;return fail('营业时间不能重叠')}
      const item={id:Math.max(...windows.map(w=>w.id))+1,...body};windows.push(item);return ok(item)
    }
    const windowMatch=endpoint.match(/^\/staff\/settings\/windows\/(\d+)(\/status)?$/)
    if(windowMatch){const item=windows.find(w=>w.id===Number(windowMatch[1]));Object.assign(item,body);return ok(item)}
    if(endpoint==='/staff/accounts'&&method==='POST'){
      if(failAccount){failAccount=false;return fail('这个登录账号已被使用')}
      const {password,...fields}=body,item={userId:Math.max(...accounts.map(a=>a.userId))+1,...fields};accounts.push(item);return ok(item)
    }
    const accountMatch=endpoint.match(/^\/staff\/accounts\/(\d+)(\/status|\/password)?$/)
    if(accountMatch){const item=accounts.find(a=>a.userId===Number(accountMatch[1]));if(accountMatch[2]==='/password')return ok(null);Object.assign(item,body);return ok(item)}
    const operation=endpoint.match(/^\/staff\/orders\/(\d+)\/(reject|cancel)$/)
    if(operation){
      if(failRefund){failRefund=false;return fail('支付宝沙箱退款未成功，请稍后重试')}
      await new Promise(resolve=>setTimeout(resolve,120));const order=orders.find(row=>row.id===Number(operation[1]));order.status=6;order.payStatus=order.payStatus===1?2:0;order.cancelReason=(operation[2]==='reject'?'窗口拒单：':'管理取消：')+body.reason;return ok(order)
    }
    report.errors.push('Unexpected write '+endpoint);return route.abort()
  })
  const page=await context.newPage();page.on('pageerror',cause=>report.pageErrors.push(cause.message));await page.goto('http://127.0.0.1:15173/#/admin');await expect(page.locator('.pd-sync')).toContainText('更新于')
  return{page,context}
}
async function check(name,task){await task();report.checks.push(name);console.log('PASS',name)}
const nav=(page,name)=>page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name,exact:true}).click()
const select=async(page,label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click()}
const columns=page=>page.locator('.ops-panel th').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,width:r.width}}))
try{
  const {page,context}=await session()
  await check('窗口开关只写状态，列宽和开关占位稳定',async()=>{
    await nav(page,'运营设置');await expect(page.locator('.ops-window-table tbody tr')).toHaveCount(3)
    const before=await columns(page);await page.getByRole('button',{name:'暂停烟火小炒预约',exact:true}).click();await expect(page.getByRole('button',{name:'恢复烟火小炒预约',exact:true})).toBeVisible()
    const after=await columns(page);expect(Math.max(...before.map((col,i)=>Math.abs(col.x-after[i].x)))).toBeLessThan(.5);expect(report.writes.at(-1)).toMatchObject({endpoint:'/staff/settings/windows/101/status',body:{enabled:0}})
    expect(Object.keys(report.writes.at(-1).body)).toEqual(['enabled']);await page.getByRole('button',{name:'恢复烟火小炒预约',exact:true}).click()
  })
  await check('新增窗口保存真实字段，失败保留表单和默认暂停状态',async()=>{
    await page.getByRole('button',{name:'新增窗口',exact:true}).click();await page.getByRole('textbox',{name:'所属食堂',exact:true}).fill('三食堂');await page.getByRole('textbox',{name:'窗口名称',exact:true}).fill('家常饭菜');await page.getByRole('textbox',{name:'取餐位置',exact:true}).fill('二层 5 号窗');await page.getByRole('textbox',{name:'营业时间',exact:true}).fill('11:00-13:00 / 17:00-19:00')
    failWindow=true;await page.getByRole('button',{name:'创建窗口',exact:true}).click();await expect(page.getByRole('alert')).toContainText('营业时间不能重叠');await expect(page.getByRole('textbox',{name:'窗口名称',exact:true})).toHaveValue('家常饭菜')
    await page.getByRole('button',{name:'创建窗口',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.ops-window-table')).toContainText('家常饭菜');expect(windows.at(-1).enabled).toBe(0)
  })
  await check('工作账号服务端分页、关键词、身份和状态筛选',async()=>{
    await page.getByRole('button',{name:'工作账号',exact:true}).click();await expect(page.locator('.ops-account-table tbody tr').first()).toContainText('食堂管理员')
    const pager=page.getByRole('navigation',{name:'工作账号分页',exact:true});await pager.getByRole('button',{name:'下一页',exact:true}).click();await expect(pager.getByRole('button',{name:'第2页',exact:true})).toHaveAttribute('aria-current','page')
    await select(page,'工作身份筛选','只读大屏账号');await expect(page.locator('.ops-account-table tbody tr')).toHaveCount(1);await expect(page.locator('.ops-account-table tbody')).toContainText('screen01')
    await select(page,'工作身份筛选','全部身份');await select(page,'账号启用状态筛选','停用');await expect(page.locator('.ops-account-table tbody')).not.toContainText('食堂管理员');await select(page,'账号启用状态筛选','全部状态')
  })
  await check('新增账号校验确认密码、重名重试和窗口绑定，保存后定位记录',async()=>{
    await page.getByRole('button',{name:'新增工作账号',exact:true}).click();await page.getByRole('textbox',{name:'登录账号',exact:true}).fill('window_new');await page.getByRole('textbox',{name:'人员显示名称',exact:true}).fill('新窗口工作人员');await select(page,'授权窗口','一食堂 · 烟火小炒')
    await page.getByRole('textbox',{name:'设置密码',exact:true}).fill('TestPwd@2026');await page.getByRole('textbox',{name:'确认密码',exact:true}).fill('WrongPwd@2026');await page.getByRole('button',{name:'创建账号',exact:true}).click();await expect(page.getByRole('alert')).toContainText('密码不一致')
    await page.getByRole('textbox',{name:'确认密码',exact:true}).fill('TestPwd@2026');failAccount=true;await page.getByRole('button',{name:'创建账号',exact:true}).click();await expect(page.getByRole('alert')).toContainText('已被使用');await expect(page.getByRole('textbox',{name:'登录账号',exact:true})).toHaveValue('window_new')
    await page.screenshot({path:path.join(output,'account-editor.png')});await page.getByRole('button',{name:'创建账号',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.ops-account-table tbody tr')).toHaveCount(1);await expect(page.locator('.ops-account-table tbody')).toContainText('window_new')
  })
  await check('编辑绑定窗口、启停只写状态、密码重置走独立接口',async()=>{
    await page.getByRole('button',{name:'编辑账号window_new',exact:true}).click();await expect(page.getByRole('textbox',{name:'登录账号',exact:true})).toBeDisabled();await select(page,'授权窗口','二食堂 · 轻食计划');await page.getByRole('button',{name:'保存账号',exact:true}).click();await expect(page.locator('.ops-account-table tbody')).toContainText('轻食计划')
    await page.getByRole('button',{name:'停用window_new',exact:true}).click();await expect(page.getByRole('button',{name:'启用window_new',exact:true})).toBeVisible();expect(Object.keys(report.writes.at(-1).body)).toEqual(['enabled'])
    await page.getByRole('button',{name:'重置密码window_new',exact:true}).click();await page.getByRole('textbox',{name:'设置密码',exact:true}).fill('Changed@2026');await page.getByRole('textbox',{name:'确认密码',exact:true}).fill('Changed@2026');await page.getByRole('button',{name:'确认重置',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(report.writes.at(-1).endpoint).toMatch(/\/password$/)
  })
  await check('当前管理员的状态与角色受保护，编辑弹层有键盘焦点',async()=>{
    await page.getByRole('textbox',{name:'搜索工作账号',exact:true}).fill('canteen_admin');await expect(page.locator('.ops-account-table tbody tr')).toHaveCount(1);await expect(page.getByRole('button',{name:'停用canteen_admin',exact:true})).toBeDisabled()
    await page.getByRole('button',{name:'编辑账号canteen_admin',exact:true}).click();await expect(page.getByRole('combobox',{name:'工作身份',exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'账号状态',exact:true})).toBeDisabled();expect(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]'))).toBe(true);await page.getByRole('button',{name:'关闭账号编辑',exact:true}).click()
  })
  await check('能搜索最近一百笔以外的历史，并向服务端发送日期和窗口条件',async()=>{
    await nav(page,'预约订单');await page.locator('.dispatch-filters').getByRole('button',{name:'全部',exact:true}).click();await page.getByRole('textbox',{name:'搜索预约订单',exact:true}).fill('HISTORY0001');await expect(page.locator('.dispatch-order')).toHaveCount(1);await expect(page.locator('.dispatch-order')).toContainText('历史同学 1')
    expect(report.queries.at(-1).keyword).toBe('HISTORY0001');expect(orders.slice(-100).some(order=>order.number==='HISTORY0001')).toBe(false)
    await page.getByRole('textbox',{name:'搜索预约订单',exact:true}).fill('');await page.getByRole('textbox',{name:'取餐开始日期',exact:true}).fill('2026-11-01');await page.getByRole('textbox',{name:'取餐结束日期',exact:true}).fill('2026-11-01');await select(page,'订单窗口筛选','二食堂 · 轻食计划');await expect.poll(()=>report.queries.at(-1)?.windowId).toBe('102');expect(report.queries.at(-1)).toMatchObject({fromDate:'2026-11-01',toDate:'2026-11-01'})
    await page.screenshot({path:path.join(output,'history-query.png')})
    await page.getByRole('textbox',{name:'取餐开始日期',exact:true}).fill('');await page.getByRole('textbox',{name:'取餐结束日期',exact:true}).fill('');await select(page,'订单窗口筛选','全部窗口')
  })
  await check('拒单失败保留原因和原状态，重试防重复提交',async()=>{
    await page.locator('.dispatch-filters').getByRole('button',{name:'待接单',exact:true}).click();await page.getByRole('button',{name:'展开当前待接单学生的订单明细',exact:true}).click();await page.getByRole('button',{name:'拒绝接单',exact:true}).click();await page.getByRole('textbox',{name:'订单处理原因',exact:true}).fill('食材售罄，无法继续备餐')
    failRefund=true;await page.getByRole('button',{name:'确认拒单',exact:true}).click();await expect(page.getByRole('alert')).toContainText('退款未成功');await expect(page.getByRole('textbox',{name:'订单处理原因',exact:true})).toHaveValue('食材售罄，无法继续备餐');expect(orders.find(order=>order.id===1000).status).toBe(2)
    const before=report.writes.length;await page.getByRole('button',{name:'确认拒单',exact:true}).evaluate(button=>{button.click();button.click()});await expect(page.getByRole('dialog')).toHaveCount(0);expect(report.writes.length-before).toBe(1);expect(orders.find(order=>order.id===1000).status).toBe(6)
  })
  await check('备餐中可管理取消，已完成订单不提供取消入口',async()=>{
    await page.locator('.dispatch-filters').getByRole('button',{name:'备餐中',exact:true}).click();await page.getByRole('button',{name:'展开当前备餐学生的订单明细',exact:true}).click();await page.getByRole('button',{name:'取消预约',exact:true}).click();await page.getByRole('textbox',{name:'订单处理原因',exact:true}).fill('窗口设备维护');await page.getByRole('button',{name:'确认取消',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.locator('.dispatch-filters').getByRole('button',{name:'已完成',exact:true}).click();await page.getByRole('textbox',{name:'搜索预约订单',exact:true}).fill('HISTORY0001');await expect(page.locator('.dispatch-order')).toHaveCount(1);await page.locator('.dispatch-expand').click();await expect(page.getByRole('button',{name:'取消预约',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await page.getByRole('textbox',{name:'搜索预约订单',exact:true}).fill('')
  })
  await check('订单查询失败展示重试，不回退成最近一百笔',async()=>{
    failQuery=true;await page.locator('.dispatch-filters').getByRole('button',{name:'全部',exact:true}).click();await expect(page.getByRole('alert')).toContainText('订单查询暂时不可用');await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0)
  })
  await check('六种桌面尺寸下设置、账号与订单无整页溢出和分页裁切',async()=>{
    for(const [width,height] of [[1440,900],[1366,768],[1440,720],[1920,1080],[1188,800],[1024,768]]){
      await page.setViewportSize({width,height})
      for(const module of ['窗口','账号','订单']){
        if(module==='订单')await nav(page,'预约订单');else{await nav(page,'运营设置');if(module==='账号')await page.getByRole('button',{name:'工作账号',exact:true}).click()}
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        const sizes=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,panels:[...document.querySelectorAll('.fn-list-viewport,.dispatch-list-viewport')].map(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight})),pagers:[...document.querySelectorAll('.admin-pagination')].map(el=>el.getBoundingClientRect().bottom)}))
        expect(sizes.width).toBeLessThanOrEqual(width+1);expect(sizes.height).toBeLessThanOrEqual(height+1);for(const panel of sizes.panels)expect(panel.scrollHeight-panel.height).toBeLessThanOrEqual(3);for(const bottom of sizes.pagers)expect(bottom).toBeLessThanOrEqual(height-4)
        report.viewports.push({width,height,module,...sizes});if(width===1440&&height===900||width===1366&&module==='订单')await page.screenshot({path:path.join(output,`${module}-${width}x${height}.png`)})
      }
    }
  })
  await check('窄屏下窗口、账号表单和下拉仍在视口内',async()=>{
    await page.setViewportSize({width:390,height:844});await nav(page,'运营设置');await page.getByRole('button',{name:'新增窗口',exact:true}).click()
    for(const target of ['.ops-dialog','.ops-dialog .am-dialog-footer']){const bounds=await page.locator(target).boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);expect(bounds.y+bounds.height).toBeLessThanOrEqual(845)}
    await page.getByRole('combobox',{name:'营业状态',exact:true}).click();const popup=await page.getByRole('listbox',{name:'营业状态',exact:true}).boundingBox();expect(popup.y+popup.height).toBeLessThanOrEqual(837);await page.keyboard.press('Escape');await page.getByRole('button',{name:'关闭窗口编辑',exact:true}).click()
    await page.getByRole('button',{name:'工作账号',exact:true}).click();await page.getByRole('button',{name:'新增工作账号',exact:true}).click();const account=await page.locator('.ops-dialog').boundingBox();expect(account.y+account.height).toBeLessThanOrEqual(845);await page.screenshot({path:path.join(output,'account-mobile.png')});await page.getByRole('button',{name:'关闭账号编辑',exact:true}).click()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);await page.setViewportSize({width:1440,height:900})
  })
  await check('会话失效回管理登录页',async()=>{
    await nav(page,'运营设置');await page.getByRole('button',{name:'工作账号',exact:true}).click();await expect(page.locator('.ops-account-table tbody tr').first()).toBeVisible();expire=true;await page.getByTitle('刷新运营设置',{exact:true}).click();await expect(page).toHaveURL(/admin\/login$/);await expect(page.getByRole('button',{name:'使用管理体验账号',exact:true})).toBeVisible()
  })
  await context.close()
  await check('窗口账号仅见本窗口，无账号和新增窗口入口',async()=>{
    const {page:staff,context:staffContext}=await session('STAFF');await nav(staff,'运营设置');await expect(staff.locator('.ops-window-table tbody tr')).toHaveCount(1);await expect(staff.getByRole('button',{name:'工作账号',exact:true})).toHaveCount(0);await expect(staff.getByRole('button',{name:'新增窗口',exact:true})).toHaveCount(0)
    await staff.getByRole('button',{name:'编辑窗口烟火小炒',exact:true}).click();await expect(staff.getByRole('textbox',{name:'所属食堂',exact:true})).toBeDisabled();await staff.getByRole('button',{name:'关闭窗口编辑',exact:true}).click();await nav(staff,'预约订单');await expect(staff.getByRole('combobox',{name:'订单窗口筛选',exact:true})).toHaveCount(0);await staffContext.close()
  })
}catch(cause){report.errors.push(cause.stack||cause.message)}finally{await browser.close()}
report.pass=!(report.errors.length||report.pageErrors.length);await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,checks:report.checks,errors:report.errors,pageErrors:report.pageErrors,viewports:report.viewports.length}))
if(!report.pass)process.exitCode=1
