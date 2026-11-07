const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { account: null, settings: false, server: '', saving: false },
  async onShow() {
    selectTab(this, 3)
    this.setData({ account: u.session().account || null, server: u.server() })
    if (u.session().token) await u.run(this, async () => { const account = await u.api('/me'); u.saveSession({ ...u.session(), account }); this.setData({ account }) })
    this.setData({ account: u.session().account || null })
  },
  onPullDownRefresh() { this.onShow().finally(() => wx.stopPullDownRefresh()) },
  login() { wx.navigateTo({ url: '/pages/login/index' }) },
  orders() { wx.switchTab({ url: '/pages/orders/index' }) },
  favorites() { wx.setStorageSync('hexu.mini.favorites', true); wx.switchTab({ url: '/pages/home/index' }) },
  feedback() { wx.switchTab({ url: '/pages/notices/index' }) },
  logout() { u.logout(); this.setData({ account: null }); u.toast('已退出登录') },
  settings() { this.setData({ settings: !this.data.settings, server: u.server() }) },
  server(e) { this.setData({ server: e.detail.value }) },
  async saveServer() {
    if (this.data.saving) return
    this.setData({ saving: true })
    await u.run(this, async () => { u.setServer(this.data.server); this.setData({ account: u.session().account || null }); await u.api('/public/windows'); u.toast('服务器连接正常'); this.setData({ settings: false }) })
    this.setData({ saving: false })
  }
})
