<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowRight, Check, Ellipsis, RefreshCw, Search, X } from '@lucide/vue'
import AdminPagination from './AdminPagination.vue'
import AdminSelect from './AdminSelect.vue'
import { usePagedRows } from '../composables/usePagedRows'
import { api, money, notify, state, statusText } from '../state'

const props = defineProps({ orders: Array, busy: String, loading: Boolean, scope: String, result: Object, serverMode: Boolean })
const filter = defineModel('filter', { type: String, required: true })
const code = defineModel('code', { type: String, required: true })
const emit = defineEmits(['advance', 'pickup', 'dismiss', 'refresh'])
const keyword = ref(''), selectedOrder = ref(null), detailDialog = ref(null), codeInput = ref(null), clock = ref(Date.now())
const serverRows=ref([]),serverTotal=ref(0),serverLoading=ref(false),serverError=ref(''),searchTerm=ref(''),fromDate=ref(''),toDate=ref(''),windowFilter=ref('')
const exceptionAction=ref(''),reason=ref(''),exceptionError=ref(''),terminating=ref(false)
const windowOptions=computed(()=>[{value:'',label:'全部窗口'},...state.windows.map(window=>({value:window.id,label:`${window.canteenName} · ${window.name}`}))])
const groups = [
  { id: 2, name: '待接单' }, { id: 3, name: '备餐中' }, { id: 4, name: '待取餐' },
  { id: 1, name: '待支付' }, { id: 5, name: '已完成' }, { id: 6, name: '已取消' },
]
const filters = [{ id: 'active', name: '进行中' }, ...groups.slice(0,3).map(g => ({id:String(g.id),name:g.name})), {id:'1',name:'待支付'}, {id:'5',name:'已完成'}, {id:'6',name:'已取消'}, {id:'all',name:'全部'}]
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', month:'long', day:'numeric', weekday:'long'}).format(clock.value))
let interval,refreshTimer,searchTimer,controller,requestNumber=0
onMounted(() => { interval = setInterval(() => { clock.value = Date.now() }, 15000);if(props.serverMode)refreshTimer=setInterval(()=>{if(!document.hidden&&!serverLoading.value&&!props.busy&&!terminating.value)loadRemote()},5000) })
onUnmounted(() => {clearInterval(interval);clearInterval(refreshTimer);clearTimeout(searchTimer);controller?.abort();requestNumber++})

// 服务日期及取餐时间均属于校园本地时区。剩余十分钟提醒只影响显示，操作权限仍由服务端判定。
function deadline(order) {
  if (!/^\d{4}-\d\d-\d\d$/.test(order.serviceDate) || !/^\d\d:\d\d/.test(order.endTime)) return NaN
  return Date.parse(order.serviceDate + 'T' + String(order.endTime).slice(0,5) + ':00+08:00')
}
function timing(order) {
  if (![2,3,4].includes(Number(order.status))) return ''
  const left = deadline(order) - clock.value
  if (left <= 0) return '已过取餐时段'
  if (left <= 600000) return '距结束 ' + Math.ceil(left/60000) + ' 分钟'
  return ''
}
// 保留原有状态优先级及取餐截止时间排序；分页在排序之后执行，不改变处理次序。
const queues = computed(() => {
  const term = keyword.value.trim().toLowerCase()
  return groups.filter(group => filter.value==='all' || (filter.value==='active' ? [2,3,4].includes(group.id) : group.id===Number(filter.value)))
    .map(group => {
      const rows = props.orders.filter(order => Number(order.status)===group.id && (!term ||
        [order.studentName, order.studentNo, order.number, order.windowName, order.canteenName, ...(order.items||[]).map(item=>item.name)].join(' ').toLowerCase().includes(term)))
      if ([2,3,4].includes(group.id)) rows.sort((a,b)=>(deadline(a)||Infinity)-(deadline(b)||Infinity))
      return {...group, rows}
    }).filter(group=>group.rows.length)
})
const sortedOrders = computed(() => props.serverMode?serverRows.value:queues.value.flatMap(group=>group.rows))
const {viewport:listViewport,page,pageSize,total:count,visibleRows:pageOrders}=usePagedRows(sortedOrders,{rowHeight:84,headerHeight:36,serverTotal:props.serverMode?serverTotal:undefined,resetKey:()=>[filter.value,props.serverMode?searchTerm.value:keyword.value,fromDate.value,toDate.value,windowFilter.value]})
watch(keyword,value=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{searchTerm.value=value.trim()},200)})
/** 全量历史由服务端筛选、排序并分页；不将原总览最近一百笔用作历史查询回退。 */
async function loadRemote(){
  if(!props.serverMode)return
  if(fromDate.value&&toDate.value&&toDate.value<fromDate.value){serverError.value='结束日期不能早于开始日期';return}
  controller?.abort();controller=new AbortController();const number=++requestNumber,requestedPage=page.value
  serverLoading.value=true;serverError.value=''
  try{
    const params=new URLSearchParams({page:String(requestedPage),pageSize:String(pageSize.value),state:filter.value})
    if(searchTerm.value)params.set('keyword',searchTerm.value);if(fromDate.value)params.set('fromDate',fromDate.value);if(toDate.value)params.set('toDate',toDate.value);if(windowFilter.value!=='')params.set('windowId',String(windowFilter.value))
    const result=await api('/staff/orders/page?'+params,{signal:controller.signal})
    if(number===requestNumber){serverTotal.value=Number(result.total);if(requestedPage===page.value)serverRows.value=result.records||[]}
  }catch(cause){if(cause.name!=='AbortError'&&number===requestNumber)serverError.value=cause.message}
  finally{if(number===requestNumber)serverLoading.value=false}
}
watch([page,pageSize,filter,searchTerm,fromDate,toDate,windowFilter],loadRemote,{immediate:true})
/** WebSocket 事件只作刷新提示，列表仍从权限过滤后的接口读取完整数据。 */
watch(()=>state.orderRevision,loadRemote)
// 服务端分页由 WebSocket 事件维护，并保留 5 秒轮询作为断线兜底。
// 接单、核销等写操作结束后由 busy 变化触发一次即时刷新。
watch(()=>props.busy,(value,previous)=>{if(previous&&!value)loadRemote()})

/** 核销凭证仍须由到窗学生提供；从订单跳转仅聚焦输入框，绝不预填取餐码。 */
function focusPickup() { codeInput.value?.focus(); codeInput.value?.scrollIntoView({block:'nearest'}) }
/** 订单快照在独立抽屉中完整展示，不展开列表行或挤走当前页的操作。 */
async function openDetails(order) { selectedOrder.value=order;exceptionAction.value='';reason.value='';exceptionError.value='';await nextTick(); detailDialog.value?.showModal() }
function closeDetails() { if(terminating.value)return;detailDialog.value?.close(); selectedOrder.value=null }
function detailsPickup() { closeDetails(); nextTick(focusPickup) }
/** 原因在抽屉内确认；退款或状态校验失败时保留输入，不提前改变列表中的状态。 */
async function terminateOrder(){
  if(terminating.value||props.busy||!selectedOrder.value)return
  if(!reason.value.trim()){exceptionError.value='请填写处理原因';return}
  terminating.value=true;exceptionError.value=''
  try{
    await api(`/staff/orders/${selectedOrder.value.id}/${exceptionAction.value}`,{method:'POST',body:{reason:reason.value.trim()}})
    notify(exceptionAction.value==='reject'?'预约已拒绝，库存与名额已归还':'预约已取消，库存与名额已归还')
    terminating.value=false;closeDetails();await loadRemote();emit('refresh')
  }catch(cause){exceptionError.value=cause.message}finally{terminating.value=false}
}
</script>

<template>
  <article class="dispatch-page ed-page">
    <header class="edition-heading"><div><div class="edition-context">{{ scope }}<span> / </span>{{ dateLabel }}</div><h1>预约订单</h1></div><div class="edition-tools"><span>{{ state.orderSocketConnected ? 'WebSocket 实时推送' : '实时推送重连中' }} · 5 秒轮询兜底</span><button title="刷新预约订单" :disabled="loading||serverLoading" @click="loadRemote();emit('refresh')"><RefreshCw :size="15"/>刷新</button></div></header>
    <div class="dispatch-layout">
      <section class="dispatch-board" aria-label="预约处理队列">
        <div class="dispatch-filters ed-filters" aria-label="订单状态筛选"><button v-for="item in filters" :key="item.id" :aria-pressed="filter===item.id" @click="filter=item.id">{{ item.name }}</button></div>
        <div class="dispatch-search-line"><label class="ed-search"><Search :size="16"/><input v-model="keyword" aria-label="搜索预约订单" placeholder="搜索学生、订单号、菜品或窗口" /></label><small v-if="!serverMode">最近已载入的 {{ props.orders.length }} 笔</small><template v-if="serverMode"><div class="dispatch-date-range"><input v-model="fromDate" type="date" aria-label="取餐开始日期" /><span>至</span><input v-model="toDate" type="date" aria-label="取餐结束日期" /></div><AdminSelect v-if="state.account?.role==='ADMIN'" v-model="windowFilter" :options="windowOptions" label="订单窗口筛选" /></template></div>
        <p v-if="serverError" class="dispatch-query-error" role="alert">{{ serverError }}<button class="ed-link" @click="loadRemote">重试</button></p>
        <div ref="listViewport" class="dispatch-list-viewport">
          <div class="dispatch-list-head"><span>取餐时段</span><span>预约餐品与窗口</span><span>学生 / 金额</span><span>状态与处理</span><span /></div>
          <p v-if="!count" class="ed-empty">{{ loading||serverLoading ? '正在读取预约…' : keyword ? '没有与搜索条件匹配的预约。' : '当前没有这类预约。' }} <button v-if="keyword" class="ed-link" @click="keyword=''">清除搜索</button></p>
          <article v-for="order in pageOrders" :key="order.id" class="dispatch-order" :data-state="order.status">
            <div class="dispatch-row">
              <div class="dispatch-slot"><b>{{ String(order.startTime || '—').slice(0,5) }}<small>–{{ String(order.endTime || '—').slice(0,5) }}</small></b><span>{{ order.serviceDate }}</span></div>
              <div class="dispatch-meal"><strong :title="(order.items||[]).map(item=>item.name+' ×'+item.number).join('、')">{{ (order.items||[]).map(item=>item.name+' ×'+item.number).join('、') || '暂无菜品明细' }}</strong><span>{{ order.canteenName }} · {{ order.windowName }}</span><em v-if="order.remark" :title="order.remark">备注 · {{ order.remark }}</em></div>
              <div class="dispatch-person"><b>{{ order.studentName }}</b><span>¥{{ money(order.amount) }}</span></div>
              <div class="dispatch-next"><span class="dispatch-line-status"><i :data-state="order.status"/>{{ statusText(order.status) }}<span v-if="timing(order)" class="dispatch-risk">{{ timing(order) }}</span></span>
                <button v-if="Number(order.status)===2" :disabled="!!busy" class="dispatch-accept" @click="emit('advance',order,'accept')">接单并备餐 <ArrowRight :size="14"/></button>
                <button v-else-if="Number(order.status)===3" :disabled="!!busy" class="dispatch-ready" @click="emit('advance',order,'ready')">标记备妥 <Check :size="14"/></button>
                <button v-else-if="Number(order.status)===4" class="dispatch-to-pickup" @click="focusPickup">输入取餐码 <ArrowRight :size="14"/></button>
              </div>
              <button class="dispatch-expand" aria-haspopup="dialog" :aria-label="'展开'+order.studentName+'的订单明细'" @click="openDetails(order)"><Ellipsis :size="18"/></button>
            </div>
          </article>
        </div>
        <AdminPagination v-model="page" :total="count" :page-size="pageSize" label="预约订单分页" unit="笔" scope-label="筛选后" />
      </section>
      <aside class="dispatch-ticket" aria-label="到窗核销工具"><div class="ticket-top"><span>取餐凭证</span><span>{{ scope }}</span></div><h2>到窗核销</h2><p>凭学生出示的八位取餐码确认取餐。</p>
        <form @submit.prevent="emit('pickup')"><label for="dispatch-code">学生取餐码</label><input id="dispatch-code" ref="codeInput" v-model="code" placeholder="输入八位取餐码" minlength="8" maxlength="8" required autocomplete="off" autocapitalize="characters" spellcheck="false"/><button :disabled="!!busy">{{ busy==='pickup'?'核销中…':'确认核销' }}<ArrowRight :size="16"/></button></form>
        <div v-if="result" class="ticket-result" role="status"><b>{{ result.studentName }} 已取餐</b><span>{{ (result.items||[]).map(item=>item.name+' ×'+item.number).join('、') }}</span><button aria-label="关闭核销结果" @click="emit('dismiss')"><X :size="16"/></button></div>
      </aside>
    </div>
    <dialog ref="detailDialog" class="pd-dialog" aria-labelledby="dispatch-detail-title" @cancel="terminating&&$event.preventDefault()" @close="selectedOrder=null"><template v-if="selectedOrder"><header><h2 id="dispatch-detail-title">{{ exceptionAction?(exceptionAction==='reject'?'拒绝接单':'取消预约'):'订单明细' }}</h2><button class="pd-close" aria-label="关闭订单明细" :disabled="terminating" @click="closeDetails"><X :size="19"/></button></header><div class="pd-dialog-content dispatch-details"><span class="pd-status" :data-status="selectedOrder.status"><i/>{{ statusText(selectedOrder.status) }}</span><h3>{{ selectedOrder.studentName }}</h3><dl><dt>订单号</dt><dd>{{ selectedOrder.number }}</dd><dt>学号</dt><dd>{{ selectedOrder.studentNo || '—' }}</dd><dt>取餐窗口</dt><dd>{{ selectedOrder.canteenName }} · {{ selectedOrder.windowName }}</dd><dt>取餐时间</dt><dd>{{ selectedOrder.serviceDate }} {{ selectedOrder.startTime }}–{{ selectedOrder.endTime }}</dd><dt>订单金额</dt><dd>¥{{ money(selectedOrder.amount) }}</dd><dt>备注</dt><dd>{{ selectedOrder.remark || '无特殊备注' }}</dd><template v-if="selectedOrder.cancelReason"><dt>取消说明</dt><dd>{{ selectedOrder.cancelReason }}</dd></template><template v-if="Number(selectedOrder.payStatus)===2"><dt>退款状态</dt><dd>{{ selectedOrder.paymentChannel==='alipay'?'已退回支付宝沙箱':'演示支付已退回' }}</dd></template></dl><ul class="pd-detail-items"><li v-for="item in selectedOrder.items||[]" :key="item.id||item.name"><span>{{ item.name }}</span><b>× {{ item.number }}</b></li></ul>
      <form v-if="exceptionAction" class="dispatch-exception-form" @submit.prevent="terminateOrder"><p>{{ Number(selectedOrder.payStatus)===1?(selectedOrder.paymentChannel==='alipay'?'退款成功后取消预约，金额退回支付宝沙箱渠道。':'这是演示支付订单，取消后标记为已退回，不产生实际资金交易。'):'该预约尚未支付，取消后不产生退款。' }}</p><label>处理原因<textarea v-model="reason" aria-label="订单处理原因" rows="4" maxlength="200" required :disabled="terminating" placeholder="例如：食材不足，暂时无法备餐" /></label><p v-if="exceptionError" role="alert" class="dispatch-exception-error">{{ exceptionError }}</p><div><button type="button" class="dispatch-exception-back" :disabled="terminating" @click="exceptionAction='';exceptionError=''">返回明细</button><button class="dispatch-exception-confirm" :disabled="terminating||!!busy">{{ terminating?'正在处理…':exceptionAction==='reject'?'确认拒单':'确认取消' }}</button></div></form>
      <template v-else><button v-if="Number(selectedOrder.status)===4" class="pd-dialog-primary" @click="detailsPickup">转到取餐核销<ArrowRight :size="16"/></button><div v-if="[1,2,3,4].includes(Number(selectedOrder.status))" class="dispatch-exception-actions"><button v-if="Number(selectedOrder.status)===2" :disabled="!!busy" @click="exceptionAction='reject'">拒绝接单</button><button :disabled="!!busy" @click="exceptionAction='cancel'">取消预约</button></div></template>
    </div></template></dialog>
  </article>
</template>

<style scoped>
/* 列表分页后保持固定行高；长备注和菜品明细只在抽屉中完整展开。 */
.dispatch-page{display:flex;flex:1;min-height:0;flex-direction:column}
.edition-heading{flex:none}
.dispatch-layout{display:grid;grid-template-columns:minmax(0,1fr) clamp(218px,19vw,280px);gap:var(--fn-gap);flex:1;min-height:0;align-items:start}
.dispatch-board{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;background:var(--ed-head);border-radius:18px;padding:16px}
.dispatch-filters{gap:4px;flex:none}
.dispatch-search-line{margin:12px 0 14px;gap:9px;flex:none}
.dispatch-search-line .ed-search{width:min(360px,100%)}
.dispatch-search-line small{font-size:12px;color:var(--ed-muted);white-space:nowrap}
.dispatch-list-viewport{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}
.dispatch-row,.dispatch-list-head{display:grid;grid-template-columns:114px minmax(130px,1.8fr) minmax(65px,.6fr) minmax(132px,.9fr) 26px;align-items:center;gap:12px}
.dispatch-list-head{height:36px;background:var(--ed-raised);padding:0 5px;border-radius:9px;color:var(--ed-muted);font-size:12px}
.dispatch-order{height:84px;border-bottom:1px solid var(--ed-rule)}
.dispatch-row{height:100%;padding:9px 5px}
.dispatch-row>div{min-width:0;display:flex;flex-direction:column;align-items:flex-start}
.dispatch-slot b{font:500 20px/1.2 var(--fn-font);color:var(--ed-ink);white-space:nowrap}
.dispatch-slot b small{font:12px var(--fn-font);color:var(--ed-muted)}
.dispatch-row :is(.dispatch-slot,.dispatch-meal,.dispatch-person)>span{font-size:12px;color:var(--ed-muted);margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dispatch-meal strong,.dispatch-person b{font-size:14px;line-height:1.5;font-weight:500;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dispatch-meal em{font-size:12px;line-height:1.5;color:#a47e4f;font-style:normal;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dispatch-next{align-items:stretch!important;gap:4px}
.dispatch-line-status{display:flex;gap:5px;align-items:center;white-space:nowrap;font-size:12px;color:var(--ed-muted)}
.dispatch-line-status>i{width:5px;height:5px;background:#b3b9ac;border-radius:50%;flex:none}
.dispatch-line-status>i[data-state="2"]{background:#e39e64}.dispatch-line-status>i[data-state="3"]{background:#c8ad43}.dispatch-line-status>i[data-state="4"]{background:#81af31}.dispatch-line-status>i[data-state="5"]{background:#51ad87}
.dispatch-risk{font-size:12px;color:#ac7441;margin-left:auto;overflow:hidden;text-overflow:ellipsis}
.dispatch-next button,.dispatch-expand{display:inline-flex;align-items:center;justify-content:center;gap:5px;font-size:13px;padding:7px 10px;border-radius:20px;min-height:34px;white-space:nowrap}
.dispatch-accept{background:var(--fn-lime);color:#292d25;border:1px solid transparent}
.dispatch-ready{background:none;color:var(--ed-ink);border:1px solid var(--ed-rule)}
.dispatch-to-pickup,.dispatch-expand{background:none;color:var(--ed-muted);border:0}
.dispatch-next button:hover,.dispatch-expand:hover{filter:brightness(1.08)}
.dispatch-expand{padding:0;width:26px;height:30px;min-height:30px}
.dispatch-ticket{padding:18px;border:0;border-radius:18px;background:var(--ed-head);color:var(--ed-ink);align-self:start;min-width:0}
.ticket-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--ed-muted);border-bottom:1px dashed var(--ed-rule);padding-bottom:11px}
.dispatch-ticket h2{color:var(--ed-ink);margin:17px 0 6px;font:500 25px var(--fn-font)}
.dispatch-ticket p{margin:0;color:var(--ed-muted);font-size:13px;line-height:1.8}
.dispatch-ticket form{margin-top:15px}
.dispatch-ticket form label{display:block;color:var(--ed-muted);font-size:13px;margin-bottom:7px}
.dispatch-ticket input{width:100%;min-width:0;padding:10px;border:1px solid var(--ed-rule);border-radius:10px;background:var(--ed-raised);color:var(--ed-ink);font:500 16px var(--fn-font);text-transform:uppercase;letter-spacing:.1em}
.dispatch-ticket input::placeholder{font-size:14px;font-weight:400;color:var(--ed-muted);letter-spacing:.02em}
.dispatch-ticket form button{width:100%;min-height:42px;display:flex;align-items:center;justify-content:space-between;background:var(--fn-lime);color:#26351b;font-size:14px;border:0;border-radius:23px;padding:9px 14px;margin-top:12px}
.dispatch-ticket form button:hover{background:#9ce52a}
.ticket-result{position:relative;align-items:start;flex-direction:column;border-top:1px dashed var(--ed-rule);padding:10px 20px 0 0;margin-top:14px;line-height:1.5}
.ticket-result span{font-size:12px}.ticket-result button{position:absolute;right:-4px;top:7px;background:none;border:0;color:inherit}
@media(max-width:1150px){
  .dispatch-layout{display:flex;flex-direction:column;gap:14px}.dispatch-board{flex:1;width:100%}
  .dispatch-ticket{order:-1;width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:0 18px;padding:12px 16px;flex:none}
  .dispatch-ticket h2{font-size:21px;margin:0}.dispatch-ticket .ticket-top,.dispatch-ticket p,.dispatch-ticket form label{display:none}
  .dispatch-ticket form{display:flex;align-items:center;gap:12px;margin:0;min-width:0}.dispatch-ticket form button{margin:0;width:auto;white-space:nowrap;min-width:120px}
  .ticket-result{grid-column:1/-1;width:100%}
}
@media(max-width:850px){.dispatch-list-viewport{min-height:320px}.dispatch-row,.dispatch-list-head{grid-template-columns:105px minmax(120px,1fr) 65px 125px 24px;gap:8px}.dispatch-search-line small{display:none}}
@media(max-width:650px){
  .dispatch-layout{gap:14px}.dispatch-board{padding:13px}.dispatch-ticket{padding:12px;gap:12px}.dispatch-ticket h2{font-size:18px}.dispatch-ticket form{gap:7px}
  .dispatch-ticket form button{min-width:0;font-size:13px;padding:8px}.dispatch-ticket form button svg{display:none}
  .dispatch-filters{gap:2px}.dispatch-filters button{font-size:13px;padding:7px 9px}
  .dispatch-list-head{display:none}.dispatch-order{height:auto;min-height:132px}
  .dispatch-row{grid-template-columns:92px minmax(0,1fr) 24px;gap:8px;align-items:start;padding:12px 0}
  .dispatch-slot{grid-area:1/1}.dispatch-meal{grid-area:1/2}.dispatch-person{grid-area:2/2}.dispatch-expand{grid-area:1/3}
  .dispatch-slot b small{display:block;margin-top:3px}.dispatch-row .dispatch-person{flex-direction:row;gap:7px;align-items:baseline}
  .dispatch-next{grid-area:3/1/4/4;flex-direction:row!important;align-items:center!important;justify-content:space-between}
  .dispatch-line-status{flex:1}.dispatch-risk{margin-left:5px}.dispatch-next button{min-height:32px}
}
</style>

<style scoped>
.dispatch-date-range{display:flex;align-items:center;gap:6px;flex:none;color:var(--ed-muted);font-size:12px}.dispatch-date-range input{min-width:0;width:137px;border:1px solid var(--ed-rule);background:var(--ed-head);color:var(--ed-ink);border-radius:10px;padding:9px 8px;font:400 13px/20px var(--fn-font);height:40px}.dispatch-search-line>.admin-select{width:155px;flex:none}.dispatch-search-line .ed-search{flex:1;min-width:160px;max-width:none}.dispatch-query-error{display:flex;gap:10px;align-items:center;justify-content:center;font-size:13px;line-height:1.5;color:#ae4837;padding:8px 0;flex:none}.dispatch-exception-actions{display:flex;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--ed-rule)}.dispatch-exception-actions button{flex:1;border:1px solid var(--ed-rule);border-radius:20px;min-height:38px;background:var(--ed-bg);color:#ae5648;font-size:13px}.dispatch-exception-form{border-top:1px solid var(--ed-rule);padding-top:18px;margin-top:18px}.dispatch-exception-form>p{font-size:13px;line-height:1.7;color:var(--ed-muted)}.dispatch-exception-form label{display:block;margin-top:16px;font-size:13px;color:var(--ed-ink)}.dispatch-exception-form textarea{width:100%;resize:vertical;min-height:96px;max-height:160px;border:1px solid var(--ed-rule);border-radius:10px;background:var(--ed-head);color:var(--ed-ink);padding:12px;margin-top:8px;font-size:14px}.dispatch-exception-form>div{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}.dispatch-exception-form>div>button{border:1px solid var(--ed-rule);border-radius:24px;padding:10px 17px;font-size:14px;line-height:20px}.dispatch-exception-back{background:var(--ed-head);color:var(--ed-ink)}.dispatch-exception-confirm{background:#a64738!important;color:white;border-color:transparent!important}.dispatch-exception-form .dispatch-exception-error{color:#ae4837;margin-top:10px}
@media(max-width:1150px){.dispatch-search-line{flex-wrap:wrap}.dispatch-search-line .ed-search{flex-basis:100%;width:100%}.dispatch-search-line>.admin-select{margin-left:auto;flex:1}.dispatch-date-range{flex:1}.dispatch-date-range input{flex:1;width:110px}.dispatch-filters{flex-wrap:wrap}}
@media(max-width:650px){.dispatch-search-line>.admin-select{width:100%;flex-basis:100%}.dispatch-date-range{width:100%}.dispatch-date-range input{width:calc(50% - 15px)}}
</style>
