import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { state, api } from './state'
import './style.css'
const Workbench = () => import('./pages/Workbench.vue')
const AdminLogin = () => import('./pages/AdminLogin.vue')
const Screen = () => import('./pages/Screen.vue')
let managerValidationFailed = false

// Web 统一进入食堂管理，旧书签或未匹配的地址也走管理端的身份校验。
const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', redirect: '/admin' },
  { path: '/admin', component: Workbench }, { path: '/admin/login', component: AdminLogin }, { path: '/screen', component: Screen },
  { path: '/workbench', redirect: '/admin' },
  { path: '/:pathMatch(.*)*', redirect: '/admin' },
], scrollBehavior: () => ({ top: 0 }) })

/** 管理端进入前向服务端复核角色；无效会话统一落到管理登录页。 */
router.beforeEach(async to => {
  const isManager = account => ['ADMIN', 'STAFF'].includes(account?.role)
  if (to.path === '/admin/login') {
    if (state.token && isManager(state.account) && !managerValidationFailed) return '/admin'
    managerValidationFailed = false
    state.loginRole = 'STAFF'
    state.loginOpen = true
    return true
  }
  if (to.path === '/admin') {
    if (!state.token || (state.account && !isManager(state.account))) {
      state.loginRole = 'STAFF'
      state.loginOpen = true
      return '/admin/login'
    }
    try {
      state.account = await api('/me')
      if (isManager(state.account)) { managerValidationFailed = false; return true }
    } catch { /* 服务端暂不可用或会话失效时转到登录页，避免路由来回重定向。 */ }
    managerValidationFailed = true
    state.loginRole = 'STAFF'
    state.loginOpen = true
    return '/admin/login'
  }
})

createApp(App).use(router).mount('#app')
