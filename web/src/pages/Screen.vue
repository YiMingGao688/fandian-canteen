<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowUpRight, Clock3, LayoutDashboard, Leaf, MapPin, Maximize, Minimize, RefreshCw, ShieldCheck, Ticket } from '@lucide/vue'
import ScreenChart from '../components/ScreenChart.vue'
import MechanicalPanel from '../components/MechanicalPanel.vue'
import { state, api, money, dateString, statusText } from '../state'
import '../screen.css'

const CanteenScene = defineAsyncComponent(() => import('../components/CanteenScene.vue'))
const data = ref(null)
const error = ref('')
const date = ref(dateString(1))
const clock = ref(new Date())
const full = ref(false)
const loading = ref(false)
const selectedWindowId = ref(null)
const allowed = computed(() => ['ADMIN', 'SCREEN'].includes(state.account?.role))
const summary = computed(() => data.value?.summary || {})
const usage = computed(() => data.value?.slotUsage || {})
const windows = computed(() => data.value?.windows || [])
const focusedWindow = computed(() => windows.value.find(window => window.id === selectedWindowId.value) || windows.value[0])
const ratio = computed(() => Number(usage.value.capacity) ? (100 * Number(usage.value.occupied) / Number(usage.value.capacity)).toFixed(1) : '0.0')
const time = computed(() => clock.value.toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }))
const day = computed(() => clock.value.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', timeZone: 'Asia/Shanghai' }))
const slots = computed(() => (data.value?.slots || []).filter(row => Number(row.value) > 0))
const peakSlot = computed(() => [...slots.value].sort((a, b) => Number(b.value) - Number(a.value))[0])
const categories = computed(() => data.value?.preferences || [])
const categoryTotal = computed(() => categories.value.reduce((sum, row) => sum + Number(row.value), 0))
const todayRevenue = computed(() => Number(data.value?.trend?.at(-1)?.amount || 0))
const weekRevenue = computed(() => (data.value?.trend || []).reduce((sum, row) => sum + Number(row.amount), 0))
const lastSync = computed(() => data.value?.updatedAt ? String(data.value.updatedAt).slice(11, 19) : '--:--:--')
const categoryColors = ['#e8ac69', '#72c9b6', '#9a9ae0', '#d87c79', '#85adc9']
const metrics = computed(() => [
  { label: '今日预约订单', value: summary.value.todayOrders || 0, unit: '笔', note: '按下单日期统计', featured: true },
  { label: '累计核销金额', value: money(summary.value.revenue), unit: '元', note: '已取餐订单金额' },
  { label: '累计已核销', value: summary.value.completed || 0, unit: '笔', note: '已完成取餐' },
  { label: '等待取餐', value: summary.value.ready || 0, unit: '笔', note: '当前全校待取餐' },
  { label: '预约名额占用', value: ratio.value, unit: '%', note: `${date.value} 预约日` },
])
const windowStates = computed(() => [
  { key: 'pending', label: '待接单', value: focusedWindow.value?.pending || 0 },
  { key: 'preparing', label: '备餐中', value: focusedWindow.value?.preparing || 0 },
  { key: 'ready', label: '待取餐', value: focusedWindow.value?.ready || 0 },
  { key: 'completed', label: '已核销', value: focusedWindow.value?.completed || 0 },
])

/** 只读取全校聚合接口，刷新失败时保留最后一次成功数据。 */
async function load() {
  if (!allowed.value) return
  loading.value = true
  try {
    data.value = await api(`/screen/overview?date=${date.value}`)
    error.value = ''
  } catch (exception) {
    error.value = exception.message
  } finally {
    loading.value = false
  }
}

function login() {
  state.loginRole = 'SCREEN'
  state.loginOpen = true
}

/** 保持浏览器全屏状态与工具栏文案一致，支持按 Esc 退出。 */
function syncFullscreen() { full.value = !!document.fullscreenElement }
async function toggleFull() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen()
}

watch(windows, rows => {
  if (!rows.some(window => window.id === selectedWindowId.value)) selectedWindowId.value = rows[0]?.id ?? null
})
watch([() => state.account?.userId, date], load)
let refreshTimer
let clockTimer
onMounted(() => {
  load()
  refreshTimer = setInterval(load, 15000)
  clockTimer = setInterval(() => { clock.value = new Date() }, 1000)
  document.addEventListener('fullscreenchange', syncFullscreen)
})
onUnmounted(() => {
  clearInterval(refreshTimer)
  clearInterval(clockTimer)
  document.removeEventListener('fullscreenchange', syncFullscreen)
})
</script>

<template>
  <div class="operations-screen">
    <div class="screen-frame" aria-hidden="true">
      <div class="frame-rim frame-rim-top" /><div class="frame-rim frame-rim-bottom" />
      <div v-for="side in ['left', 'right']" :key="side" :class="`frame-spine frame-spine-${side}`"><i /><i /><i /></div>
      <!-- 护角以顶面、倒角和侧面分层绘制厚度，装饰层保持鼠标穿透。 -->
      <svg v-for="corner in ['tl', 'tr', 'bl', 'br']" :key="corner" :class="`frame-corner frame-corner-${corner}`" viewBox="0 0 130 76" fill="none">
        <defs>
          <linearGradient :id="`corner-face-${corner}`" x1="4" y1="0" x2="72" y2="74" gradientUnits="userSpaceOnUse"><stop stop-color="#5e7474" /><stop offset=".32" stop-color="#354b50" /><stop offset="1" stop-color="#192b34" /></linearGradient>
          <linearGradient :id="`corner-bevel-${corner}`" x1="0" y1="0" x2="0" y2="68" gradientUnits="userSpaceOnUse"><stop stop-color="#a3afa0" /><stop offset=".16" stop-color="#6b7e77" /><stop offset=".5" stop-color="#2e4349" /><stop offset="1" stop-color="#587272" /></linearGradient>
          <linearGradient :id="`corner-light-${corner}`" x1="32" y1="10" x2="94" y2="10" gradientUnits="userSpaceOnUse"><stop stop-color="#7a644b" /><stop offset=".45" stop-color="#eac28b" /><stop offset="1" stop-color="#ba905b" /></linearGradient>
        </defs>
        <path d="M5 8H105L122 25V34H39L29 44V72H5Z" fill="#080f17" />
        <path d="M20 32L30 23H116V27L34 28L25 38V67L20 62Z" fill="#0b1720" />
        <path d="M0 0H102L116 14V24H31L21 34V63H0Z" :fill="`url(#corner-face-${corner})`" />
        <path d="M0 0H102L116 14H109L99 5H5V58L0 63Z" :fill="`url(#corner-bevel-${corner})`" />
        <path d="M5 58H17V32L29 20H111L116 24H31L21 34V63H0Z" fill="#0c1b24" />
        <path d="M8 8H97L106 16H29L12 33V53H8Z" stroke="#819187" stroke-opacity=".24" />
        <path d="M31 9H91L95 13H31Z" :fill="`url(#corner-light-${corner})`" />
        <path d="M33 10H89" stroke="#ffe1a8" stroke-opacity=".65" />
        <circle cx="12" cy="13" r="4" fill="#101f28" /><circle cx="12" cy="13" r="2.8" fill="#405657" /><path d="M10.5 12.5H13.5" stroke="#a5afa0" stroke-opacity=".6" />
        <path d="M10 41V49M14 37V45" stroke="#74908b" stroke-opacity=".45" />
      </svg>
      <span class="frame-axis frame-axis-left">HEXU / DINING INTELLIGENCE</span><span class="frame-axis frame-axis-right">CAMPUS OPERATIONS · 01</span>
    </div>
    <header class="screen-header">
      <div class="screen-brand"><span class="screen-brand-mark"><Leaf :size="27" /></span><div><p>HEXU · CAMPUS DINING</p><h1>禾序 <span>智慧食堂运营中心</span></h1></div></div>
      <div class="screen-header-right">
        <span class="screen-connection" :class="{ offline: error }"><i />{{ error ? '同步异常' : data ? '数据已同步' : '连接中' }}</span>
        <div class="screen-clock"><strong>{{ time }}</strong><small>{{ day }}</small></div>
        <nav class="screen-toolbar" aria-label="大屏工具">
          <RouterLink to="/admin" target="_blank" rel="noopener" title="管理后台"><LayoutDashboard :size="17" /><span>管理后台</span></RouterLink>
          <button :disabled="loading || !allowed" title="刷新数据" @click="load"><RefreshCw :size="17" :class="{ spin: loading }" /><span>刷新</span></button>
          <button :title="full ? '退出全屏' : '全屏展示'" @click="toggleFull"><component :is="full ? Minimize : Maximize" :size="17" /><span>{{ full ? '退出全屏' : '全屏展示' }}</span></button>
        </nav>
      </div>
    </header>

    <section v-if="!allowed" class="screen-login">
      <span><ShieldCheck :size="38" /></span><p>DINING OPERATIONS</p><h2>让一餐的运行，清晰可见。</h2>
      <div>登录展示账号，查看全校窗口与预约运营数据。</div>
      <button @click="login">登录展示大屏<ArrowUpRight :size="18" /></button>
      <small>体验账号：canteen_screen / Campus@2026</small>
    </section>

    <template v-else>
      <p v-if="error" class="screen-error">{{ error }} · 正在展示最近一次同步结果</p>
      <section class="screen-metrics" aria-label="全校关键指标">
        <MechanicalPanel v-for="metric in metrics" :key="metric.label" as="article" class="screen-metric-frame" level="kpi" :accent="metric.featured ? 'gold' : 'teal'" :class="{ 'metric-featured': metric.featured }">
          <div class="metric-label"><i v-if="metric.featured" />{{ metric.label }}</div>
          <strong>{{ metric.value }}<small>{{ metric.unit }}</small></strong>
          <p>{{ metric.note }}</p>
        </MechanicalPanel>
      </section>

      <div class="screen-layout">
        <aside class="screen-left">
          <MechanicalPanel class="screen-trend-panel screen-panel-framed" title="近七日核销走势" eyebrow="01 / REVENUE" badge="近 7 日" level="core" accent="teal">
            <div class="screen-trend-figure"><span>今日核销金额</span><strong><small>¥</small>{{ money(todayRevenue) }}</strong><p>七日合计 <b>¥ {{ money(weekRevenue) }}</b></p></div>
            <ScreenChart :rows="data?.trend || []" />
            <p class="screen-chart-note">已取餐订单金额 · 按下单日期汇总</p>
          </MechanicalPanel>
          <MechanicalPanel class="screen-panel screen-sales-panel" title="人气菜品" eyebrow="02 / POPULAR MENU" badge="TOP 06" level="core" accent="gold">
            <ScreenChart kind="sales" :rows="data?.sales || []" />
            <p class="screen-chart-note">按累计核销份数排序</p>
          </MechanicalPanel>
        </aside>

        <main class="screen-center">
          <section class="screen-hero">
            <div class="screen-hero-heading"><div><span><i />SERVICE LANDSCAPE</span><h2>全校窗口运行态势</h2></div><div class="screen-day-switch"><button :class="{ active: date === dateString() }" @click="date = dateString()">今日</button><button :class="{ active: date === dateString(1) }" @click="date = dateString(1)">明日</button></div></div>
            <CanteenScene :windows="windows" :selected-id="focusedWindow?.id" @select="selectedWindowId = $event" />
            <div v-if="focusedWindow" class="screen-window-focus">
              <div class="screen-window-title"><p>{{ focusedWindow.canteenName }}<span> / </span><MapPin :size="11" />{{ focusedWindow.location }}</p><h3>{{ focusedWindow.name }}<small>有效预约 <b>{{ focusedWindow.reservations }}</b> 笔</small></h3></div>
              <div class="screen-window-states"><div v-for="item in windowStates" :key="item.key" :class="`state-${item.key}`"><span><i />{{ item.label }}</span><strong>{{ item.value }}</strong></div></div>
            </div>
          </section>
          <MechanicalPanel class="screen-panel screen-flow-panel" title="窗口订单分布" eyebrow="03 / ORDER DISTRIBUTION" :badge="`${date} · 预约日`" level="subtle" accent="teal">
            <ScreenChart kind="flow" :rows="windows" />
          </MechanicalPanel>
        </main>

        <aside class="screen-right">
          <MechanicalPanel class="screen-panel screen-category-panel" title="用餐偏好" eyebrow="04 / DINING MIX" badge="累计核销" level="core" accent="gold">
            <div class="screen-category-total"><strong>{{ categoryTotal }}<small>份</small></strong><span>菜品核销总量</span></div>
            <ScreenChart kind="composition" :rows="categories" />
            <div class="screen-category-legend"><div v-for="(category, index) in categories" :key="category.name"><i :style="{ '--category-tone': categoryColors[index % categoryColors.length] }" /><span>{{ category.name }}</span><b>{{ category.value }}<small>份</small></b><em>{{ categoryTotal ? (Number(category.value) / categoryTotal * 100).toFixed(1) : '0.0' }}%</em></div></div>
            <p v-if="!categories.length" class="screen-empty">暂无已核销菜品</p>
          </MechanicalPanel>
          <MechanicalPanel class="screen-panel screen-slots-panel" title="取餐节奏" eyebrow="05 / PICKUP RHYTHM" :badge="date === dateString() ? '今日' : '明日'" level="core" accent="teal">
            <div class="screen-peak-slot"><div><span>预约最集中的时段</span><strong>{{ peakSlot?.name || '--:--' }}</strong></div><p v-if="peakSlot"><b>{{ peakSlot.value }}</b>个名额</p><p v-else>暂无占用</p></div>
            <ScreenChart kind="slots" :rows="slots" />
            <div class="screen-capacity"><span>名额使用 <b>{{ usage.occupied || 0 }} / {{ usage.capacity || 0 }}</b></span><span>{{ usage.publishedSlots || 0 }} 个已发布时段</span></div>
          </MechanicalPanel>
        </aside>
      </div>

      <section class="screen-activity" aria-label="最近订单动态"><div class="screen-activity-heading"><Ticket :size="16" /><span>最近动态</span></div><div class="screen-activity-grid"><article v-for="activity in (data?.activity || []).slice(0, 4)" :key="`${activity.orderSuffix}-${activity.orderTime}`"><i :class="`activity-status-${activity.status}`" /><span>{{ activity.windowName }}</span><b>{{ statusText(activity.status) }}</b><small><Clock3 :size="10" />{{ activity.orderTime }}</small></article></div><span class="screen-live-caption">LOCAL DEMO</span></section>
      <footer class="screen-footer"><span><ShieldCheck :size="12" />只读运营展示 · 不含学生个人信息 · 本地演示数据</span><span>最近同步 {{ lastSync }} <i /> 每 15 秒刷新</span></footer>
    </template>
  </div>
</template>
