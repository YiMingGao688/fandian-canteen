<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { LayoutDashboard, ClipboardList, Utensils, MessageSquareText, ArrowUpRight, RefreshCw, Ticket, ArrowRight, Check, X, Clock3, ChefHat, Pencil, CircleCheck } from '@lucide/vue'
import OverviewDashboard from '../components/OverviewDashboard.vue'
import '../workbench-ui.css'
import { state, api, attempt, notify, money, sameId, statusText, statusClass } from '../state'

const tab=ref('dashboard'), orders=ref([]), dishes=ref([]), feedback=ref([]), dashboard=ref(null), loading=ref(false), busy=ref('')
const orderFilter=ref('active'), pickupCode=ref(''), pickupResult=ref(null), edit=ref(null), reply=ref(null), replyText=ref('')
const isStaff=computed(()=>['STAFF','ADMIN'].includes(state.account?.role))
const window=computed(()=>dashboard.value?.window || state.windows.find(w=>sameId(w.id,state.account?.windowId)))
const activeOrders=computed(()=>orders.value.filter(o=>[2,3,4].includes(Number(o.status))))
const filteredOrders=computed(()=>orders.value.filter(o=>orderFilter.value==='all'||(orderFilter.value==='active'?[2,3,4].includes(Number(o.status)):Number(o.status)===Number(orderFilter.value))))
const nav=[{id:'dashboard',name:'经营概览',icon:LayoutDashboard},{id:'orders',name:'预约订单',icon:ClipboardList},{id:'menu',name:'菜品与库存',icon:Utensils},{id:'feedback',name:'学生反馈',icon:MessageSquareText}]
async function load(){if(!isStaff.value)return;loading.value=true;await attempt(async()=>{const [d,o,m,f]=await Promise.all([api('/staff/dashboard'),api('/staff/orders'),api('/staff/menu'),api('/staff/feedback')]);dashboard.value=d;orders.value=o;dishes.value=m;feedback.value=f});loading.value=false}
/** 每五秒轻量同步预约；页面隐藏或上次请求未结束时跳过，避免重复压数据库。 */
let orderSyncing=false
async function syncOrders(){if(!isStaff.value||document.hidden||loading.value||orderSyncing)return;orderSyncing=true;try{orders.value=await api('/staff/orders')}catch{/* 轮询失败时静默等待下一轮，手动刷新仍显示错误。 */}finally{orderSyncing=false}}
async function advance(order,operation){busy.value=String(order.id);await attempt(async()=>{await api(`/staff/orders/${order.id}/${operation}`,{method:'POST'});notify(operation==='accept'?'已接单，进入备餐':'已完成备餐，学生可以到窗取餐');await load()});busy.value=''}
async function pickup(){if(busy.value)return;busy.value='pickup';await attempt(async()=>{pickupResult.value=await api('/staff/pickup',{method:'POST',body:{code:pickupCode.value.trim().toUpperCase()}});pickupCode.value='';notify('取餐核销成功');await load()});busy.value=''}
async function toggle(dish){await attempt(async()=>{await api('/staff/menu',{method:'PUT',body:{id:dish.id,status:Number(dish.status)===1?0:1}});notify(Number(dish.status)===1?'菜品已下架':'菜品已上架');await load()})}
async function saveDish(){busy.value='dish';await attempt(async()=>{await api('/staff/menu',{method:'PUT',body:{id:edit.value.id,price:Number(edit.value.price),stock:Number(edit.value.stock),status:Number(edit.value.status)}});edit.value=null;notify('菜品信息已更新');await load()});busy.value=''}
async function sendReply(){busy.value='reply';await attempt(async()=>{await api('/staff/feedback/reply',{method:'POST',body:{id:reply.value.id,reply:replyText.value}});reply.value=null;notify('回复已发送给学生');await load()});busy.value=''}
watch(()=>state.account?.userId,load)
let timer,orderTimer
onMounted(()=>{load();timer=setInterval(()=>{if(!document.hidden)load()},20000);orderTimer=setInterval(syncOrders,5000)})
onUnmounted(()=>{clearInterval(timer);clearInterval(orderTimer)})
</script>

<template>
  <div v-if="isStaff" class="page-wrap workbench-page">
    <aside class="workbench-sidebar" aria-label="管理导航">
      <div class="sidebar-window">
        <span class="sidebar-window-icon"><ChefHat :size="18" /></span>
        <div><small>{{ state.account.role === 'ADMIN' ? '管理范围' : '当前窗口' }}</small><strong>{{ state.account.role === 'ADMIN' ? '全校食堂' : window?.name }}</strong></div>
      </div>
      <p class="workbench-nav-label">工作台</p>
      <nav>
        <button v-for="item in nav" :key="item.id" :class="{active:tab===item.id}" :aria-current="tab===item.id ? 'page' : undefined" @click="tab=item.id">
          <component :is="item.icon" :size="18" /><span>{{ item.name }}</span><span v-if="item.id==='orders' && activeOrders.length" class="nav-count" aria-label="进行中订单">{{ activeOrders.length }}</span>
        </button>
      </nav>
    </aside>
    <section class="workbench-main">
      <header class="workbench-title">
        <div>
          <span class="workbench-title-kicker">{{ state.account.role === 'ADMIN' ? '全校运营管理' : window?.canteenName }}</span>
          <h1>{{ nav.find(item=>item.id===tab)?.name }}</h1>
          <p>{{ state.account.role === 'ADMIN' ? '全校食堂经营与预约运行情况' : `${window?.name} · ${window?.location}` }}</p>
        </div>
        <button class="button button-outline workbench-refresh" :disabled="loading" @click="load"><RefreshCw :size="15" :class="{spin:loading}" />刷新数据</button>
      </header>
      <OverviewDashboard v-if="tab === 'dashboard'" :dashboard="dashboard" :orders="activeOrders" @orders="tab = 'orders'" />
      <template v-else-if="tab==='orders'"><section class="pickup-panel"><span class="pickup-panel-icon"><Ticket :size="28" /></span><div><h3>到窗了，核对一下取餐码</h3><p>核对取餐窗口和学生凭证后核销，重复核销将被拒绝。</p></div><form @submit.prevent="pickup"><input v-model="pickupCode" aria-label="学生取餐码" placeholder="输入八位取餐码" maxlength="8" minlength="8" required /><button class="button button-primary" :disabled="!!busy">确认核销<Check :size="16" /></button></form></section><div v-if="pickupResult" class="pickup-success"><CircleCheck :size="18" /><div><b>{{ pickupResult.studentName }}，这一餐已顺利取走。</b><p>{{ pickupResult.items?.map(i=>`${i.name} ×${i.number}`).join(' / ') }}</p></div><button class="icon-button" aria-label="关闭核销结果" @click="pickupResult=null"><X :size="17" /></button></div><div class="workbench-order-filters"><button v-for="filter in [{id:'active',name:'进行中'},{id:'2',name:'待接单'},{id:'3',name:'备餐中'},{id:'4',name:'待取餐'},{id:'5',name:'已完成'},{id:'all',name:'全部订单'}]" :key="filter.id" :class="{active:orderFilter===filter.id}" @click="orderFilter=filter.id">{{ filter.name }}</button></div><div v-if="!filteredOrders.length" class="empty-state table-empty"><ClipboardList :size="34" /><h3>暂时没有这类预约</h3><p>订单每 5 秒自动同步；未支付预约请切换“全部订单”查看。</p></div><div class="staff-orders"><article v-for="order in filteredOrders" :key="order.id" class="staff-order"><div class="staff-order-top"><b>{{ order.studentName }}<small>{{ order.studentNo }}</small></b><span class="status-badge" :class="statusClass(order.status)">{{ statusText(order.status) }}</span></div><div class="staff-order-items"><div v-for="item in order.items" :key="item.id"><img :src="item.image" :alt="item.name" /><span>{{ item.name }}</span><b>×{{ item.number }}</b></div></div><div class="staff-order-meta"><span class="staff-order-window">{{ order.windowName }} · {{ order.canteenName }}</span><span><Clock3 :size="13" />{{ order.serviceDate }} · {{ order.startTime }} – {{ order.endTime }}</span><p v-if="order.remark">备注：{{ order.remark }}</p></div><div class="staff-order-bottom"><b>¥{{ money(order.amount) }}</b><button v-if="Number(order.status)===2" class="button button-primary small" :disabled="!!busy" @click="advance(order,'accept')">接单并开始备餐<ArrowRight :size="14" /></button><button v-else-if="Number(order.status)===3" class="button button-primary small" :disabled="!!busy" @click="advance(order,'ready')">这一餐备好了<Check :size="14" /></button><span v-else-if="Number(order.status)===4" class="tiny muted">请核对学生出示的取餐码</span><span v-else class="tiny muted">{{ order.number }}</span></div></article></div></template>

      <template v-else-if="tab==='menu'"><div class="table-section-heading"><div><h3>窗口里的好味道</h3><p>按账号权限维护食堂窗口的价格、可售余量与上架状态。</p></div><span class="muted tiny">共 {{ dishes.length }} 道菜品</span></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>菜品</th><th>分类</th><th>单价</th><th>可售余量</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="dish in dishes" :key="dish.id"><td><div class="table-dish"><img :src="dish.image" :alt="dish.name" /><div><b>{{ dish.name }}</b><small>{{ dish.windowName }} · {{ dish.tags?.split(',')[0] }}</small></div></div></td><td>{{ dish.categoryName }}</td><td class="table-price">¥{{ money(dish.price) }}</td><td><span :class="{'low-stock':Number(dish.stock)<10}">{{ dish.stock }}</span> 份</td><td><button class="status-toggle" :class="{on:Number(dish.status)===1}" :aria-label="`${Number(dish.status)===1?'下架':'上架'}${dish.name}`" @click="toggle(dish)"><span />{{ Number(dish.status)===1?'在售':'已下架' }}</button></td><td><button class="text-button" @click="edit={...dish}"><Pencil :size="13" />编辑</button></td></tr></tbody></table></div></template>

      <template v-else-if="tab==='feedback'"><div class="table-section-heading"><div><h3>学生的每一句建议</h3><p>认真回应，让下一次就餐更好一点。</p></div><span class="muted tiny">{{ feedback.filter(f=>!f.reply).length }} 条等待回复</span></div><div v-if="!feedback.length" class="empty-state table-empty"><MessageSquareText :size="35" /><h3>暂时没有收到反馈</h3><p>学生发给本窗口的建议会显示在这里。</p></div><article v-for="item in feedback" :key="item.id" class="staff-feedback"><div><span class="avatar">{{ item.displayName.slice(0,1) }}</span><b>{{ item.displayName }}</b><time>{{ item.createdAt }}</time><span class="status-badge" :class="item.reply?'green':'amber'">{{ item.reply?'已回复':'待回复' }}</span></div><p>{{ item.content }}</p><blockquote v-if="item.reply">窗口回复：{{ item.reply }}</blockquote><button class="text-button" @click="reply=item;replyText=item.reply || ''">{{ item.reply?'修改回复':'回复这条建议' }}<ArrowUpRight :size="14" /></button></article></template>
    </section>
    <div v-if="edit" class="modal-backdrop" @click.self="edit=null"><form class="modal" @submit.prevent="saveDish"><button class="icon-button modal-close" type="button" aria-label="关闭菜品编辑" @click="edit=null"><X :size="20" /></button><p class="eyebrow">A LITTLE CARE FOR YOUR MENU</p><h2>{{ edit.name }}</h2><label>菜品单价（元）<input v-model="edit.price" type="number" min="0.01" max="999" step="0.01" required /></label><label>调整后的可售库存（份）<input v-model="edit.stock" type="number" min="0" max="10000" step="1" required /></label><label>上架状态<select v-model="edit.status"><option :value="1">在售</option><option :value="0">下架</option></select></label><p class="form-hint">库存填入调整后的剩余可售份数；已生成的预约金额保持原价。</p><button class="button button-primary full" :disabled="!!busy">保存菜品信息<Check :size="16" /></button></form></div><div v-if="reply" class="modal-backdrop" @click.self="reply=null"><form class="modal" @submit.prevent="sendReply"><button type="button" class="icon-button modal-close" aria-label="关闭回复" @click="reply=null"><X :size="20" /></button><p class="eyebrow">THANK YOU FOR YOUR FEEDBACK</p><h2>给学生一个回应。</h2><p class="feedback-original">{{ reply.content }}</p><label>窗口回复<textarea v-model="replyText" required maxlength="500" rows="5" placeholder="写下你想回复的话。" /></label><button class="button button-primary full" :disabled="!!busy">发送回复<ArrowRight :size="16" /></button></form></div>
  </div>
</template>
