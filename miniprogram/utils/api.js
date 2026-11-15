const config = require('./config')
const SESSION_KEY = 'hexu.mini.session'
const BASE_KEY = 'hexu.mini.server'

/** 开发者工具和真机分别使用各自的默认地址与本地覆盖值。 */
function isSimulator() {
  let platform = 'devtools'
  try { platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform } catch (_) { /* 模拟环境沿用电脑接口地址。 */ }
  return platform === 'devtools'
}
function server() {
  return isSimulator() ? wx.getStorageSync(BASE_KEY + '.devtools') || config.simulatorServer
    : wx.getStorageSync(BASE_KEY) || config.previewServer || config.simulatorServer
}
function session() { return wx.getStorageSync(SESSION_KEY) || {} }
function logout() { wx.removeStorageSync(SESSION_KEY) }
function saveSession(value) { wx.setStorageSync(SESSION_KEY, value) }
function normalizeServer(value) {
  const base = String(value || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/?#]+$/.test(base)) throw new Error('请输入完整的 http(s)://主机:端口，不包含路径')
  return base
}

/** 验证候选地址后再保存。连接失败时当前地址和登录状态仍可使用。 */
async function setServer(value) {
  const base = normalizeServer(value)
  const previous = server()
  const windows = await api('/public/windows', 'GET', undefined, base)
  if (!Array.isArray(windows)) throw new Error('此地址没有返回饭点的窗口列表')
  if (previous !== server()) throw new Error('服务器地址已变化，请重新检查')
  wx.setStorageSync(isSimulator() ? BASE_KEY + '.devtools' : BASE_KEY, base)
  if (base !== previous) logout()
}

/** 使用现有校园 JWT 与 Result 协议，过时的响应不能写入当前会话。 */
function api(path, method = 'GET', data, probeServer) {
  const activeServer = server()
  const base = probeServer || activeServer
  const authenticated = !probeServer && !path.startsWith('/public/') && !path.startsWith('/auth/')
  const token = authenticated ? session().token : null
  const current = () => activeServer === server() && (!authenticated || token === session().token)
  const changed = () => Object.assign(new Error('账号或服务器已切换，请重试'), { sessionChanged: true })
  return new Promise((resolve, reject) => {
    wx.request({ url: `${base}/campus${path}`, method, data, timeout: 15000,
      header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      success(response) {
        if (!current()) return reject(changed())
        if (response.statusCode === 401) {
          if (token) logout()
          return reject(new Error('登录已失效，请重新登录'))
        }
        const { statusCode, data: result } = response
        const ok = statusCode >= 200 && statusCode < 300
        if (ok && result?.code === 1) return resolve(result.data)
        const error = new Error(result?.msg || '服务暂不可用')
        // 预约收到 Result 业务拒绝即可重新编辑，超时或服务异常需要先确认原请求。
        error.uncertain = statusCode === 408 || statusCode >= 500 || (ok && result?.code !== 0)
        reject(error)
      },
      fail() {
        if (!current()) return reject(changed())
        const connectionMessage = base === config.simulatorServer && isSimulator()
          ? '本机服务未连接，请启动饭点后重试'
          : '无法连接服务器，请检查地址和网络'
        reject(Object.assign(new Error(connectionMessage), { uncertain: true }))
      },
    })
  })
}
function toast(title) { wx.showToast({ title: String(title), icon: 'none', duration: 2500 }) }
async function run(page, task) {
  try { return await task() } catch (error) { if (!error.sessionChanged) toast(error.message); return null }
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
module.exports = { api, server, setServer, isSimulator, session, saveSession, logout, toast, run, ensureStudent, requestId, date, money, image, dish, order, statuses }
