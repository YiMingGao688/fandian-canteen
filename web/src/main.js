import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { state, api } from './state'
import './style.css'
import './three-entries.css'
import MobileHome from './pages/MobileHome.vue'
import Orders from './pages/Orders.vue'
import Notices from './pages/Notices.vue'
const Workbench = () => import('./pages/Workbench.vue')
const AdminLogin = () => import('./pages/AdminLogin.vue')
const Screen = () => import('./pages/Screen.vue')
const Profile = () => import('./pages/Profile.vue')
let managerValidationFailed = false

// Hash 路由让网页既可独立开发，也可直接放入 Spring Boot 静态资源目录。
const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', redirect: () => window.matchMedia('(max-width: 760px)').matches ? '/m' : '/admin' },
  { path: '/m', component: MobileHome }, { path: '/m/orders', component: Orders },
  { path: '/m/notices', component: Notices }, { path: '/m/profile', component: Profile },
  { path: '/admin', component: Workbench }, { path: '/admin/login', component: AdminLogin }, { path: '/screen', component: Screen },
  { path: '/orders', redirect: '/m/orders' }, { path: '/notices', redirect: '/m/notices' }, { path: '/workbench', redirect: '/admin' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
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
