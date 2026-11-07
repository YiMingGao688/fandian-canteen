const config = require('./config')
const SESSION_KEY = 'hexu.mini.session'
const BASE_KEY = 'hexu.mini.server'

function server() {
  const saved = wx.getStorageSync(BASE_KEY)
  if (saved) return saved
  let platform = 'devtools'
  try { platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform } catch (_) { /* 模拟环境沿用电脑接口地址。 */ }
  return platform === 'devtools' ? config.simulatorServer : config.previewServer || config.simulatorServer
}
function session() { return wx.getStorageSync(SESSION_KEY) || {} }
function logout() { wx.removeStorageSync(SESSION_KEY) }
function saveSession(value) { wx.setStorageSync(SESSION_KEY, value) }
function setServer(value) {
  const base = String(value || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/?#]+$/.test(base)) throw new Error('请输入完整的 http(s)://主机:端口，不包含路径')
  if (base !== server()) logout()
  wx.setStorageSync(BASE_KEY, base)
}

/** 使用现有校园 JWT 与 Result 协议；令牌仅发送给用户设置的当前服务器。 */
function api(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.request({ url: `${server()}/campus${path}`, method, data, timeout: 15000,
      header: { 'Content-Type': 'application/json', ...(session().token ? { Authorization: `Bearer ${session().token}` } : {}) },
      success(response) {
        if (response.statusCode === 401) { logout(); reject(new Error('登录已失效，请重新登录')); return }
        if (response.statusCode < 200 || response.statusCode >= 300 || !response.data || response.data.code !== 1) {
          reject(new Error(response.data && response.data.msg || '服务暂不可用')); return
        }
        resolve(response.data.data)
      }, fail() { reject(new Error('连接失败，请在“我的”检查服务器地址和网络')) }
    })
  })
}
function toast(title) { wx.showToast({ title: String(title), icon: 'none', duration: 2500 }) }
async function run(page, task) {
  try { return await task() } catch (error) { toast(error.message); return null }
  finally { wx.stopPullDownRefresh() }
}
function ensureStudent() {
  if (session().token && session().account && session().account.role === 'STUDENT') return true
  wx.navigateTo({ url: '/pages/login/index' }); return false
}
/** 编号只用于预约幂等；同一次提交重试必须沿用原值。 */
function requestId() { return `mini-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
function date(offset = 0) {
  const now = new Date(Date.now() + 8 * 3600000 + offset * 86400000)
  return now.toISOString().slice(0, 10)
}
function money(value) { return Number(value || 0).toFixed(2) }
function image(value) {
  const match = String(value || '').match(/\/images\/(hero|beef|chicken|noodles|orange|rice|salad|soup)\.jpg$/)
  if (match) return `/assets/images/${match[1]}.jpg`
  return /^https?:\/\//.test(value || '') ? value : `${server()}${value || '/images/rice.jpg'}`
}
function dish(value) { return { ...value, image: image(value.image), priceText: money(value.price) } }
const statuses = ['全部预约', '待支付', '待接单', '备餐中', '待取餐', '已完成', '已取消']
function order(value) {
  // 列表筛选和按钮显示共用数字状态，兼容返回字符串的接口数据。
  const status = Number(value.status)
  return { ...value, status, statusText: statuses[status], amountText: money(value.amount), items: (value.items || []).map(item => ({ ...item, image: image(item.image) })) }
}
module.exports = { api, server, setServer, session, saveSession, logout, toast, run, ensureStudent, requestId, date, money, image, dish, order, statuses }
