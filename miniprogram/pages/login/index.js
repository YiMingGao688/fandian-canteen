const u = require('../../utils/api')
Page({
  data: { registering: false, username: '', password: '', displayName: '', passwordVisible: false, focusField: '', errorField: '', error: '', busy: false },
  input(e) {
    const { field } = e.currentTarget.dataset
    const values = { [field]: e.detail.value }
    if (!this.data.errorField || this.data.errorField === field) Object.assign(values, { error: '', errorField: '' })
    this.setData(values)
  },
  focus(e) { this.setData({ focusField: e.currentTarget.dataset.field }) },
  blur(e) {
    if (this.data.focusField === e.currentTarget.dataset.field) this.setData({ focusField: '' })
  },
  nextField(e) {
    this.setData({ focusField: this.data.registering && e.currentTarget.dataset.field === 'username' ? 'displayName' : 'password' })
  },
  togglePassword() { this.setData({ passwordVisible: !this.data.passwordVisible }) },
  /** 注册与登录共用页面，切换时同步微信导航栏并清除上一次的密码和提示。 */
  toggle() {
    if (this.data.busy) return
    const registering = !this.data.registering
    this.setData({ registering, password: '', passwordVisible: false, focusField: '', errorField: '', error: '' })
    wx.setNavigationBarTitle({ title: registering ? '学生注册' : '学生登录' })
    wx.setNavigationBarColor({
      frontColor: registering ? '#000000' : '#ffffff',
      backgroundColor: registering ? '#f3f5f2' : '#111310',
    })
  },

  /** 按服务端规则验证学生注册资料，错误在表单内显示。 */
  async submit() {
    const { registering, password, busy } = this.data
    if (busy) return
    const username = this.data.username.trim()
    const displayName = this.data.displayName.trim()
    if (registering && !/^[0-9]{8,16}$/.test(username)) return this.setData({ errorField: 'username', error: '请输入 8 至 16 位数字学号' })
    if (!username) return this.setData({ errorField: 'username', error: '请输入学号' })
    if (registering && (displayName.length < 2 || displayName.length > 24)) return this.setData({ errorField: 'displayName', error: '请输入 2 至 24 字的称呼' })
    if (password.length < 8 || password.length > 64) return this.setData({ errorField: 'password', error: '请输入 8 至 64 位密码' })
    this.setData({ busy: true, errorField: '', error: '' })
    try {
      const result = await u.api(registering ? '/auth/register' : '/auth/login', 'POST', { username, password, displayName })
      if (result.account.role !== 'STUDENT') throw new Error('小程序仅供学生使用，请使用学生账号')
      u.saveSession(result)
      this.setData({ password: '', passwordVisible: false })
      wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/home/index' }) } })
    } catch (error) {
      this.setData({ error: error.message })
    } finally {
      this.setData({ busy: false })
    }
  },
})
