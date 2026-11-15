import { reactive } from 'vue'

export const SESSION_STORAGE_KEY = 'hexu.session'
let saved = {}
try {
  saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || '{}') || {}
  // 清理旧学生网页的会话，进入 Web 时使用工作账号重新登录。
  if (saved.account?.role === 'STUDENT') {
    saved = {}
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }
} catch { /* 无效会话按未登录处理。 */ }
export const state = reactive({ token: saved.token || '', account: saved.account || null, windows: [], loginOpen: false, loginRole: 'STAFF', toast: '', toastError: false, orderRevision: 0, orderSocketConnected: false })
let toastTimer

/** 统一同源 API 调用，保留项目 Result 的 code=1 成功规则。 */
export async function api(path, options = {}) {
  // 图片使用 multipart，由浏览器补全 boundary；原有 JSON 请求与鉴权、错误处理保持一致。
  const multipart = options.body instanceof FormData
  const headers = { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }
  const response = await fetch(`/campus${path}`, { ...options, headers: { ...headers, ...options.headers }, body: options.body === undefined ? undefined : multipart ? options.body : JSON.stringify(options.body) })
  let payload
  try { payload = await response.json() } catch { throw new Error('服务暂时不可用，请稍后再试') }
  if (response.status === 401) {
    // 会话失效时回到当前入口对应的工作账号登录。
    const hash = globalThis.location.hash
    const screen = hash.startsWith('#/screen')
    logout(false)
    state.loginRole = screen ? 'SCREEN' : 'STAFF'
    state.loginOpen = screen || hash === '#/admin/login'
    if (!state.loginOpen) globalThis.location.hash = '/admin/login'
  }
  if (!response.ok || payload.code !== 1) throw new Error(payload.msg || payload.message || '操作未完成，请重试')
  return payload.data
}

export function notify(message, error = false) {
  state.toast = message; state.toastError = error
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { state.toast = '' }, 4200)
}

export async function attempt(task) {
  try { return await task() } catch (error) { notify(error.message || '操作失败，请重试', true); return undefined }
}

export function setSession(result) {
  state.token = result.token; state.account = result.account
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(result))
  state.loginOpen = false
  notify(`欢迎回来，${result.account.displayName}`)
}

export function logout(show = true) {
  state.token = ''; state.account = null
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  if (show) notify('已退出当前账号')
}

export const money = value => Number(value || 0).toFixed(2)
export const sameId = (left, right) => String(left) === String(right)
export const statusText = status => ({ 1: '待支付', 2: '等待接单', 3: '正在备餐', 4: '待取餐', 5: '已取餐', 6: '已取消' }[Number(status)] || '处理中')
export const statusClass = status => ({ 1: 'amber', 2: 'blue', 3: 'amber', 4: 'green', 5: 'muted', 6: 'muted' }[Number(status)] || '')
export function dateString(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
