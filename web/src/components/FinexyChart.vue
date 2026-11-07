<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, AriaComponent, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({ rows: { type: Array, default: () => [] } })
const element = ref(null)
const hasData = computed(() => props.rows.some(row => Number(row.amount) > 0))
let chart
let observer
let frame

/** 收入接口已补齐七天；只强调最高收入日，轴线从零开始并使用真实金额。 */
function draw() {
  if (!chart) return
  const values = props.rows.map(row => Number(row.amount) || 0)
  const peak = values.indexOf(Math.max(...values))
  chart.setOption({
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationDuration: 200,
    aria: { enabled: true },
    grid: { left: 43, right: 14, top: 25, bottom: 33 },
    textStyle: { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif' },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      backgroundColor: '#fff', borderColor: '#e7e9e5',
      textStyle: { color: '#20231e', fontSize: 14 },
      formatter: items => items.length ? items[0].axisValue + ' 核销收入 ¥' + Number(items[0].value).toFixed(2) : '',
    },
    xAxis: {
      type: 'category',
      data: props.rows.map(row => String(row.day).slice(5).replace('-', '/')),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#62675e', fontSize: 13, margin: 14, hideOverlap: true },
    },
    yAxis: {
      type: 'value', min: 0, splitNumber: 4,
      axisLabel: { color: '#73786e', fontSize: 13, formatter: value => value >= 1000 ? (value / 1000) + 'k' : value },
      splitLine: { lineStyle: { color: '#daddd6', type: 'dashed' } },
    },
    series: [{
      name: '核销收入', type: 'bar', barMaxWidth: 38, barWidth: '64%',
      data: values.map((value, index) => ({
        value,
        itemStyle: {
          color: index === peak && value > 0 ? '#b2f538' : '#153e31',
          borderRadius: [8, 8, 8, 8],
        },
      })),
      emphasis: { itemStyle: { color: '#83c91e' } },
    }],
  }, true)
}

watch(() => props.rows, () => nextTick(draw), { deep: true })
onMounted(() => {
  chart = echarts.init(element.value)
  draw()
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => chart?.resize())
  })
  observer.observe(element.value)
})
onUnmounted(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div class="fn-chart-wrap">
    <div ref="element" class="fn-chart" role="img" :aria-label="'七日核销收入，单位元。' + rows.map(row => row.day + '：' + row.amount).join('；')" />
    <p v-if="!hasData" class="fn-chart-empty">近七日暂无核销收入</p>
  </div>
</template>
