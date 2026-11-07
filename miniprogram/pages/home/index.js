const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { loading: false, busy: false, windows: [], menu: [], filtered: [], categories: [], windowIndex: 0, categoryId: 'all', query: '', favoritesOnly: false, cart: [], favorites: [], count: 0, total: '0.00' },
  onShow() {
    selectTab(this, 0)
    if (wx.getStorageSync('hexu.mini.favorites')) {
      wx.removeStorageSync('hexu.mini.favorites')
      this.setData({ favoritesOnly: true })
    }
    this.load()
  },
  onPullDownRefresh() { this.load() },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true })
    await u.run(this, async () => {
      const [windows, menu] = await Promise.all([u.api('/public/windows'), u.api('/public/menu')])
      this.setData({ windows, menu: menu.map(u.dish), error: '', cart: [], favorites: [] }); this.apply()
      let cart = [], favorites = []
      if (u.session().account && u.session().account.role === 'STUDENT') [cart, favorites] = await Promise.all([u.api('/student/cart'), u.api('/student/favorites')])
      this.setData({ cart, favorites }); this.apply()
    })
    if (!this.data.windows.length) this.setData({ error: '没有取得菜单，请到“我的”检查服务器地址后重试。' })
    this.setData({ loading: false })
  },
  apply() {
    const selected = this.data.windows[this.data.windowIndex] || this.data.windows[0] || {}
    const rows = this.data.menu.filter(d => String(d.windowId) === String(selected.id))
    const categories = [{ id: 'all', name: '全部' }]
    rows.forEach(d => { if (!categories.some(c => String(c.id) === String(d.categoryId))) categories.push({ id: d.categoryId, name: d.categoryName }) })
    const filtered = rows.filter(d => Number(d.status) === 1 && (this.data.categoryId === 'all' || String(d.categoryId) === String(this.data.categoryId)) && (!this.data.favoritesOnly || this.data.favorites.some(id => String(id) === String(d.id))) && `${d.name}${d.tags || ''}${d.description || ''}`.includes(this.data.query.trim())).map(d => ({ ...d, count: (this.data.cart.find(c => String(c.dishId) === String(d.id)) || {}).number || 0, liked: this.data.favorites.some(id => String(id) === String(d.id)) }))
    // 合计按公开菜单当前单价计算，避免管理员改价后仍显示加购时的旧价格快照。
    const prices = new Map(this.data.menu.map(d => [String(d.id), Number(d.price)]))
    const total = this.data.cart.reduce((n, c) => n + Number(c.number) * (prices.has(String(c.dishId)) ? prices.get(String(c.dishId)) : Number(c.amount)), 0)
    this.setData({ selected, categories, filtered, count: this.data.cart.reduce((n, c) => n + c.number, 0), total: u.money(total) })
  },
  selectWindow(e) { this.setData({ windowIndex: Number(e.currentTarget.dataset.index), categoryId: 'all' }); this.apply() },
  search(e) { this.setData({ query: e.detail.value }); this.apply() },
  category(e) { this.setData({ categoryId: e.currentTarget.dataset.id }); this.apply() },
  favorites() { this.setData({ favoritesOnly: !this.data.favoritesOnly }); this.apply() },
  async change(e) {
    if (this.data.busy || !u.ensureStudent()) return
    this.setData({ busy: true })
    await u.run(this, async () => { await u.api('/student/cart', 'POST', { dishId: e.currentTarget.dataset.id, delta: Number(e.currentTarget.dataset.delta) }); await this.load() })
    this.setData({ busy: false })
  },
  async favorite(e) {
    if (this.data.busy || !u.ensureStudent()) return
    this.setData({ busy: true })
    await u.run(this, async () => { await u.api(`/student/favorites/${e.currentTarget.dataset.id}?enabled=${!e.currentTarget.dataset.liked}`, 'PUT'); await this.load() })
    this.setData({ busy: false })
  },
  checkout() { if (u.ensureStudent()) { if (!this.data.count) return u.toast('先选一道喜欢的菜吧'); wx.navigateTo({ url: '/pages/checkout/index' }) } },
  async clear() { if (!u.ensureStudent() || this.data.busy) return; this.setData({ busy: true }); await u.run(this, async () => { await u.api('/student/cart', 'DELETE'); await this.load() }); this.setData({ busy: false }) }
})
