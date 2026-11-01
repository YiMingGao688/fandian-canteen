<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { CalendarCheck, ArrowRight, MapPin, Clock3, RefreshCw, ShoppingBag, Ticket, Check, X, Star, CalendarDays, LoaderCircle, ChevronRight } from '@lucide/vue'
import { state, api, attempt, notify, money, statusText, statusClass, dateString, sameId } from '../state'

const orders = ref([]), tab = ref(0), busy = ref(''), loading = ref(false)
const review = ref(null), rating = ref(5), content = ref('')
const editing = ref(null), editDate = ref(dateString(1)), editSlots = ref([]), editSlot = ref('')
const visible = computed(() => orders.value.filter(o => tab.value === 0 || Number(o.status) === tab.value))
const tabs = [{id:0,name:'全部预约'},{id:1,name:'待支付'},{id:2,name:'待接单'},{id:3,name:'备餐中'},{id:4,name:'待取餐'},{id:5,name:'已完成'},{id:6,name:'已取消'}]
const isStudent = computed(() => state.account?.role === 'STUDENT')
async function load() { if (isStudent.value) { loading.value = true; await attempt(async () => { orders.value = await api('/student/orders') }); loading.value = false } else orders.value = [] }
async function action(order, operation) {
  if (busy.value) return
  if (operation === 'cancel' && !window.confirm('取消后将归还库存和预约名额，确定取消这一餐吗？')) return
  busy.value = String(order.id)
  await attempt(async () => {
    if (operation === 'pay') {
      const payment = await api(`/student/orders/${order.id}/payment`, { method: 'POST' })
      if (payment.mode === 'alipay') { window.location.assign(payment.redirectUrl); return }
      if (payment.mode === 'paid') { notify('这份预约已经支付'); await load(); return }
      notify('演示支付完成，请等待窗口备餐'); await load(); return
    }
    await api(`/student/orders/${order.id}/${operation}`, { method: 'POST' })
    notify('预约已取消，名额与库存已归还'); await load()
  })
  busy.value = ''
}
function progress(status) { return Number(status) >= 5 ? 3 : Number(status) === 4 ? 2 : Number(status) === 3 ? 1 : 0 }
async function submitReview() {
  if (!content.value.trim()) return notify('写下你的用餐感受吧', true)
  busy.value = 'review'
  await attempt(async () => { await api('/student/reviews', { method:'POST', body:{orderId:review.value.id,rating:rating.value,content:content.value} }); review.value=null; content.value=''; notify('谢谢你的评价，下一餐继续好好吃饭'); await load() })
  busy.value = ''
}
async function loadEditSlots() {
  if (!editing.value) return
  await attempt(async () => { editSlots.value = await api(`/public/slots?windowId=${editing.value.windowId}&date=${editDate.value}`); editSlot.value=editSlots.value.find(s=>Number(s.reserved)<Number(s.capacity))?.id || '' })
}
async function beginEdit(order) { editing.value=order; editDate.value=order.serviceDate >= dateString() ? order.serviceDate : dateString(1); await loadEditSlots() }
async function saveEdit() {
  busy.value='edit'
  await attempt(async()=>{await api(`/student/orders/${editing.value.id}/reschedule`, {method:'POST',body:{slotId:editSlot.value}}); editing.value=null; notify('已为你安排新的取餐时段'); await load()})
  busy.value=''
}
function login() { state.loginRole='STUDENT'; state.loginOpen=true }
watch(()=>state.account?.userId, load)
watch(editDate, loadEditSlots)
let timer
onMounted(()=>{load(); timer=setInterval(load,20000)})
onUnmounted(()=>clearInterval(timer))
</script>

<template>
  <div class="page-wrap inner-page"><div class="page-title"><div><p class="eyebrow">EVERY MEAL, WELL PLANNED</p><h1>我的预约<span class="title-dot">.</span></h1><p>下课的那一餐，已经为你安排好了。</p></div><button v-if="isStudent" class="button button-outline" :disabled="loading" @click="load"><RefreshCw :size="15" :class="{spin:loading}" />刷新状态</button></div>
    <div v-if="!isStudent" class="empty-state page-empty"><span class="empty-cart-icon"><CalendarCheck :size="35" /></span><h2>下一餐，等你来安排。</h2><p>登录学生账号，查看你的预约与取餐记录。</p><button class="button button-primary" @click="login">用学号登录<ArrowRight :size="17" /></button></div>
    <template v-else><div class="order-tabs"><button v-for="item in tabs" :key="item.id" :class="{active:tab===item.id}" @click="tab=item.id">{{ item.name }}<span v-if="orders.filter(o=>Number(o.status)===item.id).length">{{ orders.filter(o=>Number(o.status)===item.id).length }}</span></button></div><div v-if="!visible.length" class="empty-state page-empty"><CalendarCheck :size="42" /><h2>这里还没有预约</h2><p>选一餐喜欢的味道，给接下来的自己一点期待。</p><RouterLink class="button button-primary" to="/m">去挑选今日好味<ArrowRight :size="17" /></RouterLink></div>
      <div class="orders-grid"><article v-for="order in visible" :key="order.id" class="order-card" :class="{'ready-card':Number(order.status)===4}"><div class="order-card-top"><div class="order-window"><span class="window-small-icon"><ShoppingBag :size="19" /></span><div><h3>{{ order.windowName }}<ChevronRight :size="14" /></h3><small>{{ order.canteenName }}<span v-if="order.demo" class="seed-label">体验记录</span></small></div></div><span class="status-badge" :class="statusClass(order.status)"><i />{{ statusText(order.status) }}</span></div><div class="order-time-row"><CalendarDays :size="14" />{{ order.serviceDate }}<span>{{ order.startTime }} – {{ order.endTime }}</span></div><div class="order-dish-list"><div v-for="item in order.items" :key="item.id" class="order-dish"><img :src="item.image" :alt="item.name" /><div><b>{{ item.name }}</b><small>¥{{ money(item.amount) }} / 份</small></div><span>× {{ item.number }}</span></div></div>
        <div v-if="Number(order.status)!==6" class="order-progress"><div v-for="(step,index) in ['预约成功','窗口备餐','到窗取餐','已取餐']" :key="step" :class="{done:progress(order.status)>=index, current:progress(order.status)===index}"><span><Check v-if="progress(order.status)>index" :size="11" /><i v-else /></span><small>{{ step }}</small></div></div>
        <div v-if="[2,3,4].includes(Number(order.status)) && order.pickupCode" class="pickup-ticket"><div><span><Ticket :size="15" />{{ Number(order.status)===4?'这一餐，已经准备好了':'你的取餐凭证' }}</span><strong>{{ order.pickupCode.slice(0,4) }} <span>{{ order.pickupCode.slice(4) }}</span></strong><small>{{ Number(order.status)===4?'到窗口出示取餐码，工作人员核销后取餐':'等待窗口备餐完成后，再前往窗口取餐' }}</small></div><div class="ticket-pattern" aria-hidden="true"><i v-for="n in 24" :key="n" :style="{height:`${20+(n%4)*9}px`,width:n%3===0?'3px':'1px'}" /></div></div>
        <div v-if="Number(order.status)===6" class="cancel-note">{{ order.cancelReason || '预约已取消' }}<span v-if="Number(order.payStatus)===2"> · 演示退款已记录，不涉及真实资金</span></div>
        <div class="order-location"><MapPin :size="13" />{{ order.location }}<span v-if="order.remark">备注：{{ order.remark }}</span></div><div class="order-card-bottom"><span class="order-amount">合计<b>¥{{ money(order.amount) }}</b></span><div class="order-actions"><button v-if="[1,2].includes(Number(order.status))" class="text-button muted" :disabled="!!busy" @click="action(order,'cancel')">取消</button><button v-if="[1,2].includes(Number(order.status))" class="button button-outline small" :disabled="!!busy" @click="beginEdit(order)">改约时段</button><button v-if="Number(order.status)===1" class="button button-primary small" :disabled="!!busy" @click="action(order,'pay')">{{ busy===String(order.id)?'处理中':'去支付' }}</button><button v-if="Number(order.status)===5 && !order.reviewed" class="button button-outline small" @click="review=order;rating=5;content=''">评价这一餐<Star :size="13" /></button><span v-if="Number(order.status)===5 && order.reviewed" class="muted tiny"><Check :size="13" />已评价</span></div></div><p class="order-number">{{ order.number }}<span>{{ order.orderTime }}</span></p></article></div>
    </template>
    <div v-if="review" class="modal-backdrop" @click.self="review=null"><section class="modal"><button class="icon-button modal-close" aria-label="关闭评价" @click="review=null"><X :size="20" /></button><p class="eyebrow">HOW WAS YOUR MEAL?</p><h2>这一餐，还合胃口吗？</h2><p class="muted">你的反馈，让窗口的下一餐更好。</p><div class="rating-stars"><button v-for="n in 5" :key="n" :aria-label="`${n}星`" @click="rating=n"><Star :size="32" :fill="n<=rating?'currentColor':'none'" /></button><b>{{ rating }} 分</b></div><label>说说你的用餐感受<textarea v-model="content" rows="4" maxlength="300" placeholder="味道、分量、服务，都可以聊聊。" /></label><button class="button button-primary full" :disabled="!!busy" @click="submitReview">提交评价<ArrowRight :size="16" /></button></section></div>
    <div v-if="editing" class="modal-backdrop" @click.self="editing=null"><section class="modal"><button class="icon-button modal-close" aria-label="关闭改约" @click="editing=null"><X :size="20" /></button><p class="eyebrow">A BETTER TIME FOR YOUR MEAL</p><h2>换个更从容的时间。</h2><p class="muted">{{ editing.windowName }} · 窗口开始备餐前支持改约</p><label>就餐日期<select v-model="editDate"><option :value="dateString()">今天 · {{ dateString() }}</option><option :value="dateString(1)">明天 · {{ dateString(1) }}</option></select></label><label>取餐时段<select v-model="editSlot"><option value="" disabled>请选择新的时段</option><option v-for="slot in editSlots" :key="slot.id" :value="slot.id" :disabled="Number(slot.reserved)>=Number(slot.capacity)">{{ slot.startTime }} – {{ slot.endTime }} · 余 {{ Number(slot.capacity)-Number(slot.reserved) }} 位</option></select></label><p class="form-hint">改约成功后转移预约名额。新时段已满时，会保留原预约。</p><button class="button button-primary full" :disabled="!!busy || !editSlot" @click="saveEdit">确认改约<ArrowRight :size="16" /></button></section></div>
  </div>
</template>
