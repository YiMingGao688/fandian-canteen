const u = require('../../utils/api')

Page({
  data: {
    cart: [], count: 0, total: '0.00', window: null,
    dateIndex: 0, dates: [u.date(), u.date(1)], slots: [], slotIndex: -1,
    remark: '', cutlery: true, busy: false, loadingCart: true, loadingSlots: false,
    slotLoadFailed: false, loadError: '', cartError: '', hasInvalid: false,
    submitError: '', pendingSlot: '', confirmed: false, confirmPay: false,
  },

  onShow() { return this.load() },

  /** 登录身份变化后清除旧餐盘、备注和提交快照。 */
  syncSession() {
    const token = u.session().token
    if (token !== this.token) {
      this.token = token
      this.sequence = (this.sequence || 0) + 1
      this.cartRequest = null
      this.windowId = null
      this.pendingSubmission = null
      this.setData({
        cart: [], count: 0, total: '0.00', window: null, dateIndex: 0, slots: [], slotIndex: -1,
        remark: '', cutlery: true, busy: false, loadingCart: false, loadingSlots: false,
        slotLoadFailed: false, loadError: '', cartError: '', hasInvalid: false,
        submitError: '', pendingSlot: '', confirmed: false, confirmPay: false,
      })
    }
    return token
  },

  /** 每次进入都重读服务端餐盘。读取失败时提供重试，避免用过期餐盘提交。 */
  load() {
    const token = this.syncSession()
    if (this.pendingSubmission || this.data.confirmed || !u.ensureStudent()) return
    if (this.cartRequest) return this.cartRequest
    const dates = [u.date(), u.date(1)]
    const dateIndex = Math.max(0, dates.indexOf(this.data.dates[this.data.dateIndex]))
    this.setData({ dates, dateIndex, loadingCart: true, loadError: '' })
    const request = this.loadCart(token).catch(error => {
      const currentToken = this.syncSession()
      if (!error.sessionChanged && (token === currentToken || !currentToken)) this.setData({ loadError: error.message })
    }).finally(() => {
      if (this.cartRequest === request) {
        this.cartRequest = null
        this.setData({ loadingCart: false })
      }
    })
    this.cartRequest = request
    return request
  },

  /** 按餐盘定位取餐窗口，用当前公开菜单检查上下架和库存，并计算展示金额。 */
  async loadCart(token) {
    this.sequence = (this.sequence || 0) + 1
    this.windowId = null
    this.setData({ slots: [], slotIndex: -1, loadingSlots: false, slotLoadFailed: false })
    const [cart, menu, windows] = await Promise.all([u.api('/student/cart'), u.api('/public/menu'), u.api('/public/windows')])
    if (token !== this.syncSession()) return
    const dishes = new Map(menu.map(dish => [String(dish.id), dish]))
    const first = dishes.get(String(cart[0]?.dishId))
    const window = windows.find(item => String(item.id) === String(first?.windowId)) || null
    const shown = cart.map(line => {
      const dish = dishes.get(String(line.dishId))
      const image = dish?.image || line.image
      const stock = Number(dish?.stock) || 0
      return {
        ...line,
        image: image ? u.image(image) : '',
        invalid: !dish,
        stock,
        shortage: Boolean(dish && Number(line.number) > stock),
        subtotal: dish ? Number(line.number) * Number(dish.price) : 0,
      }
    })
    const hasInvalid = shown.some(line => line.invalid)
    const mixed = first && cart.some(line => {
      const dish = dishes.get(String(line.dishId))
      return dish && String(dish.windowId) !== String(first.windowId)
    })
    const unavailable = first && (!window || window.enabled === false || String(window.enabled) === '0')
    const hasShortage = shown.some(line => line.shortage)
    const cartError = hasInvalid ? '餐盘中有已下架或失效的菜品，请移除后继续预约。'
      : mixed ? '一份预约只能选择同一窗口，请清空餐盘后重新选择。'
      : unavailable ? '该窗口暂停预约，请返回点餐页选择其他窗口。'
      : hasShortage ? '部分菜品的剩余库存不足，请返回点餐页调整份数。' : ''

    const count = shown.reduce((sum, line) => sum + Number(line.number), 0)
    // 服务端会在提交时重新计价并校验库存与时段名额。
    const total = shown.reduce((sum, line) => sum + line.subtotal, 0)
    this.setData({
      cart: shown.map(line => ({ ...line, subtotalText: u.money(line.subtotal) })),
      window, count, total: u.money(total), cartError, hasInvalid,
    })
    if (cartError || !first) return
    this.windowId = first.windowId
    await this.loadSlots()
  },

  /** 使用一次服务端操作移除全部失效行，再重新核对餐盘。 */
  async removeInvalid() {
    const token = this.syncSession()
    if (this.data.busy || this.data.loadingCart || this.pendingSubmission || !this.data.hasInvalid || !u.ensureStudent()) return
    this.setData({ busy: true })
    await u.run(this, () => u.api('/student/cart/invalid', 'DELETE'))
    if (token !== this.syncSession()) return
    await this.load()
    if (token === this.syncSession()) this.setData({ busy: false })
  },

  /** 混入不同窗口等情况可由用户主动清空餐盘。 */
  async clearCart() {
    const token = this.syncSession()
    if (this.data.busy || this.data.loadingCart || this.pendingSubmission || !this.data.cart.length || !u.ensureStudent()) return
    this.setData({ busy: true })
    await u.run(this, () => u.api('/student/cart', 'DELETE'))
    if (token !== this.syncSession()) return
    await this.load()
    if (token === this.syncSession()) this.setData({ busy: false })
  },

  /** 日期切换只使用最新查询结果；提交被拒后需要学生确认新的时段选择。 */
  async loadSlots() {
    if (!this.windowId || this.pendingSubmission) return
    const sequence = this.sequence = (this.sequence || 0) + 1
    const date = this.data.dates[this.data.dateIndex]
    this.setData({ loadingSlots: true, slotLoadFailed: false, slotIndex: -1, slots: [] })
    const available = await u.run(this, () => u.api('/public/slots?windowId=' + this.windowId + '&date=' + date))
    if (sequence !== this.sequence) return
    const slots = (available || []).filter(slot => Number(slot.reserved) < Number(slot.capacity))
    const selectFirst = !this.data.submitError
    this.setData({ loadingSlots: false, slotLoadFailed: !available, slots, slotIndex: selectFirst && slots.length ? 0 : -1 })
  },

  dateChange(event) {
    if (this.data.busy || this.pendingSubmission) return
    this.setData({ dateIndex: Number(event.detail.value) })
    return this.loadSlots()
  },
  slotChange(event) {
    const slotIndex = Number(event.detail.value)
    if (!this.data.busy && !this.pendingSubmission && this.data.slots[slotIndex]) this.setData({ slotIndex, submitError: '' })
  },
  remark(event) {
    if (!this.data.busy && !this.pendingSubmission) this.setData({ remark: event.detail.value })
  },
  cutlery(event) {
    if (!this.data.busy && !this.pendingSubmission) this.setData({ cutlery: event.detail.value })
  },
  backToMenu() { wx.switchTab({ url: '/pages/home/index' }) },
  openOrders() {
    wx.switchTab({
      url: '/pages/orders/index',
      success: () => { if (this.data.confirmPay) u.toast('预约已创建，请在下单后 15 分钟内支付') },
      fail: () => u.toast('打开预约页失败，请重试'),
    })
  },

  /** 仅替换加载失败的图片，金额和菜品明细仍可查看。 */
  imageError(event) {
    const id = String(event.currentTarget.dataset.id)
    this.setData({ cart: this.data.cart.map(line => String(line.id) === id ? { ...line, image: '' } : line) })
  },

  /** 提交结果未知时保留完整请求。收到明确拒绝后重新核对餐盘和时段。 */
  async submit() {
    const token = this.syncSession()
    if (this.data.busy || this.data.confirmed || !u.ensureStudent()) return
    if (!this.pendingSubmission) {
      const { loadingCart, loadingSlots, loadError, cartError, cart, dates, dateIndex, slots, slotIndex, remark, cutlery } = this.data
      if (loadingCart || loadingSlots || loadError || cartError || !cart.length) return
      const slot = slots[slotIndex]
      if (!slot) return u.toast('请选择有余量的取餐时段')
      this.pendingSubmission = {
        body: { slotId: slot.id, requestId: u.requestId(), remark, needCutlery: cutlery },
        slot: `${dates[dateIndex]} ${slot.startTime} – ${slot.endTime}`,
      }
    }
    const submission = this.pendingSubmission
    this.setData({ busy: true, submitError: '' })
    try {
      const order = await u.api('/student/orders', 'POST', submission.body)
      if (token !== this.syncSession()) return
      if (!order?.id) {
        // 成功响应缺少订单标识时仍需按原编号确认结果。
        this.setData({ pendingSlot: submission.slot })
        return
      }
      this.pendingSubmission = null
      getApp().globalData.createdReservation = { token, order }
      this.setData({ confirmed: true, confirmPay: Number(order.status) === 1, pendingSlot: '' })
      this.openOrders()
    } catch (error) {
      if (token !== this.syncSession()) {
        if (!this.token && !error.sessionChanged) this.setData({ loadError: error.message })
        return
      }
      if (error.uncertain) {
        this.setData({ pendingSlot: submission.slot })
        return
      }
      this.pendingSubmission = null
      this.setData({ pendingSlot: '', submitError: error.message })
      u.toast(error.message)
      await this.load()
    } finally {
      if (token === this.syncSession()) this.setData({ busy: false })
    }
  },
})
