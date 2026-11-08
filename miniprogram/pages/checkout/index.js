const u = require('../../utils/api')
Page({
  data: { cart: [], total: '0.00', dateIndex: 0, dates: [u.date(), u.date(1)], slots: [], slotIndex: -1, remark: '', cutlery: true, busy: false, loadingSlots: false, slotLoadFailed: false, cartError: '', hasInvalid: false },
  onLoad() { this.requestId = u.requestId() },
  onShow() { this.setData({ dates: [u.date(), u.date(1)] }); this.load() },
  onPullDownRefresh() { this.load() },
  async load() {
    if (!u.ensureStudent()) return
    await u.run(this, async () => {
      const [cart, menu, windows] = await Promise.all([u.api('/student/cart'), u.api('/public/menu'), u.api('/public/windows')])
      if (!cart.length) { this.setData({ cart: [], total: '0.00', window: null, cartError: '', hasInvalid: false }); this.windowId = null; return }
      // 保留餐盘明细并常驻提示原因；清空页面会让用户误以为购物车已被清空。
      const dishes = new Map(menu.map(d => [String(d.id), d]))
      const invalid = new Set(cart.filter(c => !dishes.has(String(c.dishId))).map(c => String(c.dishId)))
      const shown = cart.map(c => ({ ...c, image: u.image(c.image), invalid: invalid.has(String(c.dishId)) }))
      const first = dishes.get(String(cart[0].dishId))
      const mixed = !!first && cart.some(c => { const d = dishes.get(String(c.dishId)); return d && String(d.windowId) !== String(first.windowId) })
      if (invalid.size || !first || mixed) {
        this.windowId = null
        this.setData({ cart: shown, cartError: invalid.size || !first ? '餐盘中有已下架或失效的菜品，请移除后继续预约。' : '一份预约只能选择同一窗口，请清空餐盘后重新选择。', hasInvalid: invalid.size > 0, total: '0.00', window: null, slots: [], slotIndex: -1, loadingSlots: false, slotLoadFailed: false })
        return
      }
      this.windowId = first.windowId
      // 金额以服务端菜单当前价格计算，与下单事务重新计价的口径一致。
      const total = cart.reduce((sum, c) => sum + Number(c.number) * Number(dishes.get(String(c.dishId)).price), 0)
      this.setData({ cart: shown, window: windows.find(w => String(w.id) === String(first.windowId)), total: u.money(total), cartError: '', hasInvalid: false })
      await this.loadSlots()
    })
  },
  /** 逐份移除已下架/失效的菜品；后端允许对下架菜品执行减一。 */
  async removeInvalid() {
    if (this.data.busy) return
    const invalid = this.data.cart.filter(c => c.invalid)
    if (!invalid.length) return
    this.setData({ busy: true })
    await u.run(this, async () => {
      for (const item of invalid) {
        for (let i = 0; i < Number(item.number || 1); i++) {
          await u.api('/student/cart', 'POST', { dishId: item.dishId, delta: -1 })
        }
      }
      u.toast('已移除失效菜品')
      await this.load()
    })
    this.setData({ busy: false })
  },
  /** 跨窗口等无法单项处理的场景，提供明确的清空入口并立即刷新。 */
  async clearCart() {
    if (this.data.busy) return
    this.setData({ busy: true })
    await u.run(this, async () => { await u.api('/student/cart', 'DELETE'); await this.load() })
    this.setData({ busy: false })
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
    if (this.data.busy || this.data.loadingSlots || this.data.cartError || !u.ensureStudent()) return
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
