const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { logged: false, orders: [], visible: [], filter: 0, tabs: u.statuses, busy: false, paymentOrder: null, paymentError: '', editing: null, reviewing: null, dates: [u.date(), u.date(1)], dateIndex: 0, slots: [], slotIndex: -1, loadingSlots: false, slotLoadFailed: false, rating: 5, content: '' },
  onShow() {
    this.syncTabBar()
    this.load()
    clearInterval(this.timer)
    this.timer = setInterval(() => this.load(true), 5000)
  },
  onReady() { this.syncTabBar() },
  onHide() { clearInterval(this.timer) },
  onUnload() { clearInterval(this.timer) },
  onPullDownRefresh() { this.load() },
  async load(silent = false) {
    const logged = !!u.session().token
    if (!logged) {
      this.clearOrders()
      wx.stopPullDownRefresh()
      return
    }
    this.setData({ logged })
    if (this.loading) return
    this.loading = true
    const paymentRevision = this.paymentRevision
    try {
      const orders = (await u.api('/student/orders')).map(u.order)
      // 支付前发出的轮询可能晚到，避免它覆盖支付接口已确认的新状态。
      if (paymentRevision !== this.paymentRevision) return
      const { paymentOrder, busy } = this.data
      if (paymentOrder && !busy && !orders.some(order => String(order.id) === String(paymentOrder.id) && order.status === 1)) {
        this.setSheets({ paymentOrder: null, paymentError: '' })
      }
      this.setData({ orders })
      this.apply()
    } catch (error) {
      if (!u.session().token) this.clearOrders()
      if (!silent) u.toast(error.message)
    } finally {
      this.loading = false
      wx.stopPullDownRefresh()
    }
  },
  apply() { this.setData({ visible: this.data.orders.filter(order => !this.data.filter || order.status === this.data.filter) }) },
  filter(e) { this.setData({ filter: Number(e.currentTarget.dataset.index) }); this.apply() },
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
  /** 会话失效时同时关闭弹层，恢复可用于重新登录的导航。 */
  clearOrders() {
    this.setSheets({ logged: false, orders: [], visible: [], paymentOrder: null, paymentError: '', editing: null, reviewing: null })
  },
  /** 只允许从当前待支付预约进入演示收银台，实际支付状态由后端确认。 */
  openPayment(e) {
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
    const { paymentOrder, busy } = this.data
    if (busy || !paymentOrder || !u.ensureStudent()) return
    this.setData({ busy: true, paymentError: '' })
    try {
      const paid = u.order(await u.api('/student/orders/' + paymentOrder.id + '/pay', 'POST'))
      this.paymentRevision = (this.paymentRevision || 0) + 1
      const orders = this.data.orders.map(order => String(order.id) === String(paid.id) ? paid : order)
      const filter = this.data.filter === 1 ? 0 : this.data.filter
      this.setSheets({ orders, filter, paymentOrder: null })
      this.apply()
      u.toast('模拟支付完成，请等待窗口备餐')
    } catch (error) {
      this.setData({ paymentError: error.message })
    } finally {
      this.setData({ busy: false })
    }
  },
  /** 取消预约会释放库存和名额，与离开支付弹层分开处理。 */
  async cancelOrder(e) {
    if (this.data.busy || !u.ensureStudent()) return
    const { id } = e.currentTarget.dataset
    const confirmation = await new Promise(resolve => wx.showModal({
      title: '取消预约',
      content: '取消后归还库存和预约名额，确定取消？',
      success: resolve,
      fail: () => resolve({ confirm: false }),
    }))
    if (!confirmation.confirm || this.data.busy) return
    this.setData({ busy: true })
    await u.run(this, async () => {
      await u.api('/student/orders/' + id + '/cancel', 'POST')
      u.toast('预约已取消')
      await this.load()
    })
    this.setData({ busy: false })
  },
  async edit(e) {
    const editing = this.data.orders.find(o => String(o.id) === String(e.currentTarget.dataset.id))
    if (!editing) return
    const dates = [u.date(), u.date(1)]
    this.setSheets({ editing, dates, dateIndex: editing.serviceDate === dates[1] ? 1 : 0, slots: [], slotIndex: -1 })
    await this.loadSlots()
  },
  /** 改约保留仍可选的原时段，即使该时段已满，避免默认移动既有预约。 */
  async loadSlots() {
    const { editing, dates, dateIndex } = this.data
    if (!editing) return
    const sequence = this.sequence = (this.sequence || 0) + 1
    this.setData({ loadingSlots: true, slotLoadFailed: false, slotIndex: -1, slots: [] })
    const available = await u.run(this, () => u.api(`/public/slots?windowId=${editing.windowId}&date=${dates[dateIndex]}`))
    if (sequence !== this.sequence || !this.data.editing) return
    const slots = (available || [])
      .map(s => ({ ...s, isCurrent: String(s.id) === String(editing.slotId) }))
      .filter(s => s.isCurrent || Number(s.reserved) < Number(s.capacity))
    const currentIndex = slots.findIndex(s => s.isCurrent)
    this.setData({ loadingSlots: false, slotLoadFailed: !available, slots, slotIndex: slots.length ? Math.max(0, currentIndex) : -1 })
  },
  dateChange(e) { this.setData({ dateIndex: Number(e.detail.value) }); return this.loadSlots() },
  slotChange(e) { this.setData({ slotIndex: Number(e.detail.value) }) },
  async saveEdit() {
    const { busy, editing, loadingSlots, slots, slotIndex } = this.data
    if (busy || loadingSlots || !editing || !slots[slotIndex]) return
    this.setData({ busy: true })
    await u.run(this, async () => {
      await u.api(`/student/orders/${editing.id}/reschedule`, 'POST', { slotId: slots[slotIndex].id })
      this.setSheets({ editing: null })
      u.toast('改约成功')
      await this.load()
    })
    this.setData({ busy: false })
  },
  review(e) { this.setSheets({ reviewing: e.currentTarget.dataset.id, rating: 5, content: '' }) },
  rate(e) { this.setData({ rating: Number(e.currentTarget.dataset.rating) }) },
  content(e) { this.setData({ content: e.detail.value }) },
  async saveReview() {
    if (this.data.busy) return
    if (!this.data.content.trim()) return u.toast('请写下用餐感受')
    this.setData({ busy: true })
    await u.run(this, async () => {
      await u.api('/student/reviews', 'POST', { orderId: this.data.reviewing, rating: this.data.rating, content: this.data.content })
      this.setSheets({ reviewing: null })
      u.toast('谢谢你的评价')
      await this.load()
    })
    this.setData({ busy: false })
  },
  close() {
    if (this.data.busy) return
    this.sequence = (this.sequence || 0) + 1
    this.setSheets({ editing: null, reviewing: null, loadingSlots: false })
  },
  noop() {}
})
