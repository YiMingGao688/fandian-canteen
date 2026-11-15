const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')

const ORDER_LIMIT = 20

function isClosed(window) {
  return window?.enabled === false || String(window?.enabled) === '0'
}

Page({
  data: {
    loading: true, busy: false, error: '', windows: [], menu: [], filtered: [], groups: [], featured: [],
    categories: [], windowIndex: 0, selected: {}, windowClosed: false, categoryId: 'all',
    query: '', favoritesOnly: false, cart: [], favorites: [], cartRows: [], count: 0, total: '0.00',
    cartWindowName: '', windowConflict: false, cartOpen: false, detailDish: null,
  },

  /** 从「我的收藏」返回时直接显示收藏筛选并定位到菜单。 */
  async onShow() {
    selectTab(this, 0)
    const fromFavorites = wx.getStorageSync('hexu.mini.favorites')
    if (fromFavorites) {
      wx.removeStorageSync('hexu.mini.favorites')
      this.updateFilters({ favoritesOnly: true, categoryId: 'all', query: '' })
    }
    await this.load()
    if (fromFavorites) this.goToMenu()
  },

  onReady() { selectTab(this, 0, this.data.cartOpen || Boolean(this.data.detailDish)) },
  onHide() { this.closeOverlay() },
  onPullDownRefresh() {
    if (this.data.busy) return wx.stopPullDownRefresh()
    return this.load()
  },

  /** 仅复用当前账号的刷新请求。进入页面时先清除旧账号的餐盘和收藏。 */
  load() {
    const token = this.syncSession()
    if (this.menuRequest) return this.menuRequest
    if (this.data.busy) return
    this.setData({ loading: true, error: '' })
    const request = this.refreshMenu(token).finally(() => {
      if (this.menuRequest === request) {
        this.menuRequest = null
        this.setData({ loading: false })
        wx.stopPullDownRefresh()
      }
    })
    this.menuRequest = request
    return request
  },

  /** 切换会话后释放刷新标记，让新账号立即读取自己的数据。 */
  syncSession() {
    const { token, account } = u.session()
    const studentToken = account?.role === 'STUDENT' ? token : undefined
    if (studentToken !== this.loadedToken) {
      this.loadedToken = studentToken
      this.menuRequest = null
      this.setData({ cart: [], favorites: [], busy: false, loading: false })
      this.apply()
    }
    return studentToken
  },

  /** 窗口列表按 ID 保留选择，再读取当前学生的餐盘和收藏。 */
  async refreshMenu(token) {
    try {
      const [windows, menu] = await Promise.all([u.api('/public/windows'), u.api('/public/menu')])
      if (token !== this.syncSession()) return
      const windowIndex = Math.max(0, windows.findIndex(window => String(window.id) === String(this.data.selected.id)))
      this.setData({
        windows: windows.map(window => ({ ...window, pickerLabel: [window.canteenName, window.name].filter(Boolean).join(' · ') })),
        windowIndex,
        menu: menu.map(u.dish),
      })
      this.apply()
    } catch (error) {
      if (token !== this.syncSession() || error.sessionChanged) return
      this.setData({ error: error.message })
    }

    if (!token) return
    await Promise.all(['cart', 'favorites'].map(resource => this.readStudentData(resource, token)))
  },

  /** 异步结果只回写给发起查询的会话，过期令牌对应的餐盘与收藏随即清理。 */
  async readStudentData(resource, token) {
    await u.run(this, async () => {
      const rows = await u.api('/student/' + resource)
      if (token !== this.syncSession()) return
      this.setData({ [resource]: rows })
      this.apply()
    })
    this.syncSession()
  },

  /** 精选、菜单、详情和餐盘共用可售状态与已选份数，金额以当前公开菜价展示。 */
  apply() {
    const { windows, windowIndex, menu, cart, favorites, favoritesOnly, query } = this.data
    const selected = windows[windowIndex] || {}
    const windowClosed = isClosed(selected)
    const windowsById = new Map(windows.map(window => [String(window.id), window]))
    const available = menu.filter(dish => Number(dish.status) === 1)
    const menuById = new Map(available.map(dish => [String(dish.id), dish]))
    const cartDish = cart.map(item => menuById.get(String(item.dishId))).find(Boolean)
    const cartWindowName = windowsById.get(String(cartDish?.windowId))?.name || cartDish?.windowName || ''
    const windowConflict = Boolean(cartDish && selected.id && String(cartDish.windowId) !== String(selected.id))
    const favoriteIds = new Set(favorites.map(String))
    const quantities = new Map(cart.map(item => [String(item.dishId), Number(item.number) || 0]))
    const count = cart.reduce((sum, item) => sum + (Number(item.number) || 0), 0)
    const keyword = query.trim().toLowerCase()
    const grouped = new Map()
    const dishes = new Map()
    const featured = []
    const featuredImages = new Set()

    for (const dish of available) {
      const dishCount = quantities.get(String(dish.id)) || 0
      const stock = Number(dish.stock) || 0
      const tags = String(dish.tags || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean)
      const liked = favoriteIds.has(String(dish.id))
      const otherWindow = Boolean(cartDish && String(dish.windowId) !== String(cartDish.windowId))
      const addBlocked = stock <= 0 ? '已售罄'
        : isClosed(windowsById.get(String(dish.windowId))) ? '窗口暂停预约'
        : otherWindow ? '餐盘已有其他窗口的菜品'
        : dishCount >= stock ? '已达可选库存'
        : count >= ORDER_LIMIT ? '一份预约最多选 20 份' : ''
      const shown = { ...dish, count: dishCount, stock, liked, tagLabel: tags[0] || '', tagList: tags, addBlocked, otherWindow }
      dishes.set(String(dish.id), shown)

      if (String(dish.windowId) !== String(selected.id)) continue
      // 直接展示当前窗口可售菜品，优先呈现不同照片的菜品。
      if (stock > 0 && featured.length < 6 && !featuredImages.has(dish.image)) {
        featured.push(shown)
        featuredImages.add(dish.image)
      }
      const id = String(dish.categoryId ?? 'uncategorized')
      if (!grouped.has(id)) grouped.set(id, { id, name: dish.categoryName || '其他菜品', items: [] })
      const searchable = [dish.name, dish.tags, dish.description].join(' ').toLowerCase()
      if ((!favoritesOnly || liked) && searchable.includes(keyword)) grouped.get(id).items.push(shown)
    }

    const categories = [{ id: 'all', name: '全部' }, ...Array.from(grouped.values(), ({ id, name }) => ({ id, name }))]
    const categoryId = categories.some(category => category.id === String(this.data.categoryId)) ? this.data.categoryId : 'all'
    const groups = Array.from(grouped.values()).filter(group => group.items.length && (categoryId === 'all' || group.id === String(categoryId)))
    const filtered = groups.flatMap(group => group.items)
    let total = 0
    const cartRows = cart.map(line => {
      const dish = dishes.get(String(line.dishId))
      const subtotal = Number(line.number) * Number(dish?.price ?? line.amount)
      total += subtotal
      return {
        id: line.dishId,
        name: dish?.name || line.name,
        image: dish ? dish.image : (line.image ? u.image(line.image) : ''),
        count: Number(line.number),
        subtotal: u.money(subtotal),
        invalid: !dish,
        addBlocked: dish ? dish.addBlocked : '已下架',
      }
    })
    const detailDish = dishes.get(String(this.data.detailDish?.id)) || null
    this.setData({
      selected, windowClosed, categories, categoryId, groups, filtered, featured, detailDish,
      cartRows, cartWindowName, windowConflict, count, total: u.money(total),
    })
    selectTab(this, 0, this.data.cartOpen || Boolean(detailDish))
  },

  /** 切换窗口时保留餐盘，清除上一个窗口的分类选择。 */
  selectWindow(event) {
    const windowIndex = Number(event.detail.value)
    if (!this.data.windows[windowIndex]) return
    this.updateFilters({ windowIndex, categoryId: 'all' })
  },

  search(event) { this.updateFilters({ query: event.detail.value }) },
  clearSearch() { this.updateFilters({ query: '' }) },
  category(event) {
    this.updateFilters({ categoryId: event.currentTarget.dataset.id })
    this.goToMenu()
  },
  favorites() {
    this.updateFilters({ favoritesOnly: !this.data.favoritesOnly, categoryId: 'all' })
    this.goToMenu()
  },

  /** 分类、关键词和收藏可以组合筛选，筛选范围始终是所选窗口。 */
  updateFilters(values) {
    this.setData(values)
    this.apply()
  },

  /** 原生页面滚动到菜单头部后，搜索栏和左侧分类继续可用。 */
  goToMenu() {
    if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ selector: '#menu-start', duration: 180 })
  },

  /** 菜品图片加载失败后统一回退到占位图，餐盘快照同样支持回退。 */
  imageError(event) {
    const id = String(event.currentTarget.dataset.id)
    const menu = this.data.menu.map(dish => String(dish.id) === id ? { ...dish, image: '' } : dish)
    const cart = this.data.cart.map(item => String(item.dishId) === id ? { ...item, image: '' } : item)
    this.setData({ menu, cart })
    this.apply()
  },

  /** 点击菜图或名称可以查看服务端菜品资料和当前餐盘份数。 */
  openDish(event) {
    const id = String(event.currentTarget.dataset.id)
    const dish = this.data.filtered.find(item => String(item.id) === id)
      || this.data.featured.find(item => String(item.id) === id)
    if (!dish) return
    this.setData({ detailDish: dish, cartOpen: false })
    selectTab(this, 0, true)
  },

  openCart() {
    this.setData({ cartOpen: true, detailDish: null })
    selectTab(this, 0, true)
  },

  closeOverlay() {
    if (!this.data.cartOpen && !this.data.detailDish) return
    this.setData({ cartOpen: false, detailDish: null })
    selectTab(this, 0)
  },

  keepOverlayPosition() { /* 遮罩不接受滚动，弹层内的列表独立滚动。 */ },

  /** 每次增减发送一份，库存、窗口和单次份数限制由服务端执行。 */
  change(event) {
    const { id, delta } = event.currentTarget.dataset
    return this.updateStudentData('cart', 'POST', { dishId: id, delta: Number(delta) })
  },

  favorite(event) {
    const { id, liked } = event.currentTarget.dataset
    return this.updateStudentData('favorites', 'PUT', undefined, '/' + id + '?enabled=' + !liked)
  },

  /** 写入后读取对应资源。网络异常时也重新读取，以确认服务端实际保存的结果。 */
  async updateStudentData(resource, method, body, suffix = '') {
    const token = this.syncSession()
    if (this.data.busy || this.data.loading || !u.ensureStudent()) return
    this.setData({ busy: true })
    try {
      await u.run(this, () => u.api('/student/' + resource + suffix, method, body))
      if (token === this.syncSession()) await this.readStudentData(resource, token)
    } finally {
      if (token === this.syncSession()) this.setData({ busy: false })
    }
  },

  /** 预约始终从服务端餐盘重新确定取餐窗口，与当前浏览的窗口无关。 */
  checkout() {
    if (this.data.busy || this.data.loading || !this.data.count || !u.ensureStudent()) return
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  clear() { return this.updateStudentData('cart', 'DELETE') },
})
