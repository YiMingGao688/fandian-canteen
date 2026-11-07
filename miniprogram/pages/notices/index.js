const u = require('../../utils/api')
const selectTab = require('../../utils/tab-bar')
Page({
  data: { notices: [], windows: [], feedback: [], windowIndex: 0, content: '', busy: false, logged: false },
  onShow() {
    selectTab(this, 2)
    this.load()
  },
  onPullDownRefresh() { this.load() },
  async load() { await u.run(this, async () => { const [notices, windows] = await Promise.all([u.api('/public/notices'), u.api('/public/windows')]); this.setData({ notices, windows, logged: !!u.session().token, feedback: [] }); if (u.session().token) this.setData({ feedback: await u.api('/student/feedback') }) }) },
  window(e) { this.setData({ windowIndex: Number(e.detail.value) }) },
  content(e) { this.setData({ content: e.detail.value }) },
  async submit() {
    if (this.data.busy || !u.ensureStudent()) return
    if (!this.data.content.trim() || !this.data.windows[this.data.windowIndex]) return u.toast('请选择窗口并填写反馈内容')
    this.setData({ busy: true })
    await u.run(this, async () => { await u.api('/student/feedback', 'POST', { windowId: this.data.windows[this.data.windowIndex].id, content: this.data.content }); this.setData({ content: '' }); u.toast('反馈已送达对应窗口'); await this.load() })
    this.setData({ busy: false })
  }
})
