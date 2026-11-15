const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { notices: [], windows: [], feedback: [], windowIndex: 0, content: '', busy: false },
  onShow() {
    selectTab(this, 2)
    this.load()
  },
  onPullDownRefresh() { this.load() },
  /** 进入页面时按当前账号隔离反馈和草稿。 */
  syncSession() {
    const token = u.session().token
    if (token !== this.token) {
      const content = this.token ? '' : this.data.content
      this.token = token
      this.setData({ feedback: [], content, busy: false })
    }
    return token
  },
  async load() {
    const token = this.syncSession()
    const revision = this.revision = (this.revision || 0) + 1
    await u.run(this, async () => {
      const [notices, windows] = await Promise.all([u.api('/public/notices'), u.api('/public/windows')])
      if (revision !== this.revision) return
      this.setData({ notices, windows })
      if (!token || token !== this.syncSession()) return
      const feedback = await u.api('/student/feedback')
      if (revision === this.revision && token === this.syncSession()) this.setData({ feedback })
    })
    this.syncSession()
  },
  window(e) { this.setData({ windowIndex: Number(e.detail.value) }) },
  content(e) { this.setData({ content: e.detail.value }) },
  async submit() {
    const token = this.syncSession()
    if (this.data.busy || !u.ensureStudent()) return
    if (!this.data.content.trim() || !this.data.windows[this.data.windowIndex]) return u.toast('请选择窗口并填写反馈内容')
    this.setData({ busy: true })
    await u.run(this, async () => {
      await u.api('/student/feedback', 'POST', { windowId: this.data.windows[this.data.windowIndex].id, content: this.data.content })
      if (token !== this.syncSession()) return
      this.setData({ content: '' })
      u.toast('反馈已送达对应窗口')
      await this.load()
    })
    if (token === this.syncSession()) this.setData({ busy: false })
  }
})
