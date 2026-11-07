<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, AriaComponent, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({ rows: { type: Array, default: () => [] }, kind: { type: String, default: 'revenue' }, loading: Boolean })
const element = ref(null)
const hasData = computed(() => props.rows.some(row => Number(props.kind === 'revenue' ? row.amount : row.value) > 0))
let chart, observer, themeObserver, frame, reducedMotion
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

/** 依据当前真实数据选择刻度上界，不让空图出现小数金额的假坐标。 */
function axisScale(values, integral) {
  const max = Math.max(1,...values)
  const magnitude = 10 ** Math.floor(Math.log10(max / 3))
  const interval = [1, 2, 2.5, 5, 10].map(v => v*magnitude).find(v => v >= max/3 && (!integral || Number.isInteger(v))) || Math.max(1,magnitude*10)
  return { interval, max: Math.ceil(max / interval)*interval }
}

/** 单个柱形只代表实际收入或预约笔数；青柠斜纹和深色峰值复用参考图视觉，不补造利润序列。 */
function draw() {
  if (!chart) return
  const revenue = props.kind === 'revenue'
  const values = props.rows.map(row => Number(revenue ? row.amount : row.value) || 0)
  const labels = props.rows.map(row => revenue ? String(row.day).slice(5).replace('-', '/') : row.label)
  const peak = values.indexOf(Math.max(...values))
  const format = value => number.format(value)
  const dark = document.body.classList.contains('admin-dark')
  const muted = dark ? '#b7c1b1' : '#77806f'
  const points = values.map((value,index) => ({ value, itemStyle:{
    color:index===peak && value>0 ? (dark ? '#c5d1bc' : '#25271f') : '#acf42f',borderRadius:4,
    decal:index===peak ? null : {symbol:'rect',symbolSize:1,dashArrayX:[1,0],dashArrayY:[1,4],rotation:-Math.PI/4,color:'rgba(65,112,14,.16)'}
  }}))
  chart.setOption({
    backgroundColor:'transparent', animation:!reducedMotion?.matches, animationDuration:180, animationDurationUpdate:150,
    aria:{enabled:true}, textStyle:{fontFamily:'Inter, Noto Sans SC, Source Han Sans SC, Microsoft YaHei, sans-serif'},
    grid:{top:20, right:5, bottom:12, left:1, containLabel:true},
    tooltip:{trigger:'axis', renderMode:'richText', confine:true, backgroundColor:dark?'#29322a':'#fff', borderColor:dark?'#414b40':'#e8ebe3',
      textStyle:{color:dark?'#eef3e8':'#25271f',fontSize:14}, axisPointer:{type:'shadow',shadowStyle:{color:'rgba(86,125,57,.055)'}},
      formatter:items=>items.length ? items[0].axisValue+'   '+format(items[0].value)+(revenue?' 元':' 笔') : ''},
    xAxis:{type:'category',data:labels,axisTick:{show:false},axisLine:{show:false},
      axisLabel:{color:muted,fontSize:12,margin:12,hideOverlap:true}},
    yAxis:{type:'value',min:0,...axisScale(values,!revenue),axisLabel:{fontSize:12,color:muted,formatter:value=>value>=1000?format(value/1000)+'k':format(value)},
      splitLine:{lineStyle:{color:dark?'#444d40':'#e5e7e1',type:'dashed'}},axisTick:{show:false}},
    series:[{name:revenue?'核销收入（元）':'有效预约（笔）',type:'bar',barWidth:'62%',barMaxWidth:44,data:points,emphasis:{itemStyle:{color:'#87d421'}}}]
  },true)
}

watch(() => [props.rows, props.kind], () => nextTick(draw), { deep: true })
onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  chart = echarts.init(element.value)
  draw()
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (element.value?.clientWidth) chart?.resize() })
  })
  observer.observe(element.value)
  themeObserver = new MutationObserver(draw)
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
})
onUnmounted(() => { cancelAnimationFrame(frame); observer?.disconnect(); themeObserver?.disconnect(); chart?.dispose() })
</script>

<template>
  <div class="pd-chart-shell">
    <div ref="element" class="pd-chart" :class="{ 'chart-inactive': !hasData }" role="img" :aria-label="(kind === 'revenue' ? '按下单日统计的核销收入，元。' : '已载入有效预约，笔。') + rows.map(row => kind === 'revenue' ? row.day + ' ' + row.amount : row.label + ' ' + row.value).join('；')" />
    <div v-if="!hasData" class="pd-chart-empty"><b>{{ loading ? '正在读取数据' : kind === 'revenue' ? '近七日暂无核销收入' : '今日暂无已载入的有效预约' }}</b><span v-if="!loading && kind === 'revenue'">完成取餐后，收入将归入该订单的下单日期。</span></div>
  </div>
</template>
