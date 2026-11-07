<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowRight, ArrowUpRight, ArrowDownToLine, ArrowLeftRight, Download, Maximize2, RefreshCw, Search, X, ChevronDown, ListFilter, Ellipsis, ShoppingBag, CookingPot, Utensils, CircleCheck, Plus, CreditCard, Clock3 } from '@lucide/vue'
import PremiumChart from './PremiumChart.vue'
import AdminPagination from './AdminPagination.vue'
import { usePagedRows } from '../composables/usePagedRows'
import { dateString, money, notify, state } from '../state'

const props = defineProps({ dashboard: { type: Object, default: null }, orders: { type: Array, default: () => [] }, dishes: { type: Array, default: () => [] }, feedback: { type: Array, default: () => [] }, loading: Boolean, scope: { type: String, default: '全校食堂' } })
const emit = defineEmits(['refresh', 'navigate'])
const search = ref(''), status = ref('all'), chartMode = ref('revenue'), focused = ref(false), selectedOrder = ref(null), selectedDish = ref(null)
const searchElement = ref(null), orderDialog = ref(null), dishDialog = ref(null), updatedAt = ref(null), filterMenu = ref(null)
const number = new Intl.NumberFormat('en-US')
// 轮询返回时同步上海营业日期，跨日值班时同时刷新问候语和今日取餐统计。
const today = computed(() => updatedAt.value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(updatedAt.value) : dateString())
const greeting = computed(() => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(updatedAt.value || new Date()))
  return hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
})
const summary = computed(() => props.dashboard?.summary || {})
const revenue = computed(() => Number(summary.value.revenue || 0))
const revenueParts = computed(() => revenue.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.'))
const average = computed(() => Number(summary.value.completed) > 0 ? revenue.value / Number(summary.value.completed) : null)
const trend = computed(() => props.dashboard?.trend || [])
const weekRevenue = computed(() => trend.value.reduce((sum, row) => sum + Number(row.amount || 0), 0))
const stateLabels = { 1: '待支付', 2: '待接单', 3: '备餐中', 4: '待取餐', 5: '已完成', 6: '已取消' }
const stages = computed(() => [
  { key: 'pending', id: '2', name: '待接单', caption: '等待窗口接单', icon: ShoppingBag },
  { key: 'preparing', id: '3', name: '备餐中', caption: '正在用心准备', icon: CookingPot },
  { key: 'ready', id: '4', name: '待取餐', caption: '等待到窗核销', icon: Utensils },
  { key: 'completed', id: '5', name: '已完成', caption: '累计已核销订单', icon: CircleCheck },
].map(stage => ({ ...stage, value: Number(summary.value[stage.key] || 0) })))
const updateLabel = computed(() => updatedAt.value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(updatedAt.value) : '等待载入')
const onSale = computed(() => props.dishes.filter(dish => Number(dish.status) === 1).length)
const completedRate = computed(() => Number(summary.value.totalOrders) > 0 ? Math.min(100, Number(summary.value.completed || 0) / Number(summary.value.totalOrders) * 100) : 0)
const filters = [{ id: 'all', name: '全部预约' }, { id: 'active', name: '进行中' }, ...Object.entries(stateLabels).map(([id, name]) => ({ id, name }))]

/** 销量按菜名汇总；仅唯一匹配时关联当前库存，避免重名菜品跨窗口误配。 */
function catalogDish(name) {
  const matches = props.dishes.filter(dish => dish.name === name)
  return matches.length === 1 ? matches[0] : null
}
const popular = computed(() => (props.dashboard?.sales || []).map(row => ({ ...row, dish: catalogDish(row.name) })).filter(row => row.dish).slice(0, 2))
// 没有核销销量时展示当前在售菜品，并明确使用“在售”标签，不补造销量。
const featuredDishes = computed(() => popular.value.length ? popular.value : props.dishes.filter(dish => Number(dish.status) === 1).slice(0, 2).map(dish => ({ name: dish.name, dish, value: null })))
/** 最近订单接口最多100笔；按今日有效预约的取餐开始时间汇总，不代表全量时段容量。 */
const pickupHours = computed(() => {
  const counts = new Map()
  props.orders.filter(order => order.serviceDate === today.value && [2, 3, 4, 5].includes(Number(order.status))).forEach(order => {
    const time = String(order.startTime || '').slice(0, 5)
    if (/^\d{2}:\d{2}$/.test(time)) counts.set(time, (counts.get(time) || 0) + 1)
  })
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }))
})
const filteredOrders = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return props.orders.filter(order => {
    const correctStatus = status.value === 'all' || (status.value === 'active' ? [2, 3, 4].includes(Number(order.status)) : Number(order.status) === Number(status.value))
    return correctStatus && (!keyword || [order.studentName, order.studentNo, order.number, order.windowName, ...(order.items || []).map(item => item.name)].join(' ').toLocaleLowerCase().includes(keyword))
  })
})
// 概览仅分页当前已载入的近期预约，行数随卡片高度变化，保持字号不变。
const {viewport:recentViewport,page:recentPage,pageSize:recentPageSize,total:recentTotal,visibleRows:pageOrders}=usePagedRows(filteredOrders,{rowHeight:42,headerHeight:40,resetKey:()=>[search.value,status.value]})

/** 仅切换至既有业务模块，接单、库存编辑和取餐核销仍由原有模块处理。 */
function navigate(tab, filter = 'active') { closeOrder(); emit('navigate', { tab, filter }) }
/** 展示接口返回的订单快照；原生对话框负责焦点管理及 Escape 关闭。 */
async function openOrder(order) { selectedOrder.value = order; await nextTick(); orderDialog.value?.showModal() }
function closeOrder() { orderDialog.value?.close(); selectedOrder.value = null }
/** 仅展示精确关联的实际菜品；不通过历史菜名猜测库存归属。 */
async function openDish(row) { if (!row.dish) return; selectedDish.value = row.dish; await nextTick(); dishDialog.value?.showModal() }
function closeDish() { dishDialog.value?.close(); selectedDish.value = null }
function closeBackdrop(event, close) { const box = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) close() }
/** 仅导出当前权限内已载入的经营指标和日趋势，不包含学生个人资料。 */
function exportOverview() {
  if (!props.dashboard) return
  const rows = [['统计口径', '值'], ['累计核销收入（元）', revenue.value], ['累计核销订单（笔）', summary.value.completed || 0], ['核销客单价（元）', average.value === null ? '' : average.value.toFixed(2)], ['今日预约（笔）', summary.value.todayOrders || 0], ['待接单', summary.value.pending || 0], ['制作中', summary.value.preparing || 0], ['待取餐', summary.value.ready || 0], [], ['下单日期', '已核销收入（元）'], ...trend.value.map(row => [row.day, row.amount])]
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `饭点-经营概览-${today.value}.csv`; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify('已导出当前管理范围的经营概览')
}
function focusSearch(event) { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable && !orderDialog.value?.open && !dishDialog.value?.open) { event.preventDefault(); searchElement.value?.focus() } }
watch(() => props.dashboard, value => { if (value) updatedAt.value = new Date() }, { immediate: true })
watch(focused, value => document.body.classList.toggle('premium-focus', value))
onMounted(() => document.addEventListener('keydown', focusSearch))
onUnmounted(() => { document.removeEventListener('keydown', focusSearch); document.body.classList.remove('premium-focus') })
</script>

<template>
  <article class="premium-overview fn-overview ed-page" :aria-busy="loading">
    <header class="fn-welcome">
      <div><h1>{{ greeting }}，{{ state.account?.displayName?.split(' · ')[0] || '管理员' }}</h1><p>把每一餐安排妥当，让校园的烟火日常有条不紊。</p></div>
      <div class="edition-tools"><span class="pd-sync"><i />{{ loading ? '正在更新' : updatedAt ? '更新于 ' + updateLabel : '尚未载入' }}</span><button title="导出经营概览" aria-label="导出经营概览" :disabled="!dashboard" @click="exportOverview"><Download :size="16" /></button><button title="刷新经营数据" aria-label="刷新经营数据" :disabled="loading" @click="emit('refresh')"><RefreshCw :size="16" :class="{spin:loading}" /></button><button :title="focused?'退出专注视图':'进入专注视图'" :aria-label="focused?'退出专注视图':'进入专注视图'" :aria-pressed="focused" @click="focused=!focused"><Maximize2 :size="16" /></button></div>
    </header>

    <div class="fn-dashboard-grid">
      <section class="fn-card fn-balance" aria-label="收入与营业摘要">
        <div class="fn-balance-heading"><h2>累计核销收入</h2><span class="fn-currency"><span>¥</span> CNY <ChevronDown :size="11" /></span></div>
        <div class="pd-revenue-number" :class="{'is-long':revenueParts[0].length>8}"><span>¥</span><strong>{{ dashboard ? revenueParts[0] : '—' }}</strong><small v-if="dashboard">.{{ revenueParts[1] }}</small></div>
        <p class="fn-balance-note"><span><ArrowUpRight :size="13" />已核销</span>仅计入已完成取餐的订单</p>
        <div class="fn-balance-actions"><button @click="navigate('orders','2')"><ArrowLeftRight :size="15" />处理预约</button><button @click="navigate('orders','4')"><ArrowDownToLine :size="15" />取餐核销</button></div>
        <!-- 摘要只保留业务标签与数值；统计口径通过标题说明，避免将说明文字缩到不可读。 -->
        <div class="fn-wallets">
          <h3>营业摘要 <span>· {{ scope }}</span></h3>
          <dl class="edition-facts">
            <div><dt><i class="fn-fact-dot lime" />今日新预约</dt><dd>{{ dashboard ? number.format(summary.todayOrders || 0) : '—' }}<small>笔</small></dd></div>
            <div title="累计核销收入除以已核销订单数"><dt><i class="fn-fact-dot green" />核销客单价</dt><dd><small v-if="average!==null">¥</small>{{ average===null ? '—' : money(average) }}</dd></div>
            <div><dt><i class="fn-fact-dot dark" />在售菜品</dt><dd>{{ number.format(onSale) }}<small>道</small></dd></div>
          </dl>
        </div>
      </section>

      <section class="fn-card fn-metrics" aria-label="预约处理概况"><button v-for="(stage,index) in stages" :key="stage.id" class="fn-metric" :class="{'fn-metric-featured':index===0}" :data-stage="stage.id" :aria-label="'处理'+stage.name+'预约'" @click="navigate('orders',stage.id)"><span class="fn-metric-heading">{{ stage.name }}<i><component :is="stage.icon" :size="15" :stroke-width="1.5" /></i></span><strong>{{ dashboard ? number.format(stage.value) : '—' }}<small>笔</small></strong><span class="fn-metric-caption"><i><ArrowUpRight v-if="index===3" :size="10" /><Clock3 v-else :size="10" /></i>{{ stage.caption }}</span></button></section>

      <section class="fn-card fn-income ed-trend"><h2>{{ chartMode==='revenue' ? '收入趋势' : '取餐时段' }}</h2><p class="fn-card-description">{{ chartMode==='revenue' ? '每一日的经营，都清晰可见' : '今日已载入预约的取餐时间分布' }}</p><div class="fn-chart-panel"><header><div class="ed-switch" aria-label="趋势图类型"><button :aria-pressed="chartMode==='revenue'" @click="chartMode='revenue'">近七日</button><button :aria-pressed="chartMode==='pickup'" @click="chartMode='pickup'">取餐</button></div><div class="fn-chart-legend"><span><i />{{ chartMode==='revenue'?'收入':'预约' }}</span><span><i />峰值</span></div></header><PremiumChart :kind="chartMode" :rows="chartMode==='revenue' ? trend : pickupHours" :loading="loading" /></div><p class="fn-chart-note">{{ chartMode==='revenue' ? '七日核销合计 ¥' + money(weekRevenue) : '最近100笔中的今日有效预约' }}</p></section>

      <div class="fn-bottom-side">
        <section class="fn-card fn-progress"><header><h2>订单核销进度</h2><span>{{ completedRate.toFixed(0) }}%</span></header><div class="fn-progress-track" role="progressbar" aria-label="累计订单核销比例" :aria-valuenow="Number(completedRate.toFixed(1))" aria-valuemin="0" aria-valuemax="100"><i :style="{width:completedRate+'%'}" /></div><p><span><b>{{ number.format(summary.completed || 0) }}</b> 笔已核销</span><span>共 {{ number.format(summary.totalOrders || 0) }} 笔预约</span></p></section>
        <section class="fn-card fn-popular"><header><h2><span><CreditCard :size="16" /></span>{{ popular.length ? '窗口热销' : '窗口在售' }}</h2><button @click="navigate('menu')"><Plus :size="12" />管理菜品</button></header><div v-if="featuredDishes.length" class="fn-dish-tiles"><button v-for="(row,index) in featuredDishes" :key="row.dish.id" class="fn-dish-tile edition-feature" :class="{'fn-dish-tile-green':index===1}" :aria-label="'查看'+row.dish.name+'详情'" @click="openDish(row)"><img v-if="row.dish.image" :src="row.dish.image" alt="" /><span class="fn-dish-shade" /><span class="fn-dish-top"><span><i />{{ Number(row.dish.status)===1?'在售':'已下架' }}</span><ArrowUpRight :size="15" /></span><span class="fn-dish-bottom"><strong>{{ row.name }}</strong><span>{{ row.dish.windowName }}</span><b>{{ row.value===null ? '¥'+money(row.dish.price) : number.format(row.value)+' 份已核销' }}</b></span></button></div><p v-else class="ed-empty">当前暂无在售菜品</p></section>
      </div>

      <section class="fn-card fn-recent ed-recent"><header class="fn-recent-heading"><h2>近期预约</h2><div class="fn-table-tools"><label class="ed-search"><Search :size="15" /><input ref="searchElement" v-model="search" aria-label="搜索近期预约" placeholder="搜索预约" /></label><details ref="filterMenu" class="fn-filter"><summary :class="{'is-filtered':status!=='all'}">{{ status==='all'?'筛选':filters.find(item=>item.id===status)?.name }}<ListFilter :size="14" /></summary><div><button v-for="filter in filters" :key="filter.id" :aria-pressed="status===filter.id" @click="status=filter.id;filterMenu.open=false">{{ filter.name }}</button></div></details></div></header>
        <!-- 编号作为首列；状态统一在状态列展示，去掉没有选择功能的装饰性勾选标记。 -->
        <div ref="recentViewport" class="ed-table-wrap">
          <table class="ed-table fn-orders-table">
            <thead><tr><th>订单编号</th><th>预约菜品</th><th>金额</th><th>状态</th><th>取餐时间</th><th aria-label="详情" /></tr></thead>
            <tbody>
              <tr v-for="order in pageOrders" :key="order.id">
                <td><button class="fn-order-number" :title="order.number" @click="openOrder(order)">{{ order.number }}</button></td>
                <td><span class="fn-table-meal"><span class="fn-meal-icon" :data-status="order.status"><Utensils :size="13" /></span><span :title="(order.items||[]).map(item=>item.name).join('、')">{{ (order.items||[]).map(item=>item.name).join('、') || order.windowName }}</span></span></td>
                <td class="fn-table-money">¥{{ money(order.amount) }}</td>
                <td><span class="pd-status" :data-status="order.status"><i />{{ stateLabels[Number(order.status)] || '状态未知' }}</span></td>
                <td class="fn-table-time"><span>{{ String(order.serviceDate || '').slice(5).replace('-','/') }}</span> {{ String(order.startTime || '').slice(0,5) }}</td>
                <td><button class="fn-row-more" :aria-label="'查看'+order.studentName+'的预约详情'" @click="openOrder(order)"><Ellipsis :size="17" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!filteredOrders.length" class="fn-orders-empty"><ShoppingBag :size="26" :stroke-width="1.2" /><p>{{ loading?'正在载入预约':search?'没有匹配的预约':'当前没有这类预约' }}</p><button v-if="search" class="ed-link" @click="search=''">清除搜索</button></div>
        <AdminPagination v-model="recentPage" :total="recentTotal" :page-size="recentPageSize" label="近期预约分页" unit="笔" scope-label="已载入"><button class="ed-link fn-all-orders" @click="navigate('orders',status)">全部订单<ArrowUpRight :size="13" /></button></AdminPagination>
      </section>
    </div>

    <dialog ref="orderDialog" class="pd-dialog" aria-labelledby="pd-order-title" @close="selectedOrder=null" @click="closeBackdrop($event,closeOrder)"><template v-if="selectedOrder"><header><h2 id="pd-order-title">预约详情</h2><button class="pd-close" aria-label="关闭预约详情" @click="closeOrder"><X :size="19" /></button></header><div class="pd-dialog-content"><span class="pd-status" :data-status="selectedOrder.status"><i />{{ stateLabels[Number(selectedOrder.status)] }}</span><h3>{{ selectedOrder.studentName }}</h3><dl><dt>订单号</dt><dd>{{ selectedOrder.number }}</dd><dt>取餐窗口</dt><dd>{{ selectedOrder.canteenName }} · {{ selectedOrder.windowName }}</dd><dt>取餐时间</dt><dd>{{ selectedOrder.serviceDate }}<br />{{ selectedOrder.startTime }} – {{ selectedOrder.endTime }}</dd><dt>订单金额</dt><dd>¥ {{ money(selectedOrder.amount) }}</dd><dt>备注</dt><dd>{{ selectedOrder.remark || '无特殊备注' }}</dd></dl><ul class="pd-detail-items"><li v-for="item in selectedOrder.items || []" :key="item.id || item.name"><span>{{ item.name }}</span><b>× {{ item.number }}</b></li></ul><button class="pd-dialog-primary" @click="navigate('orders',String(selectedOrder.status))">前往订单处理<ArrowRight :size="16" /></button></div></template></dialog>
    <dialog ref="dishDialog" class="pd-dialog" aria-labelledby="pd-dish-title" @close="selectedDish=null" @click="closeBackdrop($event,closeDish)"><template v-if="selectedDish"><header><h2 id="pd-dish-title">{{ selectedDish.name }}</h2><button class="pd-close" aria-label="关闭菜品详情" @click="closeDish"><X :size="19" /></button></header><div class="pd-dialog-content"><img v-if="selectedDish.image" class="pd-detail-image" :src="selectedDish.image" :alt="selectedDish.name" /><dl><dt>所属窗口</dt><dd>{{ selectedDish.windowName }}</dd><dt>单价</dt><dd>¥ {{ money(selectedDish.price) }}</dd><dt>可售库存</dt><dd>{{ selectedDish.stock }} 份</dd><dt>状态</dt><dd>{{ Number(selectedDish.status)===1?'在售':'已下架' }}</dd></dl><button class="pd-dialog-primary" @click="closeDish();navigate('menu')">前往菜品与库存<ArrowRight :size="16" /></button></div></template></dialog>
  </article>
</template>
