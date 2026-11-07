<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowUpRight, X, LogOut, UserRound, Check, LoaderCircle, LayoutDashboard, ChevronRight, ChevronDown } from '@lucide/vue'
import BrandLogo from './components/BrandLogo.vue'
import { state, api, attempt, setSession, logout, notify, SESSION_STORAGE_KEY } from './state'
import './admin-layout.css'

const route = useRoute(), router = useRouter()
const isScreen = computed(() => route.path === '/screen')
const isAdmin = computed(() => route.path === '/admin')
const isAdminLogin = computed(() => route.path === '/admin/login')
const busy = ref(false)
const form = reactive({ username: '', password: '' })
const isScreenLogin = computed(() => state.loginRole === 'SCREEN')
const demoUsername = computed(() => isScreenLogin.value ? 'canteen_screen' : 'canteen_admin')
watch(() => route.path, path => {
  document.title = path === '/screen' ? '饭点 · 运营数据大屏' : path === '/admin/login' ? '饭点 · 管理员登录' : '饭点 · 食堂管理后台'
}, { immediate: true })
watch(() => state.account?.userId, userId => {
  if (route.path === '/admin' && !userId) {
    state.loginRole = 'STAFF'
    router.replace('/admin/login')
  }
})
function logoutAdmin() {
  logout()
  state.loginRole = 'STAFF'
}
function openAdminScreen() {
  const session = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!session) {
    state.loginRole = 'STAFF'
    router.push('/admin/login')
    return
  }
  const screenTab = window.open('about:blank', '_blank')
  if (!screenTab) {
    notify('浏览器拦截了新标签页，请允许弹窗后重试', true)
    return
  }
  try {
    screenTab.sessionStorage.setItem(SESSION_STORAGE_KEY, session)
    screenTab.opener = null
    screenTab.location.replace(`${window.location.origin}/#/screen`)
  } catch {
    screenTab.close()
    notify('无法打开运营大屏，请重新登录后重试', true)
  }
}
/** Web 登录只保存工作账号会话，并按账号角色打开管理后台或大屏。 */
async function submitLogin() {
  if (busy.value) return
  busy.value = true
  await attempt(async () => {
    const result = await api('/auth/login', { method: 'POST', body: form })
    const role = result.account.role
    if (!['STAFF', 'ADMIN', 'SCREEN'].includes(role)) throw new Error('学生点餐请使用微信小程序')
    setSession(result)
    await router.push(role === 'SCREEN' ? '/screen' : '/admin')
  })
  busy.value = false
}
function demoLogin() {
  form.username = demoUsername.value
  form.password = 'Campus@2026'
  submitLogin()
}
onMounted(() => attempt(async () => {
  // 订单筛选和经营报表仍使用公开窗口目录，大屏复核已保存的账号。
  state.windows = await api('/public/windows')
  if (state.token && isScreen.value) state.account = await api('/me')
}))
</script>

<template>
  <header v-if="isAdmin" class="site-header">
    <div class="header-inner admin-header-inner">
      <RouterLink to="/admin" class="brand" aria-label="饭点食堂管理"><BrandLogo /></RouterLink>
      <div id="admin-module-navigation"></div>
      <div class="admin-header-actions">
        <div id="admin-header-tools"></div>
        <details class="admin-header-account">
          <summary><span class="avatar" aria-hidden="true"><UserRound :size="20" :stroke-width="1.6" /></span><span><b>{{ state.account?.displayName }}</b><small>{{ state.account?.username }}</small></span><ChevronDown :size="13" /></summary>
          <div class="admin-account-popover"><small>{{ state.account?.role === 'ADMIN' ? '系统管理员' : '窗口工作人员' }}</small><a href="/#/screen" class="admin-screen-link" @click.prevent="openAdminScreen"><LayoutDashboard :size="16" />运营数据大屏<ArrowUpRight :size="13" /></a><button class="admin-logout" title="退出登录" @click="logoutAdmin"><LogOut :size="15" />退出登录</button></div>
        </details>
      </div>
    </div>
  </header>
  <main :class="{'screen-stage':isScreen,'admin-login-stage':isAdminLogin}">
    <RouterView :key="route.path" />
  </main>
  <Transition name="toast"><div v-if="state.toast" class="toast" :class="{ error: state.toastError }" role="status"><component :is="state.toastError ? X : Check" :size="17" />{{ state.toast }}</div></Transition>
  <div v-if="state.loginOpen" class="modal-backdrop" :class="{'admin-login-backdrop':isAdminLogin}" @click.self="!isAdminLogin && (state.loginOpen = false)">
    <section class="modal login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <button v-if="!isAdminLogin" class="icon-button modal-close" aria-label="关闭登录" @click="state.loginOpen = false"><X :size="20" /></button>
      <BrandLogo />
      <p class="eyebrow">{{ isScreenLogin ? '饭点 · 运营数据大屏' : '饭点 · 管理工作台' }}</p>
      <h2 id="login-title">{{ isScreenLogin ? '登录校园数据大屏。' : '管理员登录' }}</h2>
      <p class="muted">{{ isScreenLogin ? '使用管理员或大屏展示账号登录，查看食堂运营数据。' : '使用管理员或窗口账号登录，进入经营概览。' }}</p>
      <form @submit.prevent="submitLogin">
        <label>管理或展示账号<input v-model="form.username" autocomplete="username" required placeholder="请输入管理或展示账号" maxlength="24" /></label>
        <label>密码<input v-model="form.password" autocomplete="current-password" type="password" required minlength="8" maxlength="64" placeholder="请输入至少 8 位密码" /></label>
        <button class="button button-primary full" :disabled="busy" type="submit"><LoaderCircle v-if="busy" class="spin" :size="17" />登录饭点<ArrowUpRight :size="16" /></button>
      </form>
      <div class="demo-login">
        <p>本地演示账号</p>
        <button class="button button-soft full" :disabled="busy" @click="demoLogin">使用{{ isScreenLogin ? '大屏展示' : '管理' }}体验账号<ChevronRight :size="16" /></button>
        <small>{{ demoUsername }} / Campus@2026</small>
      </div>
    </section>
  </div>
</template>
