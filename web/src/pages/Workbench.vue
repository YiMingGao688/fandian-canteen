<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { ArrowUpRight, RefreshCw, ArrowRight, X, Pencil, Plus, Settings2, SlidersHorizontal, MessageSquareText, Sun, Moon, LayoutGrid, CalendarDays, Utensils, Search, Bell, CircleHelp, LogOut, UserRound } from '@lucide/vue'
import PremiumOverview from '../components/PremiumOverview.vue'
import AdminPagination from '../components/AdminPagination.vue'
import AdminSelect from '../components/AdminSelect.vue'
import AdminDishEditor from '../components/AdminDishEditor.vue'
import AdminCategoryManager from '../components/AdminCategoryManager.vue'
import { usePagedRows } from '../composables/usePagedRows'
import '../workbench-ui.css'
import '../premium-admin-pages.css'
import '../premium-dashboard.css'
import '../admin-workspace.css'
import OrderDispatch from '../components/OrderDispatch.vue'
import OperationsSettings from '../components/OperationsSettings.vue'
import { state, api, attempt, notify, money, sameId, logout } from '../state'

const tab=ref('dashboard'), orders=ref([]), dishes=ref([]), feedback=ref([]), dashboard=ref(null), loading=ref(false), busy=ref('')
const orderFilter=ref('active'), pickupCode=ref(''), pickupResult=ref(null), edit=ref(null), reply=ref(null), replyText=ref('')
const isStaff=computed(()=>['STAFF','ADMIN'].includes(state.account?.role))
const window=computed(()=>dashboard.value?.window || state.windows.find(w=>sameId(w.id,state.account?.windowId)))
const menuSearch=ref(''), feedbackSearch=ref(''), feedbackStatus=ref('all')
const selectedDishes=ref([]),batchBusy=ref(false)
const categoryManager=ref(false), savedDishId=ref(null), dishBusy=ref(null)
const feedbackStatusOptions=[{value:'all',label:'全部状态'},{value:'pending',label:'待回复'},{value:'replied',label:'已回复'}]
// 先在当前权限已载入的数据中搜索，再按实际列表高度分页；不改变服务端的管理范围。
const filteredDishes=computed(()=>dishes.value.filter(dish=>[dish.name,dish.categoryName,dish.windowName].join(' ').toLowerCase().includes(menuSearch.value.trim().toLowerCase())))
const filteredFeedback=computed(()=>feedback.value.filter(item=>(feedbackStatus.value==='all'||(feedbackStatus.value==='replied'?!!item.reply:!item.reply))&&[item.displayName,item.content,item.reply,item.windowName].join(' ').toLowerCase().includes(feedbackSearch.value.trim().toLowerCase())))
const {viewport:menuViewport,page:menuPage,pageSize:menuPageSize,total:menuTotal,visibleRows:pageDishes}=usePagedRows(filteredDishes,{rowHeight:64,headerHeight:44,resetKey:()=>menuSearch.value})
const {viewport:feedbackViewport,page:feedbackPage,pageSize:feedbackPageSize,total:feedbackTotal,visibleRows:pageFeedback}=usePagedRows(filteredFeedback,{rowHeight:72,headerHeight:44,resetKey:()=>[feedbackSearch.value,feedbackStatus.value]})
const nav = [{ id: 'dashboard', name: '经营概览', icon: LayoutGrid }, { id: 'orders', name: '预约订单', icon: CalendarDays }, { id: 'menu', name: '菜品与库存', icon: Utensils }, { id: 'feedback', name: '学生反馈', icon: MessageSquareText }, { id: 'settings', name: '运营设置', icon: Settings2 }]
const helpDialog = ref(null), darkMode = ref(false)
try { darkMode.value = localStorage.getItem('hexu.admin.theme') === 'dark' } catch { /* 浏览器禁用存储时仍可在本次会话切换外观。 */ }
/** 外观偏好只保存在浏览器；离开管理端时移除主题类。 */
watch(darkMode, value => {
  document.body.classList.toggle('admin-dark', value)
  try { localStorage.setItem('hexu.admin.theme', value ? 'dark' : 'light') } catch { /* 无持久化权限时不阻断页面。 */ }
}, { immediate: true })
/** 顶部搜索进入现有订单模块，再聚焦已有搜索框，不改变订单筛选和查询规则。 */
function searchOrders() {
  tab.value = 'orders'
  requestAnimationFrame(() => document.querySelector('input[aria-label="搜索预约订单"]')?.focus())
}
async function load(){if(!isStaff.value)return;loading.value=true;await attempt(async()=>{const [d,o,m,f]=await Promise.all([api('/staff/dashboard'),api('/staff/orders'),api('/staff/menu'),api('/staff/feedback')]);dashboard.value=d;orders.value=o;dishes.value=m;feedback.value=f});loading.value=false}
/** 每五秒轻量同步预约；页面隐藏或上次请求未结束时跳过，避免重复压数据库。 */
let orderSyncing=false
async function syncOrders(){if(!isStaff.value||tab.value==='orders'||document.hidden||loading.value||orderSyncing)return;orderSyncing=true;try{orders.value=await api('/staff/orders')}catch{/* 总览队列轻量同步；订单模块独立轮询当前服务端分页。 */}finally{orderSyncing=false}}
async function advance(order,operation){busy.value=String(order.id);await attempt(async()=>{await api(`/staff/orders/${order.id}/${operation}`,{method:'POST'});notify(operation==='accept'?'已接单，进入备餐':'已完成备餐，学生可以到窗取餐');await load()});busy.value=''}
async function pickup(){if(busy.value)return;busy.value='pickup';await attempt(async()=>{pickupResult.value=await api('/staff/pickup',{method:'POST',body:{code:pickupCode.value.trim().toUpperCase()}});pickupCode.value='';notify('取餐核销成功');await load()});busy.value=''}
/** 单独上下架沿用原接口；同一菜品请求期间禁用重复点击，字段不携带旧库存。 */
async function toggle(dish){if(dishBusy.value===dish.id)return;dishBusy.value=dish.id;try{await attempt(async()=>{await api('/staff/menu',{method:'PUT',body:{id:dish.id,status:Number(dish.status)===1?0:1}});notify(Number(dish.status)===1?'菜品已下架':'菜品已上架');await load()})}finally{dishBusy.value=null}}
/** 选择限定为当前页，翻页或筛选后清空，避免隐藏记录误入批量操作。 */
watch([menuPage,menuPageSize,menuSearch],()=>{selectedDishes.value=[]})
async function batchStatus(status){if(batchBusy.value||!selectedDishes.value.length)return;batchBusy.value=true;try{await api('/staff/menu/batch/status',{method:'PUT',body:{ids:selectedDishes.value.map(Number),status}});selectedDishes.value=[];notify('选中菜品已'+(status===1?'上架':'下架'));await load()}catch(error){notify(error.message,true)}finally{batchBusy.value=false}}
/** 保存后重新读取真实菜单并定位记录所在页，新建菜品不会被当前搜索条件藏起来。 */
async function dishSaved(dish,isNew){edit.value=null;menuSearch.value='';savedDishId.value=dish.id;notify(isNew?'菜品已创建':'菜品信息已更新');await load();await nextTick();const index=filteredDishes.value.findIndex(item=>sameId(item.id,dish.id));if(index>=0)menuPage.value=Math.floor(index/menuPageSize.value)+1}
async function dishDeleted(){edit.value=null;savedDishId.value=null;notify('菜品已删除');await load()}
async function sendReply(){busy.value='reply';await attempt(async()=>{await api('/staff/feedback/reply',{method:'POST',body:{id:reply.value.id,reply:replyText.value}});reply.value=null;notify('回复已发送给学生');await load()});busy.value=''}
/** 总览样板只切换到既有模块及订单筛选，不新增业务写入路径。 */
function openOverviewModule({ tab: target, filter = 'active' }) {
  if (!nav.some(item => item.id === target)) return
  if (target === 'orders' && ['active', 'all', '1', '2', '3', '4', '5', '6'].includes(filter)) orderFilter.value = filter
  tab.value = target
}
// 管理端各业务页共享参考图的卡片外壳；退出后清理，避免影响登录与学生端。
watch(isStaff, allowed => document.body.classList.toggle('premium-admin', allowed), { immediate: true })
// 业务页共享文档滚动，切换模块时让键盘与指针用户都从该页标题开始阅读。
watch(tab, () => globalThis.scrollTo(0, 0), { flush: 'post' })
watch(()=>state.account?.userId,load)
let timer,orderTimer
onMounted(()=>{load();timer=setInterval(()=>{if(!document.hidden)load()},20000);orderTimer=setInterval(syncOrders,5000)})
onUnmounted(()=>{clearInterval(timer);clearInterval(orderTimer);document.body.classList.remove('premium-admin','admin-dark')})
</script>

<template>
  <div v-if="isStaff" class="page-wrap workbench-page premium-workbench" :class="{'premium-module-view':tab!=='dashboard'}" :data-module="tab">
    <!-- 业务导航使用管理页头的固定插槽，切换模块沿用当前窗口和会话。 -->
    <Teleport to="#admin-module-navigation">
      <nav class="edition-nav" aria-label="管理导航">
        <button v-for="item in nav" :key="item.id" :aria-current="tab === item.id ? 'page' : undefined" @click="tab = item.id">{{ item.name }}</button>
      </nav>
    </Teleport>
    <Teleport to="#admin-header-tools">
      <div class="fn-header-tools"><button aria-label="打开订单搜索" title="搜索预约订单" @click="searchOrders"><Search :size="18" /></button><button aria-label="查看学生反馈" title="学生反馈" class="fn-notification" @click="tab='feedback'"><Bell :size="18" /><i v-if="feedback.some(item=>!item.reply)" /></button><button aria-label="管理端使用帮助" title="使用帮助" @click="helpDialog?.showModal()"><CircleHelp :size="17" /></button></div>
    </Teleport>
    <aside class="fn-rail" aria-label="管理快捷工具">
      <div class="fn-rail-theme"><button aria-label="浅色外观" title="浅色外观" :aria-pressed="!darkMode" @click="darkMode=false"><Sun :size="19" /></button><button aria-label="深色外观" title="深色外观" :aria-pressed="darkMode" @click="darkMode=true"><Moon :size="18" /></button></div>
      <nav class="fn-rail-nav" aria-label="快捷导航"><button v-for="item in nav" :key="item.id" :title="item.name" :aria-label="item.name" :aria-current="tab===item.id?'page':undefined" @click="tab=item.id"><component :is="item.icon" :size="18" :stroke-width="1.5" /></button><button aria-label="刷新管理数据" title="刷新管理数据" :disabled="loading" @click="load"><RefreshCw :size="17" :stroke-width="1.5" :class="{spin:loading}" /></button></nav>
      <div class="fn-rail-bottom"><button aria-label="使用帮助" title="使用帮助" @click="helpDialog?.showModal()"><CircleHelp :size="17" /></button><button aria-label="退出管理账号" title="退出登录" @click="logout()"><LogOut :size="17" /></button></div>
    </aside>
    <section class="workbench-main">
      <header v-if="tab === 'menu' || tab === 'feedback'" class="workbench-title">
        <div>
          <span class="workbench-title-kicker">{{ state.account.role === 'ADMIN' ? '全校运营管理' : window?.canteenName }}</span>
          <h1>{{ nav.find(item=>item.id===tab)?.name }}</h1>
          <p>{{ state.account.role === 'ADMIN' ? '全校食堂经营与预约运行情况' : `${window?.name} · ${window?.location}` }}</p>
        </div>
        <button class="button button-outline workbench-refresh" :disabled="loading" @click="load"><RefreshCw :size="15" :class="{spin:loading}" />刷新数据</button>
      </header>
      <PremiumOverview v-if="tab === 'dashboard'" :dashboard="dashboard" :orders="orders" :dishes="dishes" :feedback="feedback" :loading="loading" :scope="state.account.role==='ADMIN' ? '全校食堂' : window?.name || '当前窗口'" @refresh="load" @navigate="openOverviewModule" />
      <OrderDispatch v-else-if="tab==='orders'" server-mode :orders="orders" :busy="busy" :loading="loading"
        :scope="state.account.role==='ADMIN' ? '全校食堂' : window?.name || '当前窗口'"
        v-model:filter="orderFilter" v-model:code="pickupCode" :result="pickupResult"
        @refresh="load" @advance="advance" @pickup="pickup" @dismiss="pickupResult=null" />

      <OperationsSettings v-else-if="tab==='settings'" @changed="load" />

      <section v-else-if="tab==='menu'" class="fn-list-panel">
        <header class="fn-list-toolbar table-section-heading"><div><h3>菜品列表 <span>{{ dishes.length }} 道</span></h3><p>管理菜品资料、可售库存与上架状态。</p></div><div class="fn-menu-actions"><template v-if="selectedDishes.length"><span class="am-field-note">已选 {{ selectedDishes.length }} 道</span><button class="fn-menu-categories" :disabled="batchBusy" @click="batchStatus(1)">批量上架</button><button class="fn-menu-categories" :disabled="batchBusy" @click="batchStatus(0)">批量下架</button></template><label class="ed-search"><Search :size="16" /><input v-model="menuSearch" aria-label="搜索菜品" placeholder="搜索菜品或窗口" /></label><button v-if="state.account.role==='ADMIN'" class="fn-menu-categories" @click="categoryManager=true"><SlidersHorizontal :size="15" />分类管理</button><button class="fn-menu-create" @click="edit={}"><Plus :size="17" />新增菜品</button></div></header>
        <div ref="menuViewport" class="fn-list-viewport data-table-wrap">
          <!-- 固定列宽及状态文字区域，防止上下架文案长度变化时整张表横向重排。 -->
          <table class="data-table fn-menu-table"><colgroup><col /><col /><col /><col /><col /><col /></colgroup><thead><tr><th>菜品</th><th>分类</th><th>单价</th><th>可售余量</th><th>状态</th><th>操作</th></tr></thead>
            <tbody><tr v-for="dish in pageDishes" :key="dish.id" :class="{'am-just-saved':sameId(savedDishId,dish.id)}"><td><div class="table-dish"><label class="batch-picker" :title="'选择'+dish.name"><input v-model="selectedDishes" type="checkbox" :value="dish.id" :aria-label="'选择菜品'+dish.name" :disabled="batchBusy" /><span aria-hidden="true" /></label><img :src="dish.image" :alt="dish.name" /><div><b :title="dish.name">{{ dish.name }}</b><small>{{ dish.windowName }} · {{ dish.tags?.split(',')[0] }}</small></div></div></td><td>{{ dish.categoryName }}</td><td class="table-price">¥{{ money(dish.price) }}</td><td><span :class="{'low-stock':Number(dish.stock)<10}">{{ dish.stock }}</span> 份</td><td><button class="status-toggle" :class="{on:Number(dish.status)===1}" :aria-label="`${Number(dish.status)===1?'下架':'上架'}${dish.name}`" :disabled="dishBusy===dish.id" @click="toggle(dish)"><span aria-hidden="true" /><b class="status-toggle-label">{{ Number(dish.status)===1?'在售':'已下架' }}</b></button></td><td><button class="text-button" @click="edit={...dish}"><Pencil :size="13" />编辑</button></td></tr></tbody>
          </table><p v-if="!menuTotal" class="fn-list-empty">{{ loading?'正在载入菜品…':'没有匹配的菜品' }}</p>
        </div>
        <AdminPagination v-model="menuPage" :total="menuTotal" :page-size="menuPageSize" label="菜品分页" unit="道" />
      </section>

      <section v-else-if="tab==='feedback'" class="fn-list-panel">
        <header class="fn-list-toolbar table-section-heading"><div><h3>反馈列表 <span>{{ feedback.filter(item=>!item.reply).length }} 条待回复</span></h3><p>查看学生建议并回复，完整内容在回复窗口中展示。</p></div><div class="fn-list-tools"><AdminSelect v-model="feedbackStatus" class="fn-feedback-status" :options="feedbackStatusOptions" label="反馈状态筛选" /><label class="ed-search"><Search :size="16" /><input v-model="feedbackSearch" aria-label="搜索学生反馈" placeholder="搜索学生或建议" /></label></div></header>
        <div ref="feedbackViewport" class="fn-list-viewport data-table-wrap">
          <table class="data-table fn-feedback-table"><thead><tr><th>学生</th><th>反馈内容</th><th>食堂窗口</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody><tr v-for="item in pageFeedback" :key="item.id"><td><span class="fn-feedback-person"><span class="avatar" aria-hidden="true"><UserRound :size="17" /></span>{{ item.displayName }}</span></td><td><span class="fn-feedback-content" :title="item.content">{{ item.content }}</span><small v-if="item.reply" class="fn-feedback-reply" :title="item.reply">回复：{{ item.reply }}</small></td><td>{{ item.windowName || '—' }}</td><td>{{ item.createdAt }}</td><td><span class="status-badge" :class="item.reply?'green':'amber'">{{ item.reply?'已回复':'待回复' }}</span></td><td><button class="text-button" @click="reply=item;replyText=item.reply || ''">{{ item.reply?'修改回复':'回复这条建议' }}<ArrowUpRight :size="14" /></button></td></tr></tbody>
          </table><p v-if="!feedbackTotal" class="fn-list-empty">{{ loading?'正在载入反馈…':'当前没有匹配的反馈' }}</p>
        </div>
        <AdminPagination v-model="feedbackPage" :total="feedbackTotal" :page-size="feedbackPageSize" label="反馈分页" />
      </section>
    </section>
    <dialog ref="helpDialog" class="fn-help-dialog"><header><h2>从容管理每一餐。</h2><button class="icon-button" aria-label="关闭使用帮助" @click="helpDialog.close()"><X :size="19" /></button></header><p>从经营概览了解收入与出餐情况，点击状态卡片进入对应预约队列。</p><dl><dt>预约订单</dt><dd>依次接单、标记备妥；学生到窗后，输入其出示的八位取餐码完成核销。</dd><dt>菜品与库存</dt><dd>新增和编辑菜品、上传照片、调整库存与上下架；全校管理员还可维护分类。已有订单的菜品保留下架记录用于追溯。</dd><dt>学生反馈</dt><dd>查看学生建议并回复，右上角的橙色提示点表示有尚未回复的反馈。</dd><dt>收入口径</dt><dd>收入统计仅计入已核销订单；近七日趋势按订单下单日期汇总。</dd></dl></dialog>
    <AdminDishEditor v-if="edit" :dish="edit" @close="edit=null" @saved="dishSaved" @deleted="dishDeleted" />
    <AdminCategoryManager v-if="categoryManager" @close="categoryManager=false" @changed="load" />
    <div v-if="reply" class="modal-backdrop" @click.self="reply=null"><form class="modal" @submit.prevent="sendReply"><button type="button" class="icon-button modal-close" aria-label="关闭回复" @click="reply=null"><X :size="20" /></button><h2>给学生一个回应。</h2><p class="feedback-original">{{ reply.content }}</p><label>窗口回复<textarea v-model="replyText" required maxlength="500" rows="5" placeholder="写下你想回复的话。" /></label><button class="button button-primary full" :disabled="!!busy">发送回复<ArrowRight :size="16" /></button></form></div>
  </div>
</template>

<style scoped>
.batch-picker{position:relative;display:grid;place-items:center;flex:0 0 18px;width:18px;height:18px;margin:0!important}.batch-picker input{position:absolute;inset:0;width:18px;height:18px;margin:0;opacity:0;cursor:pointer;z-index:1}.batch-picker span{width:16px;height:16px;border:1px solid var(--ed-rule);border-radius:5px;background:var(--ed-bg)}.batch-picker input:checked+span{background:#176a46;border-color:#176a46}.batch-picker input:checked+span:after{content:'';display:block;width:7px;height:4px;margin:4px 3px;border-left:1.7px solid white;border-bottom:1.7px solid white;transform:rotate(-45deg)}.batch-picker input:focus-visible+span{outline:2px solid #85a875;outline-offset:3px}.fn-menu-actions:has(.am-field-note) .ed-search{display:none}
</style>
