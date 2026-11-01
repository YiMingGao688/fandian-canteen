<script setup>
import { computed } from 'vue'
import { ArrowRight, CircleCheck, Clock3, Flame, Wallet } from '@lucide/vue'
import DataChart from './DataChart.vue'
import { money, statusClass, statusText } from '../state'

const props = defineProps({ dashboard: { type: Object, default: null }, orders: { type: Array, default: () => [] } })
const emit = defineEmits(['orders'])
const summary = computed(() => props.dashboard?.summary || {})
const categories = computed(() => props.dashboard?.preferences || [])
const categoryTotal = computed(() => categories.value.reduce((total, row) => total + Number(row.value || 0), 0))
const weekRevenue = computed(() => (props.dashboard?.trend || []).reduce((total, row) => total + Number(row.amount || 0), 0))
const queue = computed(() => [
  { key: 'pending', label: '待接单', value: Number(summary.value.pending || 0) },
  { key: 'preparing', label: '备餐中', value: Number(summary.value.preparing || 0) },
  { key: 'ready', label: '待取餐', value: Number(summary.value.ready || 0) },
])
const processingOrders = computed(() => queue.value.reduce((total, item) => total + item.value, 0))
</script>

<template>
  <div class="overview-bento">
    <article class="overview-card overview-revenue-card">
      <div class="overview-card-topline"><span>经营表现 <i>01</i></span><Wallet :size="18" /></div>
      <h2>累计核销收入</h2>
      <strong class="overview-revenue-value"><small>¥</small>{{ money(summary.revenue) }}</strong>
      <p class="overview-revenue-caption"><CircleCheck :size="14" />仅统计已完成取餐订单</p>
      <div class="overview-revenue-meta">
        <div><span>今日预约</span><b>{{ summary.todayOrders || 0 }}<small>笔</small></b></div>
        <div><span>累计核销</span><b>{{ summary.completed || 0 }}<small>单</small></b></div>
      </div>
    </article>

    <article class="overview-card overview-queue-card">
      <div class="overview-card-topline"><span>订单处理 <i>02</i></span><span class="overview-live"><i />实时状态</span></div>
      <div class="overview-queue-total"><strong>{{ processingOrders }}</strong><span>笔处理中</span></div>
      <p class="overview-queue-caption">待接单、备餐及等待取餐</p>
      <div class="overview-queue-meter" aria-label="处理中订单状态比例">
        <i v-for="item in queue" :key="item.key" :class="`queue-${item.key}`" :style="{ width: processingOrders ? `${item.value / processingOrders * 100}%` : '0%' }" />
      </div>
      <div class="overview-queue-breakdown">
        <div v-for="item in queue" :key="item.key" :class="`queue-text-${item.key}`"><span>{{ item.label }}</span><b>{{ item.value }}</b></div>
      </div>
    </article>

    <article class="overview-card overview-trend-card">
      <header class="overview-card-heading">
        <div><span>近七日 · 核销金额</span><h2>经营趋势</h2></div>
        <div class="overview-trend-total"><b>¥ {{ money(weekRevenue) }}</b><small>近 7 日合计</small></div>
      </header>
      <DataChart :rows="dashboard?.trend || []" />
    </article>

    <article class="overview-card overview-sales-card">
      <header class="overview-card-heading">
        <div><span>TOP 06 · 已核销份数</span><h2><Flame :size="17" />热门菜品</h2></div>
        <span class="overview-card-note">按销量排序</span>
      </header>
      <DataChart kind="bar" :rows="dashboard?.sales || []" />
    </article>

    <article class="overview-card overview-category-card">
      <header class="overview-card-heading">
        <div><span>DINING MIX</span><h2>品类偏好</h2></div>
        <span class="overview-category-total">{{ categoryTotal }}<small>份</small></span>
      </header>
      <DataChart kind="pie" :rows="categories" />
    </article>

    <article class="overview-card overview-orders-card">
      <header class="overview-card-heading">
        <div><span>正在进行</span><h2>近期预约</h2></div>
        <button class="overview-all-orders" @click="emit('orders')">全部订单<ArrowRight :size="15" /></button>
      </header>
      <div v-if="!orders.length" class="overview-orders-empty"><Clock3 :size="20" /><span>当前没有进行中的预约</span></div>
      <div v-for="order in orders.slice(0, 4)" :key="order.id" class="overview-order-row">
        <span class="overview-order-avatar">{{ order.studentName.slice(0, 1) }}</span>
        <div class="overview-order-info"><b>{{ order.studentName }}</b><span>{{ order.startTime }} – {{ order.endTime }} · ¥{{ money(order.amount) }}</span></div>
        <span class="status-badge" :class="statusClass(order.status)">{{ statusText(order.status) }}</span>
      </div>
    </article>
  </div>
</template>
