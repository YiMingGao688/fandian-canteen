const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { account: null, settings: false, server: '', saving: false, settingsError: '', connectionIssue: '', simulator: false },
  onShow() {
    selectTab(this, 3)
    this.setData({ server: u.server(), simulator: u.isSimulator(), settingsError: '' })
    return this.refresh()
  },

  /** 账号复核失败时保留已登录身份，并在页面内提供连接恢复入口。 */
  async refresh() {
    const session = u.session()
    this.setData({ account: session.account || null })
    try {
      if (session.token) {
        const account = await u.api('/me')
        if (session.token === u.session().token) u.saveSession({ ...session, account })
      } else {
        await u.api('/public/windows')
      }
      this.setData({ connectionIssue: '' })
    } catch (error) {
      if (error.sessionChanged) return
      this.setData({ connectionIssue: error.uncertain ? error.message : '' })
    } finally {
      this.setData({ account: u.session().account || null })
    }
  },
  onPullDownRefresh() { return this.refresh().finally(() => wx.stopPullDownRefresh()) },
  login() { wx.navigateTo({ url: '/pages/login/index' }) },
  orders() { wx.switchTab({ url: '/pages/orders/index' }) },
  favorites() { wx.setStorageSync('hexu.mini.favorites', true); wx.switchTab({ url: '/pages/home/index' }) },
  feedback() { wx.switchTab({ url: '/pages/notices/index' }) },
  logout() { u.logout(); this.setData({ account: null }); u.toast('已退出登录') },
  settings() {
    if (!this.data.saving) this.setData({ settings: !this.data.settings, server: u.server(), settingsError: '' })
  },
  server(e) { this.setData({ server: e.detail.value, settingsError: '' }) },
  /** 成功后再切换服务器；检查失败时保留输入，便于直接修正。 */
  async saveServer() {
    if (this.data.saving) return
    this.setData({ saving: true, settingsError: '' })
    try {
      await u.setServer(this.data.server)
      this.setData({ account: u.session().account || null, server: u.server(), settings: false, connectionIssue: '' })
      u.toast('已连接饭点服务')
    } catch (error) {
      this.setData({ settingsError: error.message })
    } finally {
      this.setData({ saving: false })
    }
  },
})
