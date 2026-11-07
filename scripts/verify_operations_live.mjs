/* 实际服务只读核对；只向写接口发送必定在字段校验处拒绝的非法数据，不创建账号/窗口或取消真实订单。 */
import { chromium,expect } from '../web/node_modules/@playwright/test/index.mjs'
import { createHash } from 'node:crypto'
import { mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
const base='http://127.0.0.1:15173',out=path.resolve('artifacts/operations')
await mkdir(out,{recursive:true})
const report={checks:[],errors:[],pageErrors:[],counts:{}}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}})
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const nav=label=>page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name:label,exact:true}).click()
async function check(name,task){await task();report.checks.push(name);console.log('PASS',name)}
async function login(username){const response=await page.request.post(base+'/campus/auth/login',{data:{username,password:'Campus@2026'}});const payload=await response.json();expect(payload.code).toBe(1);return payload.data}
try{
  page.on('pageerror',error=>report.pageErrors.push(error.message));await page.goto(base+'/#/admin/login');await page.getByRole('button',{name:'使用管理体验账号',exact:true}).click();await expect(page.locator('.pd-sync')).toContainText('更新于')
  const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hexu.session'))),headers={Authorization:'Bearer '+session.token}
  const read=async path=>{const response=await page.request.get(base+'/campus'+path,{headers}),payload=await response.json();expect(payload.code).toBe(1);return payload.data}
  const windows=await read('/staff/settings/windows'),accounts=await read('/staff/accounts?page=1&pageSize=50'),before=digest({windows,accounts})
  report.counts.windows=windows.length;report.counts.workAccounts=Number(accounts.total)
  await check('实际工作账号分页不返回学生或密码资料',async()=>{
    expect(Number(accounts.total)).toBeGreaterThan(0);for(const account of accounts.records){expect(['ADMIN','STAFF','SCREEN']).toContain(account.role);for(const field of ['password','passwordHash','password_hash'])expect(account).not.toHaveProperty(field)}
    const result=await page.request.get(base+'/campus/staff/accounts?role=STUDENT',{headers});expect((await result.json()).code).toBe(0)
  })
  await check('实际订单全量分页覆盖最近一百笔之外的记录',async()=>{
    const recent=await read('/staff/orders'),first=await read('/staff/orders/page?state=all&page=1&pageSize=50'),total=Number(first.total),ids=[]
    for(let number=1;number<=Math.ceil(total/50);number++){const result=number===1?first:await read(`/staff/orders/page?state=all&page=${number}&pageSize=50`);ids.push(...result.records.map(order=>String(order.id)))}
    expect(ids.length).toBe(total);expect(new Set(ids).size).toBe(total);expect(total).toBeGreaterThanOrEqual(recent.length)
    if(total>100){const loaded=new Set(recent.map(order=>String(order.id)));expect(ids.some(id=>!loaded.has(id))).toBe(true)}
    report.counts.history=total;report.counts.previousRecent=recent.length
    const bad=await page.request.get(base+'/campus/staff/orders/page?state=all&fromDate=2026-11-07&toDate=2026-11-06',{headers});expect((await bad.json()).code).toBe(0)
  })
  await check('真实身份限定工作管理及窗口查询范围',async()=>{
    const staff=await login('window01'),student=await login('20260001'),staffHeaders={Authorization:'Bearer '+staff.token}
    const scoped=await page.request.get(base+'/campus/staff/settings/windows',{headers:staffHeaders});const data=(await scoped.json()).data;expect(data).toHaveLength(1);expect(String(data[0].id)).toBe(String(staff.account.windowId))
    const denied=await page.request.get(base+'/campus/staff/accounts',{headers:staffHeaders});expect((await denied.json()).code).toBe(0)
    const privateList=await page.request.get(base+'/campus/staff/accounts',{headers:{Authorization:'Bearer '+student.token}});expect(privateList.status()).toBe(403)
    const scopeOrders=await page.request.get(base+'/campus/staff/orders/page?state=all&pageSize=50',{headers:staffHeaders});for(const order of (await scopeOrders.json()).data.records)expect(String(order.windowId)).toBe(String(staff.account.windowId))
  })
  await check('非法整数字段和空取消原因在写入前返回统一错误',async()=>{
    const invalid=await page.request.put(base+`/campus/staff/settings/windows/${windows[0].id}/status`,{headers,data:{enabled:.5}});expect((await invalid.json()).code).toBe(0)
    const cancelled=await page.request.post(base+'/campus/staff/orders/0/cancel',{headers,data:{reason:' '}});const payload=await cancelled.json();expect(payload.code).toBe(0);expect(payload.msg).toContain('原因')
  })
  await check('真实运营页面、账号编辑和历史订单可打开',async()=>{
    await page.locator('.toast').waitFor({state:'hidden'});await nav('运营设置');await expect(page.locator('.ops-window-table tbody tr')).toHaveCount(windows.length);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(180);await page.screenshot({path:path.join(out,'live-windows.png')})
    await page.locator('.ops-window-table .text-button').first().click();await expect(page.getByRole('dialog',{name:'编辑食堂窗口',exact:true})).toBeVisible();await page.screenshot({path:path.join(out,'live-window-editor.png')});await page.getByRole('button',{name:'关闭窗口编辑',exact:true}).click()
    await page.getByRole('button',{name:'工作账号',exact:true}).click();await expect(page.locator('.ops-account-table tbody tr').first()).toBeVisible();await page.waitForTimeout(180);await page.screenshot({path:path.join(out,'live-accounts.png')})
    await nav('预约订单');await page.locator('.dispatch-filters').getByRole('button',{name:'全部',exact:true}).click();await expect(page.locator('.dispatch-order').first()).toBeVisible();await page.waitForTimeout(180);await page.screenshot({path:path.join(out,'live-history.png')})
  })
  expect(digest({windows:await read('/staff/settings/windows'),accounts:await read('/staff/accounts?page=1&pageSize=50')})).toBe(before);report.checks.push('现有工作账号、窗口和营业设置指纹保持不变')
}catch(error){report.errors.push(error.stack||error.message)}finally{await browser.close()}
report.pass=!(report.errors.length||report.pageErrors.length);await writeFile(path.join(out,'live-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1
