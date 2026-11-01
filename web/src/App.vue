<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Leaf, ShoppingBag, ArrowUpRight, X, LogOut, UserRound, Check, LoaderCircle, LayoutDashboard, Menu, ChevronRight, Utensils, ClipboardList, Bell, MapPin } from '@lucide/vue'
import { state, cartCount, api, attempt, setSession, logout, notify, refreshMenu, refreshStudent, SESSION_STORAGE_KEY } from './state'
import './admin-layout.css'

const route = useRoute(), router = useRouter()
const isMobile = computed(() => route.path.startsWith('/m'))
const isScreen = computed(() => route.path === '/screen')
const isAdmin = computed(() => route.path === '/admin')
const isAdminLogin = computed(() => route.path === '/admin/login')
const registering = ref(false), busy = ref(false), mobileMenu = ref(false)
const form = reactive({ username: '', password: '', displayName: '' })
const title = computed(() => registering.value ? '一起，好好吃饭。' : state.loginRole === 'SCREEN' ? '登录校园数据大屏。' : state.loginRole === 'STAFF' ? '管理员登录' : '欢迎回到禾序。')
const loginDescription = computed(() => isAdminLogin.value ? '使用管理员或窗口账号登录，进入经营概览。' : registering.value ? '用学号注册，开启从容的校园就餐。' : '一份提前安排好的饭，留给下课的自己。')
function openLogin(role = isMobile.value ? 'STUDENT' : isScreen.value ? 'SCREEN' : 'STAFF') { registering.value = false; state.loginRole = role; state.loginOpen = true; mobileMenu.value = false }
watch(() => route.path, path => {
  document.title = path.startsWith('/m') ? '禾序饭堂 · 手机点餐' : path === '/screen' ? '禾序饭堂 · 运营数据大屏' : path === '/admin/login' ? '禾序饭堂 · 管理员登录' : '禾序饭堂 · 食堂管理后台'
  if (registering.value && state.loginRole !== 'STUDENT') registering.value = false
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
async function submitLogin() {
  if (busy.value) return
  busy.value = true
  await attempt(async () => {
    const result = await api(registering.value ? '/auth/register' : '/auth/login', { method: 'POST', body: form })
    await setSession(result)
    if (['STAFF','ADMIN'].includes(result.account.role)) router.push('/admin')
    else if (result.account.role === 'SCREEN') router.push('/screen')
    else if (!isMobile.value) router.push('/m')
  })
  busy.value = false
}
function demoLogin() {
  registering.value = false
  form.username = state.loginRole === 'SCREEN' ? 'canteen_screen' : state.loginRole === 'STAFF' ? 'canteen_admin' : '20260001'
  form.password = 'Campus@2026'; submitLogin()
}
onMounted(() => attempt(async () => {
  await refreshMenu()
  if (state.token && !route.path.startsWith('/admin')) { state.account = await api('/me'); await refreshStudent() }
}))
</script>

<template>
  <header v-if="!isMobile && !isScreen && !isAdminLogin" class="site-header">
    <div v-if="isAdmin" class="header-inner admin-header-inner">
      <RouterLink to="/admin" class="brand" aria-label="禾序食堂管理"><span class="brand-mark"><Leaf :size="25" :stroke-width="1.7" /></span><span><b>禾序食堂管理</b><small>HEXU · ADMINISTRATION</small></span></RouterLink>
      <a href="/#/screen" class="admin-screen-link" @click.prevent="openAdminScreen"><LayoutDashboard :size="17" />运营数据大屏<ArrowUpRight :size="13" /></a>
      <div class="admin-header-account"><span class="avatar">{{ state.account?.displayName?.slice(0, 1) }}</span><span><b>{{ state.account?.displayName }}</b><small>{{ state.account?.username }} · {{ state.account?.role === 'ADMIN' ? '系统管理员' : '窗口工作人员' }}</small></span><button class="admin-logout" title="退出登录" @click="logoutAdmin"><LogOut :size="15" /><span>退出登录</span></button></div>
    </div>
    <div v-else class="header-inner">
      <RouterLink to="/admin" class="brand" aria-label="禾序饭堂首页"><span class="brand-mark"><Leaf :size="25" :stroke-width="1.7" /></span><span><b>禾序食堂管理</b><small>HEXU · ADMINISTRATION</small></span></RouterLink>
      <nav class="desktop-nav" aria-label="主导航"><RouterLink to="/admin">食堂管理</RouterLink><RouterLink to="/screen" target="_blank" rel="noopener">运营数据大屏<ArrowUpRight :size="12" /></RouterLink><RouterLink to="/m" target="_blank" rel="noopener">手机端预览<ArrowUpRight :size="12" /></RouterLink></nav>
      <div class="header-actions"><span class="demo-pill"><i />演示环境</span><span class="header-divider" />
        <button v-if="!state.account" class="button button-primary login-header" @click="openLogin()">登录 / 注册<ChevronRight :size="15" /></button>
        <details v-else class="account-menu"><summary><span class="avatar">{{ state.account.displayName?.slice(0, 1) }}</span><span>{{ state.account.displayName?.split(' · ')[0] }}</span></summary><div class="account-popover"><small>{{ state.account.username }} · {{ state.account.role === 'ADMIN' ? '系统管理员' : state.account.role === 'SCREEN' ? '大屏展示账号' : state.account.role === 'STAFF' ? '窗口工作人员' : '学生账号' }}</small><button @click="logout()"><LogOut :size="15" />退出登录</button><button @click="openLogin()"><UserRound :size="15" />切换当前入口账号</button></div></details>
        <button class="icon-button mobile-toggle" aria-label="展开导航" @click="mobileMenu = !mobileMenu"><Menu :size="22" /></button>
      </div>
    </div>
    <nav v-if="mobileMenu && !isAdmin" class="mobile-nav"><RouterLink v-for="item in [{path:'/m',label:'手机点餐'},{path:'/admin',label:'食堂管理'},{path:'/screen',label:'运营大屏'}]" :key="item.path" :to="item.path" @click="mobileMenu = false">{{ item.label }}</RouterLink></nav>
  </header>
  <main :class="{'mobile-stage':isMobile,'screen-stage':isScreen,'admin-login-stage':isAdminLogin}">
    <RouterView v-if="isAdminLogin" :key="route.path" />
    <div v-if="isMobile" class="mobile-surface">
      <header class="phone-header"><RouterLink to="/m" class="phone-brand"><Leaf :size="21" /><b>禾序饭堂</b></RouterLink><span class="phone-location"><MapPin :size="12" />校园食堂</span><RouterLink v-if="state.account?.role==='STUDENT'" to="/m/profile" class="phone-avatar">{{ state.account.displayName.slice(0,1) }}</RouterLink><button v-else class="phone-login" @click="openLogin('STUDENT')"><UserRound :size="19" /></button></header>
      <RouterView :key="route.path" />
      <nav class="phone-bottom-nav" aria-label="手机端导航"><RouterLink to="/m"><Utensils :size="21" /><span>点餐</span></RouterLink><RouterLink to="/m/orders"><ClipboardList :size="21" /><span>预约</span></RouterLink><RouterLink to="/m/notices"><Bell :size="21" /><span>公告</span></RouterLink><RouterLink to="/m/profile"><UserRound :size="21" /><span>我的</span></RouterLink></nav>
    </div>
    <RouterView v-else-if="!isAdminLogin" :key="route.path" />
  </main>
  <footer v-if="!isMobile && !isScreen && !isAdmin && !isAdminLogin" class="site-footer"><div><Leaf :size="17" /><b>禾序饭堂</b><span>校园食堂运营管理</span></div><p>手机点餐 · Web 管理 · 运营大屏<span>本地演示数据 · 演示支付不扣款</span></p></footer>
  <Transition name="toast"><div v-if="state.toast" class="toast" :class="{ error: state.toastError }" role="status"><component :is="state.toastError ? X : Check" :size="17" />{{ state.toast }}</div></Transition>
  <div v-if="state.loginOpen" class="modal-backdrop" :class="{'admin-login-backdrop':isAdminLogin}" @click.self="!isAdminLogin && (state.loginOpen = false)">
    <section class="modal login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><button v-if="!isAdminLogin" class="icon-button modal-close" aria-label="关闭登录" @click="state.loginOpen = false"><X :size="20" /></button><span class="brand-mark"><Leaf :size="25" /></span><p class="eyebrow">{{ isAdminLogin ? 'HEXU · ADMINISTRATION' : 'A GOOD MEAL STARTS HERE' }}</p><h2 id="login-title">{{ title }}</h2><p class="muted">{{ loginDescription }}</p>
      
      <form @submit.prevent="submitLogin"><label>{{ state.loginRole === 'STUDENT' || registering ? '学号' : '管理或展示账号' }}<input v-model="form.username" autocomplete="username" required :placeholder="state.loginRole === 'STUDENT' || registering ? '请输入 8 至 16 位学号' : '请输入管理或展示账号'" maxlength="24" /></label><label v-if="registering">怎么称呼你<input v-model="form.displayName" placeholder="例如：林同学" required minlength="2" maxlength="24" /></label><label>密码<input v-model="form.password" autocomplete="current-password" type="password" required minlength="8" maxlength="64" placeholder="请输入至少 8 位密码" /></label><button class="button button-primary full" :disabled="busy" type="submit"><LoaderCircle v-if="busy" class="spin" :size="17" />{{ registering ? '注册并开启就餐' : '登录禾序' }}<ArrowUpRight :size="16" /></button></form>
      <button v-if="state.loginRole === 'STUDENT'" class="text-button register-switch" @click="registering = !registering; state.loginRole = 'STUDENT'">{{ registering ? '已有账号？返回登录' : '第一次来？用学号注册' }}</button><div class="demo-login"><p>本地体验，无需真实学生信息</p><button class="button button-soft full" :disabled="busy" @click="demoLogin">使用{{ state.loginRole === 'SCREEN' ? '大屏展示' : state.loginRole === 'STAFF' ? '管理' : '学生' }}体验账号<ChevronRight :size="16" /></button><small>{{ state.loginRole === 'SCREEN' ? 'canteen_screen' : state.loginRole === 'STAFF' ? 'canteen_admin' : '20260001' }} / Campus@2026</small></div>
    </section>
  </div>
</template>
