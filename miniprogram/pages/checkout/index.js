const u = require('../../utils/api')
Page({
  data: { cart: [], total: '0.00', dateIndex: 0, dates: [u.date(), u.date(1)], slots: [], slotIndex: -1, remark: '', cutlery: true, busy: false, loadingSlots: false, slotLoadFailed: false },
  onLoad() { this.requestId = u.requestId() },
  onShow() { this.setData({ dates: [u.date(), u.date(1)] }); this.load() },
  onPullDownRefresh() { this.load() },
  async load() {
    if (!u.ensureStudent()) return
    await u.run(this, async () => {
      const [cart, menu, windows] = await Promise.all([u.api('/student/cart'), u.api('/public/menu'), u.api('/public/windows')])
      if (!cart.length) { this.setData({ cart: [], total: '0.00', window: null }); this.windowId = null; return }
      // 逐项核对餐盘：公开菜单只含在售菜品，任一菜品下架或失效都不能进入结算。
      const dishes = new Map(menu.map(d => [String(d.id), d]))
      const unusable = () => this.setData({ cart: [], total: '0.00', window: null, slots: [], slotIndex: -1, loadingSlots: false })
      if (cart.some(c => !dishes.has(String(c.dishId)))) { unusable(); throw new Error('餐盘中有已下架或失效的菜品，请返回点餐页清空后重选') }
      const first = dishes.get(String(cart[0].dishId))
      if (cart.some(c => String(dishes.get(String(c.dishId)).windowId) !== String(first.windowId))) { unusable(); throw new Error('一份预约只能选择同一窗口，请返回点餐页清空餐盘') }
      this.windowId = first.windowId
      // 金额以服务端菜单当前价格计算，与下单事务重新计价的口径一致。
      const total = cart.reduce((sum, c) => sum + Number(c.number) * Number(dishes.get(String(c.dishId)).price), 0)
      this.setData({ cart: cart.map(c => ({ ...c, image: u.image(c.image) })), window: windows.find(w => String(w.id) === String(first.windowId)), total: u.money(total) })
      await this.loadSlots()
    })
  },
  /** 切换日期后只使用最新一次查询结果，满额时段不可提交。 */
  async loadSlots() {
    if (!this.windowId) return
    const sequence = this.sequence = (this.sequence || 0) + 1
    const date = this.data.dates[this.data.dateIndex]
    this.setData({ loadingSlots: true, slotLoadFailed: false, slotIndex: -1, slots: [] })
    const available = await u.run(this, () => u.api(`/public/slots?windowId=${this.windowId}&date=${date}`))
    if (sequence !== this.sequence) return
    const slots = (available || []).filter(s => Number(s.reserved) < Number(s.capacity))
    this.setData({ loadingSlots: false, slotLoadFailed: !available, slots, slotIndex: slots.length ? 0 : -1 })
  },
  dateChange(e) { this.setData({ dateIndex: Number(e.detail.value) }); return this.loadSlots() },
  slotChange(e) { this.setData({ slotIndex: Number(e.detail.value) }) },
  remark(e) { this.setData({ remark: e.detail.value }) },
  cutlery(e) { this.setData({ cutlery: e.detail.value }) },
  async submit() {
    if (this.data.busy || this.data.loadingSlots || !u.ensureStudent()) return
    const slot = this.data.slots[this.data.slotIndex]
    if (!slot) return u.toast('请选择有余量的取餐时段')
    this.setData({ busy: true })
    await u.run(this, async () => {
      await u.api('/student/orders', 'POST', { slotId: slot.id, requestId: this.requestId, remark: this.data.remark, needCutlery: this.data.cutlery })
      this.requestId = u.requestId(); wx.switchTab({ url: '/pages/orders/index' }); u.toast('预约已创建，请在 15 分钟内支付')
    })
    this.setData({ busy: false })
  }
})
