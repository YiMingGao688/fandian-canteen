const u = require('../../utils/api')
Page({
  data: { registering: false, username: '', password: '', displayName: '', busy: false },
  input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  toggle() { this.setData({ registering: !this.data.registering }) },
  async submit() {
    if (this.data.busy) return
    if (!this.data.username.trim() || this.data.password.length < 8) return u.toast('请输入学号和至少 8 位密码')
    this.setData({ busy: true })
    await u.run(this, async () => {
      const result = await u.api(this.data.registering ? '/auth/register' : '/auth/login', 'POST', { username: this.data.username.trim(), password: this.data.password, displayName: this.data.displayName.trim() })
      if (result.account.role !== 'STUDENT') throw new Error('小程序仅供学生使用，请使用学生账号')
      u.saveSession(result); this.setData({ password: '' }); wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/home/index' }) } })
    })
    this.setData({ busy: false })
  }
})
