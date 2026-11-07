// 模拟微信平台验证页面调用与错误恢复；不向数据库写入测试订单。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../miniprogram'), storage = new Map(), calls = []
let failSubmit = true
let failPay = true
let hideTodaySlots = false, failSlots = false
let holdOrdersRead = false, finishOrdersRead
const records = [], cart = [{ id: 1, dishId: 1, name: '测试菜品', amount: 10, number: 1 }]
const windows = [{ id: 1, name: '测试窗口' }]
const menu = [{ id: 1, windowId: 1, categoryId: 1, categoryName: '主食', name: '测试菜品', status: 1, price: 10, image: '/images/rice.jpg' }]
const slots = [{ id: 1, reserved: 0, capacity: 10, startTime: '11:00', endTime: '11:20' }]
global.wx = {
  getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
  showToast() {}, stopPullDownRefresh() {}, navigateBack() {}, switchTab() {}, navigateTo() {}, showModal(o) { o.success({ confirm: true }) },
  request(o) {
    const { pathname, searchParams } = new URL(o.url)
    const route = pathname.replace('/campus', ''); calls.push({ route, data: o.data, method: o.method })
    let data
    if (route === '/auth/login') data = { token: 'fixture', account: { userId: 1, role: 'STUDENT' } }
    else if (route === '/public/windows') data = windows
    else if (route === '/public/menu') data = menu
    else if (route === '/public/slots') {
      if (failSlots) { failSlots = false; o.fail(); return }
      data = hideTodaySlots && searchParams.get('date') === u.date() ? [] : slots
    }
    else if (route === '/student/cart') { if (o.method === 'POST') cart[0].number += o.data.delta; data = cart }
    else if (route === '/student/favorites') data = [1]
    else if (route === '/student/orders') {
      if (o.method === 'POST') {
        if (failSubmit) { failSubmit = false; o.fail(); return }
        records.push({ id: 1, status: '1', amount: 20, windowId: 1, slotId: 1, serviceDate: '2099-01-01', items: [] }); data = records[0]
      } else data = records
    } else if (route === '/student/orders/1/pay') {
      if (failPay) { failPay = false; o.fail(); return }
      records[0].status = 2
      records[0].pickupCode = 'ABCD2345'
      data = records[0]
    }
    else if (route === '/student/orders/1/reschedule') data = records[0]
    else if (route === '/student/reviews') { records[0].reviewed = true; data = null }
    else if (route === '/me') { o.success({ statusCode: 401, data: {} }); return }
    else throw new Error('Unexpected route ' + route)
    const response = { statusCode: 200, data: { code: 1, data: JSON.parse(JSON.stringify(data)) } }
    if (route === '/student/orders' && o.method === 'GET' && holdOrdersRead) {
      holdOrdersRead = false
      finishOrdersRead = () => o.success(response)
      return
    }
    o.success(response)
  }
}
const u = require(path.join(root, 'utils/api'))
function page(name) {
  let definition
  const file = path.join(root, 'pages', name, 'index.js')
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), Page: d => { definition = d }, wx, setInterval, clearInterval })
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(values) { Object.assign(this.data, values) } }
}
async function main() {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json')))
  for (const entry of app.pages) for (const ext of ['js', 'json', 'wxml']) assert.ok(fs.existsSync(path.join(root, `${entry}.${ext}`)))
  // 两个页面都需要引用完整的选择器，并在依赖分析阶段保留组件文件。
  const pickupDir = path.join(root, 'components/pickup-time')
  const { packOptions } = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')))
  assert.ok(packOptions.include.some(rule => rule.type === 'folder' && path.resolve(root, rule.value) === pickupDir))
  for (const name of ['checkout', 'orders']) {
    const pageDir = path.join(root, 'pages', name)
    const { usingComponents } = JSON.parse(fs.readFileSync(path.join(pageDir, 'index.json')))
    assert.equal(path.resolve(pageDir, usingComponents['pickup-time']), path.join(pickupDir, 'index'))
  }
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(pickupDir, 'index.' + ext)))
  const login = page('login'); login.setData({ username: '20260001', password: 'fixture-password' }); await login.submit()
  assert.equal(u.session().account.role, 'STUDENT')
  const home = page('home'); await home.load(); assert.equal(home.data.filtered.length, 1); assert.equal(home.data.total, '10.00')
  home.search({ detail: { value: '不存在' } }); assert.equal(home.data.filtered.length, 0)
  home.search({ detail: { value: '' } }); await home.change({ currentTarget: { dataset: { id: 1, delta: 1 } } }); assert.equal(home.data.total, '20.00')
  const checkout = page('checkout')
  checkout.onLoad()
  hideTodaySlots = true
  await checkout.load()
  assert.equal(checkout.data.slotIndex, -1)
  assert.equal(checkout.data.slotLoadFailed, false)
  failSlots = true
  await checkout.dateChange({ detail: { value: 1 } })
  assert.equal(checkout.data.slotLoadFailed, true)
  await checkout.loadSlots()
  assert.equal(checkout.data.slotLoadFailed, false)
  assert.equal(checkout.data.slotIndex, 0)
  await checkout.submit()
  await checkout.submit()
  hideTodaySlots = false
  const submits = calls.filter(c => c.route === '/student/orders' && c.method === 'POST')
  assert.equal(submits.length, 2); assert.equal(submits[0].data.requestId, submits[1].data.requestId)
  assert.match(submits[0].data.requestId, /^[A-Za-z0-9-]{16,64}$/)
  const orders = page('orders')
  const bar = { data: { selected: -1, hidden: false }, setData(values) { Object.assign(this.data, values) } }
  orders.getTabBar = () => bar
  orders.onReady()
  assert.deepEqual(bar.data, { selected: 1, hidden: false })
  await orders.load()
  const payTap = { currentTarget: { dataset: { id: 1 } } }
  const payCalls = () => calls.filter(call => call.route === '/student/orders/1/pay' && call.method === 'POST').length
  const beforeCashier = calls.length
  orders.openPayment(payTap)
  assert.equal(orders.data.paymentOrder.amountText, '20.00')
  assert.equal(bar.data.hidden, true)
  orders.failPayment()
  assert.match(orders.data.paymentError, /模拟支付失败/)
  orders.closePayment()
  assert.equal(orders.data.paymentOrder, null)
  assert.equal(bar.data.hidden, false)
  assert.equal(orders.data.orders[0].status, 1)
  assert.equal(calls.length, beforeCashier)

  orders.openPayment(payTap)
  await orders.confirmPayment()
  assert.equal(payCalls(), 1)
  assert.equal(orders.data.paymentOrder.id, 1)
  assert.match(orders.data.paymentError, /连接失败/)
  assert.equal(orders.data.orders[0].status, 1)

  // 支付前开始的轮询即使晚返回，也不能把成功状态刷回待支付。
  holdOrdersRead = true
  const staleRefresh = orders.load(true)
  orders.setData({ filter: 1 })
  await Promise.all([orders.confirmPayment(), orders.confirmPayment()])
  finishOrdersRead()
  await staleRefresh
  assert.equal(payCalls(), 2)
  assert.equal(orders.data.paymentOrder, null)
  assert.equal(bar.data.hidden, false)
  assert.equal(orders.data.visible[0].status, 2)
  assert.equal(orders.data.visible[0].pickupCode, 'ABCD2345')
  // 原预约时段即使满额也保留选中，便于用户查看与切换。
  slots[0].reserved = slots[0].capacity
  slots.unshift({ id: 2, reserved: 0, capacity: 10, startTime: '10:40', endTime: '11:00' })
  await orders.edit(payTap)
  assert.equal(bar.data.hidden, true)
  assert.equal(orders.data.slots[orders.data.slotIndex].id, 1)
  assert.equal(orders.data.slots[orders.data.slotIndex].isCurrent, true)
  orders.close()
  assert.equal(bar.data.hidden, false)
  await orders.edit(payTap)
  orders.slotChange({ detail: { value: 0 } })
  await orders.saveEdit()
  assert.equal(calls.find(call => call.route === '/student/orders/1/reschedule').data.slotId, 2)
  assert.equal(orders.data.editing, null)
  assert.equal(bar.data.hidden, false)
  records[0].status = 5; await orders.load()
  orders.review(payTap)
  assert.equal(bar.data.hidden, true)
  orders.setData({ content: '测试评价' })
  await orders.saveReview()
  assert.equal(orders.data.reviewing, null)
  assert.equal(bar.data.hidden, false)
  await assert.rejects(u.api('/me')); assert.equal(u.session().token, undefined)
  assert.equal(u.image('/images/rice.jpg'), '/assets/images/rice.jpg')
  assert.throws(() => u.setServer('https://host/campus'))
  console.log('PASS: page files, login, menu/cart/search, pickup dates and retry, idempotent order submission, demo cashier, payment code, stale refresh, reschedule/review, session expiry. Mock platform; no database writes.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
