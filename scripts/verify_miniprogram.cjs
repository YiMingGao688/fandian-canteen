// 模拟微信平台验证页面调用与错误恢复；不向数据库写入测试订单。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../miniprogram'), storage = new Map(), calls = []
let rejectSubmit, loseSubmitResponse = false, loseCartResponse = false
let failPay = true
let hideTodaySlots = false, failSlots = false
let failOrdersRead = false, holdOrdersRead = false, finishOrdersRead
let holdFeedbackRead = false, finishFeedbackRead
let holdAccountRead = false, finishAccountRead
let failWindowRead = false, platform = 'devtools', navigationTitle = ''
const records = [], cart = [{ id: 1, dishId: 1, name: '测试菜品', amount: 10, number: 1 }]
const submitted = new Map()
const windows = [{ id: 1, name: '测试窗口', enabled: 1 }, { id: 2, name: '另一窗口', enabled: 1 }]
const menu = [
  { id: 1, windowId: 1, categoryId: 1, categoryName: '主食', name: '测试菜品', status: 1, stock: 8, price: 10, image: '/images/rice.jpg' },
  { id: 2, windowId: 2, categoryId: 1, categoryName: '主食', name: '另一窗口的菜品', status: 1, stock: 8, price: 9, image: '/images/noodles.jpg' },
]
const slots = [
  { id: 1, reserved: 0, capacity: 10, startTime: '11:00', endTime: '11:20' },
  { id: 2, reserved: 0, capacity: 10, startTime: '11:20', endTime: '11:40' },
]
let app, activeOrders, showOrders
global.App = data => { app = data }
global.getApp = () => app
require(path.join(root, 'app'))
global.wx = {
  getDeviceInfo: () => ({ platform }),
  setNavigationBarTitle: ({ title }) => { navigationTitle = title },
  setNavigationBarColor() {},
  getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
  showToast() {}, stopPullDownRefresh() {}, navigateBack() {}, navigateTo() {}, showModal(o) { o.success({ confirm: true }) },
  switchTab({ url }) {
    if (!activeOrders || url !== '/pages/orders/index') return
    showOrders = activeOrders.onShow()
    activeOrders.onHide()
  },
  request(o) {
    const { origin, pathname, searchParams } = new URL(o.url)
    const route = pathname.replace('/campus', ''); calls.push({ route, data: o.data, method: o.method })
    let data
    if (route === '/auth/login') data = { token: 'fixture', account: { userId: 1, role: 'STUDENT' } }
    else if (route === '/auth/register') {
      if (o.data.username === '20260001') {
        o.success({ statusCode: 200, data: { code: 0, msg: '这个学号已经注册，请直接登录' } })
        return
      }
      data = { token: 'registration-fixture', account: { userId: 2, role: 'STUDENT', displayName: o.data.displayName } }
    }
    else if (route === '/public/windows') {
      if (origin !== 'http://127.0.0.1:15173') assert.equal(o.header.Authorization, undefined)
      if (failWindowRead) { failWindowRead = false; o.fail(); return }
      data = windows
    }
    else if (route === '/public/menu') data = menu
    else if (route === '/public/notices') data = []
    else if (route === '/public/slots') {
      if (failSlots) { failSlots = false; o.fail(); return }
      data = hideTodaySlots && searchParams.get('date') === u.date() ? [] : slots
    }
    else if (route === '/student/cart') {
      if (o.method === 'POST') {
        cart[0].number += o.data.delta
        if (loseCartResponse) { loseCartResponse = false; o.fail(); return }
      }
      if (o.method === 'DELETE') cart.length = 0
      data = cart
    }
    else if (route === '/student/cart/invalid') {
      const index = cart.findIndex(line => !menu.some(dish => dish.id === line.dishId))
      if (index >= 0) cart.splice(index, 1)
      data = index >= 0 ? 1 : 0
    }
    else if (route === '/student/favorites') data = [1]
    else if (route === '/student/orders') {
      if (o.method === 'POST') {
        const existing = submitted.get(o.data.requestId)
        if (existing) data = existing
        else {
          if (rejectSubmit) {
            const message = rejectSubmit()
            rejectSubmit = null
            o.success({ statusCode: 200, data: { code: 0, msg: message } })
            return
          }
          const slot = slots.find(item => item.id === o.data.slotId)
          data = { id: 1, status: '1', amount: 20, windowId: 1, serviceDate: u.date(1), startTime: slot.startTime, endTime: slot.endTime, location: '一食堂一楼 03 号窗口', items: [] }
          records.unshift(data)
          submitted.set(o.data.requestId, data)
          cart.length = 0
          if (loseSubmitResponse) { loseSubmitResponse = false; o.fail(); return }
        }
      } else {
        if (failOrdersRead) { failOrdersRead = false; o.fail(); return }
        data = o.header.Authorization === 'Bearer second' ? [] : records
      }
    } else if (route === '/student/orders/1/pay') {
      if (failPay) { failPay = false; o.fail(); return }
      records[0].status = 2
      records[0].pickupCode = 'ABCD2345'
      data = records[0]
    } else if (route === '/student/orders/1/reschedule') {
      const { startTime, endTime } = slots.find(slot => slot.id === o.data.slotId)
      Object.assign(records[0], { startTime, endTime })
      data = records[0]
    } else if (route === '/student/orders/2/cancel') {
      records[0].status = 6
      data = records[0]
    }
    else if (route === '/student/reviews') { records[0].reviewed = true; data = null }
    else if (route === '/student/feedback') data = [{ id: o.header.Authorization === 'Bearer second' ? 2 : 1 }]
    else if (route === '/me') {
      const respond = () => o.success({ statusCode: 401, data: {} })
      if (holdAccountRead) { holdAccountRead = false; finishAccountRead = respond; return }
      respond()
      return
    }
    else throw new Error('Unexpected route ' + route)
    const response = { statusCode: 200, data: { code: 1, data: JSON.parse(JSON.stringify(data)) } }
    if (route === '/student/orders' && o.method === 'GET' && holdOrdersRead) {
      holdOrdersRead = false
      finishOrdersRead = () => o.success(response)
      return
    }
    if (route === '/student/feedback' && holdFeedbackRead) {
      holdFeedbackRead = false
      finishFeedbackRead = () => o.success(response)
      return
    }
    o.success(response)
  }
}
const u = require(path.join(root, 'utils/api'))
function page(name) {
  let definition
  const file = path.join(root, 'pages', name, 'index.js')
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), Page: d => { definition = d }, getApp, wx, setInterval, clearInterval })
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(values) { Object.assign(this.data, values) } }
}

// 确认修改后的列表会立即更新，旧轮询释放后也保持新状态。
async function checkOrderChangeDuringPoll(orders, change, assertUpdated) {
  holdOrdersRead = true
  const oldRead = orders.load(true)
  const respondOldRead = finishOrdersRead
  const mutation = change()
  try {
    await new Promise(resolve => setImmediate(resolve))
    assertUpdated()
  } finally {
    respondOldRead()
    await Promise.all([oldRead, mutation])
  }
  assertUpdated()
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
  const registration = page('login')
  registration.toggle()
  assert.equal(navigationTitle, '学生注册')
  await registration.submit()
  assert.equal(registration.data.errorField, 'username')
  registration.setData({ username: '20260001' })
  await registration.submit()
  assert.equal(registration.data.errorField, 'displayName')
  registration.setData({ displayName: ' 测试同学 ', password: 'fixture-password' })
  registration.togglePassword()
  assert.equal(registration.data.passwordVisible, true)
  assert.equal(calls.filter(call => call.route === '/auth/register').length, 0)
  await registration.submit()
  assert.match(registration.data.error, /已经注册/)
  registration.input({ currentTarget: { dataset: { field: 'username' } }, detail: { value: '020260001' } })
  assert.equal(registration.data.error, '')
  await registration.submit()
  const registrationRequest = calls.filter(call => call.route === '/auth/register').at(-1)
  assert.equal(registrationRequest.data.username, '020260001')
  assert.equal(registrationRequest.data.displayName, '测试同学')
  assert.equal(u.session().token, 'registration-fixture')
  assert.equal(registration.data.passwordVisible, false)
  registration.toggle()
  assert.equal(navigationTitle, '学生登录')
  u.logout()

  const login = page('login'); login.setData({ username: '20260001', password: 'fixture-password' }); await login.submit()
  assert.equal(u.session().account.role, 'STUDENT')
  const home = page('home'); await home.load(); assert.equal(home.data.filtered.length, 1); assert.equal(home.data.total, '10.00')
  home.search({ detail: { value: '不存在' } }); assert.equal(home.data.filtered.length, 0)
  home.clearSearch()
  const homeBar = { data: { selected: -1, hidden: false }, setData(values) { Object.assign(this.data, values) } }
  home.getTabBar = () => homeBar
  const dishTap = { currentTarget: { dataset: { id: 1, delta: 1 } } }
  home.openDish(dishTap)
  assert.equal(home.data.detailDish.count, 1)
  assert.equal(homeBar.data.hidden, true)
  // 写入已生效但响应丢失时，重新读取餐盘并同步详情和合计。
  loseCartResponse = true
  await home.change(dishTap)
  assert.equal(home.data.detailDish.count, 2)
  assert.equal(home.data.total, '20.00')
  home.openCart()
  assert.equal(home.data.detailDish, null)
  assert.equal(home.data.cartRows[0].subtotal, '20.00')
  home.closeOverlay()
  assert.equal(homeBar.data.hidden, false)
  home.selectWindow({ detail: { value: 1 } })
  assert.equal(home.data.windowConflict, true)
  assert.equal(home.data.filtered[0].otherWindow, true)
  assert.equal(home.data.cartRows[0].addBlocked, '')

  const checkout = page('checkout')
  hideTodaySlots = true
  cart.push({ id: 3, dishId: 3, name: '已下架菜品', amount: 8, number: 1 })
  await checkout.load()
  assert.equal(checkout.data.hasInvalid, true)
  assert.equal(checkout.data.slotIndex, -1)
  await checkout.removeInvalid()
  assert.equal(checkout.data.hasInvalid, false)
  assert.equal(checkout.data.window.id, 1)
  assert.equal(checkout.data.cart[0].subtotalText, '20.00')
  await checkout.load()
  assert.equal(checkout.data.slotIndex, -1)
  assert.equal(checkout.data.slotLoadFailed, false)
  failSlots = true
  await checkout.dateChange({ detail: { value: 1 } })
  assert.equal(checkout.data.slotLoadFailed, true)
  await checkout.loadSlots()
  assert.equal(checkout.data.slotLoadFailed, false)
  assert.equal(checkout.data.slotIndex, 0)

  // 已知库存不足时直接标记菜品，减少份数或补库存后可以重新加载。
  menu[0].stock = 1
  await checkout.load()
  assert.equal(checkout.data.cart[0].shortage, true)
  assert.match(checkout.data.cartError, /库存不足/)
  const submitCalls = () => calls.filter(c => c.route === '/student/orders' && c.method === 'POST')
  await checkout.submit()
  assert.equal(submitCalls().length, 0)
  menu[0].stock = 8
  await checkout.load()
  assert.equal(checkout.data.cartError, '')

  // 后端确认时段满额后刷新可选时段，等待学生重新选择再提交。
  rejectSubmit = () => {
    slots[0].reserved = slots[0].capacity
    return '这个时段预约已满，请换一个时段'
  }
  await checkout.submit()
  assert.match(checkout.data.submitError, /已满/)
  assert.equal(checkout.data.slotIndex, -1)
  assert.deepEqual(Array.from(checkout.data.slots, slot => slot.id), [2])
  await checkout.submit()
  assert.equal(submitCalls().length, 1)
  checkout.slotChange({ detail: { value: 0 } })

  const orders = page('orders')
  activeOrders = orders
  await orders.load()
  orders.filter({ currentTarget: { dataset: { index: 4 } } })
  holdOrdersRead = true
  const oldFilterRefresh = orders.load(true)
  const finishOldFilterRefresh = finishOrdersRead
  // 已落单但客户端未收到响应时，时间、备注、餐具和去重标识均沿用原提交。
  loseSubmitResponse = true
  checkout.remark({ detail: { value: '原备注' } })
  await checkout.submit()
  assert.equal(records.length, 1)
  assert.equal(cart.length, 0)
  assert.match(checkout.data.pendingSlot, /11:20/)
  await checkout.onShow()
  await checkout.dateChange({ detail: { value: 0 } })
  checkout.slotChange({ detail: { value: 1 } })
  checkout.remark({ detail: { value: '修改后的备注' } })
  checkout.cutlery({ detail: { value: false } })
  assert.equal(checkout.data.dateIndex, 1)
  assert.equal(checkout.data.remark, '原备注')
  assert.equal(checkout.data.cutlery, true)
  failOrdersRead = true
  await checkout.submit()
  await showOrders
  finishOldFilterRefresh()
  await oldFilterRefresh
  hideTodaySlots = false
  const submits = submitCalls()
  assert.equal(submits.length, 3)
  assert.notEqual(submits[0].data.requestId, submits[1].data.requestId)
  assert.deepEqual(submits[1].data, submits[2].data)
  assert.match(submits[1].data.requestId, /^[A-Za-z0-9-]{16,64}$/)
  assert.equal(records.length, 1)
  assert.equal(orders.data.filter, 1)
  assert.equal(orders.data.visible[0].id, 1)
  assert.equal(orders.data.visible[0].location, '一食堂一楼 03 号窗口')
  assert.match(orders.data.loadError, /本机服务未连接/)
  await orders.retryOrders()
  assert.equal(orders.data.loadError, '')
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
  assert.match(orders.data.paymentError, /本机服务未连接/)
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
  slots[0].reserved = 0
  slots[1].reserved = slots[1].capacity
  await orders.edit(payTap)
  assert.equal(bar.data.hidden, true)
  assert.equal(orders.data.slots[orders.data.slotIndex].id, 2)
  assert.equal(orders.data.slots[orders.data.slotIndex].isCurrent, true)
  orders.close()
  assert.equal(bar.data.hidden, false)
  await orders.edit(payTap)
  orders.slotChange({ detail: { value: 0 } })
  await checkOrderChangeDuringPoll(orders, () => {
    failOrdersRead = true
    return orders.saveEdit()
  }, () => assert.equal(orders.data.visible[0].startTime, '11:00'))
  assert.equal(calls.find(call => call.route === '/student/orders/1/reschedule').data.slotId, 1)
  assert.equal(orders.data.editing, null)
  assert.equal(bar.data.hidden, false)
  records[0].status = 5; await orders.load()
  orders.review(payTap)
  assert.equal(bar.data.hidden, true)
  orders.setData({ content: '测试评价' })
  await checkOrderChangeDuringPoll(orders, () => orders.saveReview(), () => {
    assert.equal(orders.data.visible[0].reviewed, true)
  })
  assert.equal(orders.data.reviewing, null)
  assert.equal(bar.data.hidden, false)
  records.unshift({ ...records[0], id: 2, status: 2, reviewed: false })
  await orders.load()
  const cancelTap = { currentTarget: { dataset: { id: 2 } } }
  await checkOrderChangeDuringPoll(orders, () => orders.cancelOrder(cancelTap), () => {
    assert.equal(orders.data.visible.find(order => order.id === 2)?.status, 6)
  })
  home.openCart()
  await home.clear()
  assert.equal(home.data.cartOpen, true)
  assert.equal(home.data.count, 0)
  assert.equal(home.data.total, '0.00')

  // 同一台设备换账号，旧订单和取餐码立即清空，迟到的响应无法回写。
  holdOrdersRead = true
  const previousOrders = orders.load(true)
  const respondPreviousOrders = finishOrdersRead
  const notices = page('notices')
  await notices.load()
  assert.equal(notices.data.feedback[0].id, 1)
  holdFeedbackRead = true
  const previousFeedback = notices.load()
  await new Promise(resolve => setImmediate(resolve))
  holdAccountRead = true
  const oldAccount = u.api('/me')
  const rejectedOldAccount = assert.rejects(oldAccount, error => error.sessionChanged)
  u.logout()
  u.saveSession({ token: 'second', account: { userId: 2, role: 'STUDENT' } })
  holdOrdersRead = true
  const newOrders = orders.load()
  assert.equal(orders.data.visible.length, 0)
  assert.equal(orders.data.loadingOrders, true)
  await notices.load()
  assert.equal(notices.data.feedback[0].id, 2)
  respondPreviousOrders()
  finishFeedbackRead()
  finishAccountRead()
  await Promise.all([previousOrders, previousFeedback, rejectedOldAccount])
  assert.equal(u.session().token, 'second')
  assert.equal(orders.data.visible.length, 0)
  assert.equal(notices.data.feedback[0].id, 2)
  finishOrdersRead()
  await newOrders
  assert.equal(orders.data.loadingOrders, false)
  failOrdersRead = true
  await orders.load()
  assert.equal(orders.data.visible.length, 0)
  assert.match(orders.data.loadError, /本机服务未连接/)
  await assert.rejects(u.api('/me')); assert.equal(u.session().token, undefined)
  assert.equal(u.image('/images/rice.jpg'), '/assets/images/rice.jpg')

  // 模拟器使用自己的服务器配置，已保存的真机地址仍可在手机端使用。
  storage.set('hexu.mini.server', 'http://phone-fixture:15174')
  assert.equal(u.server(), 'http://127.0.0.1:15173')
  platform = 'ios'
  assert.equal(u.server(), 'http://phone-fixture:15174')
  platform = 'devtools'
  const profile = page('profile')
  failWindowRead = true
  await profile.onShow()
  assert.match(profile.data.connectionIssue, /本机服务未连接/)
  await profile.refresh()
  assert.equal(profile.data.connectionIssue, '')

  // 探测失败保持原地址和会话，成功切换后才退出原账号。
  u.saveSession({ token: 'fixture', account: { userId: 1, role: 'STUDENT' } })
  profile.settings()
  profile.server({ detail: { value: 'http://unavailable-fixture:15173' } })
  failWindowRead = true
  await profile.saveServer()
  assert.equal(profile.data.settings, true)
  assert.match(profile.data.settingsError, /无法连接服务器/)
  assert.equal(u.session().token, 'fixture')
  assert.equal(u.server(), 'http://127.0.0.1:15173')
  profile.server({ detail: { value: 'http://working-fixture:15173/' } })
  await profile.saveServer()
  assert.equal(profile.data.settings, false)
  assert.equal(profile.data.settingsError, '')
  assert.equal(u.session().token, undefined)
  assert.equal(u.server(), 'http://working-fixture:15173')
  assert.equal(storage.get('hexu.mini.server'), 'http://phone-fixture:15174')
  await assert.rejects(u.setServer('https://host/campus'))
  console.log('PASS: mini-program flows, session isolation, profile retry, and server switching. Mock platform; no database writes.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
