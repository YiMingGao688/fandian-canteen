import { reactive, computed } from 'vue'

export const SESSION_STORAGE_KEY = 'hexu.session'
let saved = {}
try { saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || '{}') } catch { /* 无效会话按未登录处理。 */ }
export const state = reactive({ token: saved.token || '', account: saved.account || null, cart: [], favorites: [], windows: [], menu: [], loginOpen: false, loginRole: 'STUDENT', toast: '', toastError: false })
export const cartCount = computed(() => state.cart.reduce((sum, row) => sum + Number(row.number), 0))
export const cartTotal = computed(() => state.cart.reduce((sum, row) => sum + Number(row.number) * Number(row.amount), 0))
let toastTimer

/** 生成订单幂等请求编号；兼容手机通过局域网 HTTP 打开时没有 randomUUID 的浏览器。 */
export function createRequestId() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === 'function') cryptoApi.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 统一同源 API 调用，保留项目 Result 的 code=1 成功规则。 */
export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }
  const response = await fetch(`/campus${path}`, { ...options, headers: { ...headers, ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  let payload
  try { payload = await response.json() } catch { throw new Error('服务暂时不可用，请稍后再试') }
  if (response.status === 401) { logout(false); state.loginOpen = true }
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

export async function setSession(result) {
  state.token = result.token; state.account = result.account
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(result))
  state.loginOpen = false
  if (result.account.role === 'STUDENT') await refreshStudent()
  else { state.cart = []; state.favorites = [] }
  notify(`欢迎回来，${result.account.displayName}`)
}

export function logout(show = true) {
  state.token = ''; state.account = null; state.cart = []; state.favorites = []
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  if (show) notify('已退出当前账号')
}

export function requireStudent() {
  if (!state.account) { state.loginRole = 'STUDENT'; state.loginOpen = true; return false }
  if (state.account.role !== 'STUDENT') { notify('当前是窗口工作账号，请切换学生账号后选餐', true); return false }
  return true
}

export async function refreshStudent() {
  if (state.account?.role !== 'STUDENT') return
  const [cart, favorites] = await Promise.all([api('/student/cart'), api('/student/favorites')])
  state.cart = cart; state.favorites = favorites
}

export async function refreshMenu() {
  const [windows, menu] = await Promise.all([api('/public/windows'), api('/public/menu')])
  state.windows = windows; state.menu = menu
}

export const money = value => Number(value || 0).toFixed(2)
export const sameId = (left, right) => String(left) === String(right)
export const statusText = status => ({ 1: '待支付', 2: '等待接单', 3: '正在备餐', 4: '待取餐', 5: '已取餐', 6: '已取消' }[Number(status)] || '处理中')
export const statusClass = status => ({ 1: 'amber', 2: 'blue', 3: 'amber', 4: 'green', 5: 'muted', 6: 'muted' }[Number(status)] || '')
export function dateString(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
