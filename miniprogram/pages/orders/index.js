const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { logged: false, orders: [], visible: [], filter: 0, tabs: u.statuses, loadingOrders: false, loadError: '', busy: false, paymentOrder: null, paymentError: '', editing: null, reviewing: null, dates: [u.date(), u.date(1)], dateIndex: 0, slots: [], slotIndex: -1, loadingSlots: false, slotLoadFailed: false, rating: 5, content: '' },
  onShow() {
    this.syncTabBar()
    const request = this.load()
    clearInterval(this.timer)
    this.timer = setInterval(() => this.load(true), 5000)
    return request
  },
  onReady() { this.syncTabBar() },
  onHide() { clearInterval(this.timer) },
  onUnload() { clearInterval(this.timer) },
  onPullDownRefresh() { this.load() },

  /** 同步账号身份，切换时立即清空订单与未提交的评价，旧请求失去回写资格。 */
  syncSession() {
    const token = u.session().token
    if (token !== this.token) {
      this.token = token
      this.orderRequest = null
      this.focusOrderId = null
      this.sequence = (this.sequence || 0) + 1
      this.setSheets({
        logged: Boolean(token), orders: [], visible: [], filter: 0, loadingOrders: false, loadError: '',
        paymentOrder: null, paymentError: '', editing: null, reviewing: null, busy: false,
        slots: [], slotIndex: -1, loadingSlots: false, slotLoadFailed: false, rating: 5, content: '',
      })
    }
    return token
  },

  /** 返回预约页时先展示下单接口确认的订单，再同步列表和最新状态。 */
  load(silent = false) {
    const token = this.syncSession()
    const app = getApp().globalData
    const created = app.createdReservation
    app.createdReservation = null
    if (token && created?.token === token) {
      const order = u.order(created.order)
      const orders = [order, ...this.data.orders.filter(item => String(item.id) !== String(order.id))]
      this.ordersRevision = (this.ordersRevision || 0) + 1
      this.orderRequest = null
      this.focusOrderId = order.id
      this.setSheets({
        orders, filter: order.status === 1 ? 1 : 0, loadError: '',
        paymentOrder: null, editing: null, reviewing: null,
      })
      this.apply()
      if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    }
    if (!token) {
      wx.stopPullDownRefresh()
      return
    }
    if (this.orderRequest) return this.orderRequest
    if (!silent || !this.data.orders.length) this.setData({ loadingOrders: true })
    const request = this.readOrders(token, this.ordersRevision).finally(() => {
      if (this.orderRequest === request) {
        this.orderRequest = null
        this.setData({ loadingOrders: false })
        wx.stopPullDownRefresh()
      }
    })
    this.orderRequest = request
    return request
  },

  /** 保留同一账号的已确认列表，读取失败时提供重试入口。 */
  async readOrders(token, revision) {
    try {
      const orders = (await u.api('/student/orders')).map(u.order)
      // 旧轮询可能晚到，不能覆盖订单操作已确认的新状态。
      if (token !== this.syncSession() || revision !== this.ordersRevision) return
      const { paymentOrder, busy } = this.data
      if (paymentOrder && !busy && !orders.some(order => String(order.id) === String(paymentOrder.id) && order.status === 1)) {
        this.setSheets({ paymentOrder: null, paymentError: '' })
      }
      this.setData({ orders, loadError: '' })
      this.apply()
    } catch (error) {
      const currentToken = this.syncSession()
      if (token === currentToken && revision === this.ordersRevision && !error.sessionChanged) {
        this.setData({ loadError: error.message })
      }
      if (!currentToken) wx.stopPullDownRefresh()
    }
  },
  retryOrders() { return this.load() },
  /** 新建预约置顶，离开待支付后切回全部；学生主动筛选后取消置顶。 */
  apply() {
    const { orders, filter } = this.data
    const focused = orders.find(order => String(order.id) === String(this.focusOrderId))
    const activeFilter = focused && filter === 1 && focused.status !== 1 ? 0 : filter
    const visible = orders.filter(order => !activeFilter || order.status === activeFilter)
    const index = visible.indexOf(focused)
    if (index > 0) visible.unshift(...visible.splice(index, 1))
    this.setData({ visible, filter: activeFilter })
  },
  filter(e) {
    this.focusOrderId = null
    this.setData({ filter: Number(e.currentTarget.dataset.index) })
    this.apply()
  },
  login() { wx.navigateTo({ url: '/pages/login/index' }) },
  /** 小程序的自定义底栏独立渲染，打开底部弹层时同步收起导航。 */
  syncTabBar() {
    const { paymentOrder, editing, reviewing } = this.data
    selectTab(this, 1, Boolean(paymentOrder || editing || reviewing))
  },
  setSheets(data) {
    this.setData(data)
    this.syncTabBar()
  },
  /** 更新服务端已确认的订单字段，避免操作前发出的轮询覆盖新状态或被后续刷新复用。 */
  updateOrder(id, changes, sheets = {}) {
    this.ordersRevision = (this.ordersRevision || 0) + 1
    this.orderRequest = null
    const orders = this.data.orders.map(order => String(order.id) === String(id) ? { ...order, ...changes } : order)
    this.setSheets({ orders, loadingOrders: false, ...sheets })
    this.apply()
    wx.stopPullDownRefresh()
  },
  /** 只允许从当前待支付预约进入演示收银台，实际支付状态由后端确认。 */
  openPayment(e) {
    this.syncSession()
    if (this.data.busy || !u.ensureStudent()) return
    const id = e.currentTarget.dataset.id
    const paymentOrder = this.data.orders.find(order => String(order.id) === String(id) && order.status === 1)
    if (!paymentOrder) return u.toast('这份预约当前无法支付')
    this.setSheets({ paymentOrder, paymentError: '' })
  },
  /** 演示失败只改变提示，学生可以在当前收银台重试。 */
  failPayment() {
    if (this.data.busy || !this.data.paymentOrder) return
    this.setData({ paymentError: '本次模拟支付失败，可以重试。' })
  },
  closePayment() {
    if (this.data.busy) return
    this.setSheets({ paymentOrder: null, paymentError: '' })
  },
  /** 使用原有演示支付接口，并以服务端返回的订单和取餐码刷新列表。 */
  async confirmPayment() {
    const token = this.syncSession()
    const { paymentOrder, busy } = this.data
    if (busy || !paymentOrder || !u.ensureStudent()) return
    this.setData({ busy: true, paymentError: '' })
    try {
      const paid = u.order(await u.api('/student/orders/' + paymentOrder.id + '/pay', 'POST'))
      if (token !== this.syncSession()) return
      const filter = this.data.filter === 1 ? 0 : this.data.filter
      this.updateOrder(paid.id, paid, { filter, paymentOrder: null })
      u.toast('模拟支付完成，请等待窗口备餐')
    } catch (error) {
      if (token === this.syncSession() && !error.sessionChanged) this.setData({ paymentError: error.message })
    } finally {
      if (token === this.syncSession()) this.setData({ busy: false })
    }
  },
  /** 取消预约会释放库存和名额，与离开支付弹层分开处理。 */
  async cancelOrder(e) {
    const token = this.syncSession()
    if (this.data.busy || !u.ensureStudent()) return
    const { id } = e.currentTarget.dataset
    if (!this.data.orders.some(order => String(order.id) === String(id) && [1, 2].includes(order.status))) return
    const confirmation = await new Promise(resolve => wx.showModal({
      title: '取消预约',
      content: '取消后归还库存和预约名额，确定取消？',
      success: resolve,
      fail: () => resolve({ confirm: false }),
    }))
    if (!confirmation.confirm || this.data.busy || token !== this.syncSession()) return
    this.setData({ busy: true })
    await u.run(this, async () => {
      const cancelled = await u.api('/student/orders/' + id + '/cancel', 'POST')
      if (token !== this.syncSession()) return
      this.updateOrder(id, u.order(cancelled))
      u.toast('预约已取消')
      await this.load(true)
    })
    if (token === this.syncSession()) this.setData({ busy: false })
  },
  async edit(e) {
    this.syncSession()
    if (this.data.busy) return
    const editing = this.data.orders.find(o => String(o.id) === String(e.currentTarget.dataset.id) && [1, 2].includes(o.status))
    if (!editing) return
    const dates = [u.date(), u.date(1)]
    this.setSheets({ editing, dates, dateIndex: editing.serviceDate === dates[1] ? 1 : 0, slots: [], slotIndex: -1 })
    await this.loadSlots()
  },
  /** 改约保留仍可选的原时段。提交被拒后只保留原时段的选中态。 */
  async loadSlots(selectFirst = true) {
    const token = this.syncSession()
    const { editing, dates, dateIndex } = this.data
    if (!editing) return
    const sequence = this.sequence = (this.sequence || 0) + 1
    this.setData({ loadingSlots: true, slotLoadFailed: false, slotIndex: -1, slots: [] })
    const available = await u.run(this, () => u.api(`/public/slots?windowId=${editing.windowId}&date=${dates[dateIndex]}`))
    if (token !== this.syncSession() || sequence !== this.sequence || !this.data.editing) return
    const slots = (available || [])
      // 订单接口只返回预约日期和起止时间，时段主键仅由服务端使用。
      .map(s => ({
        ...s, isCurrent: dates[dateIndex] === editing.serviceDate
          && s.startTime === editing.startTime && s.endTime === editing.endTime,
      }))
      .filter(s => s.isCurrent || Number(s.reserved) < Number(s.capacity))
    const currentIndex = slots.findIndex(s => s.isCurrent)
    const slotIndex = currentIndex < 0 && selectFirst && slots.length ? 0 : currentIndex
    this.setData({ loadingSlots: false, slotLoadFailed: !available, slots, slotIndex })
  },
  retrySlots() { return this.loadSlots() },
  dateChange(e) { this.setData({ dateIndex: Number(e.detail.value) }); return this.loadSlots() },
  slotChange(e) { this.setData({ slotIndex: Number(e.detail.value) }) },
  /** 改约成功后立即展示服务端返回的时段，再同步本人预约列表。 */
  async saveEdit() {
    const token = this.syncSession()
    const { busy, editing, loadingSlots, slots, slotIndex } = this.data
    if (busy || loadingSlots || !editing || !slots[slotIndex] || !u.ensureStudent()) return
    this.setData({ busy: true })
    try {
      const updated = await u.api(`/student/orders/${editing.id}/reschedule`, 'POST', { slotId: slots[slotIndex].id })
      if (token !== this.syncSession()) return
      this.updateOrder(editing.id, u.order(updated), { editing: null })
      u.toast('改约成功')
      await this.load(true)
    } catch (error) {
      if (token === this.syncSession() && !error.sessionChanged) {
        u.toast(error.message)
        await this.loadSlots(false)
      }
    } finally {
      if (token === this.syncSession()) this.setData({ busy: false })
    }
  },
  review(e) {
    this.syncSession()
    const { id } = e.currentTarget.dataset
    if (this.data.busy || !this.data.orders.some(order => String(order.id) === String(id) && order.status === 5 && !order.reviewed)) return
    this.setSheets({ reviewing: id, rating: 5, content: '' })
  },
  rate(e) { this.setData({ rating: Number(e.currentTarget.dataset.rating) }) },
  content(e) { this.setData({ content: e.detail.value }) },
  async saveReview() {
    const token = this.syncSession()
    const { busy, reviewing, rating, content } = this.data
    if (busy || !reviewing || !u.ensureStudent()) return
    if (!content.trim()) return u.toast('请写下用餐感受')
    this.setData({ busy: true })
    await u.run(this, async () => {
      await u.api('/student/reviews', 'POST', { orderId: reviewing, rating, content })
      if (token !== this.syncSession()) return
      this.updateOrder(reviewing, { reviewed: true }, { reviewing: null })
      u.toast('谢谢你的评价')
      await this.load(true)
    })
    if (token === this.syncSession()) this.setData({ busy: false })
  },
  close() {
    if (this.data.busy) return
    this.sequence = (this.sequence || 0) + 1
    this.setSheets({ editing: null, reviewing: null, loadingSlots: false })
  },
  noop() {}
})
