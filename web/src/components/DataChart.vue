<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, PieChart, BarChart, GraphicComponent, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({ rows: { type: Array, default: () => [] }, kind: { type: String, default: 'trend' } })
const element = ref(null)
let chart
let observer

/** 为管理概览的三类经营图表统一使用深绿、暖橙和清晰的数值提示。 */
function render() {
  if (!chart) return
  const textColor = '#66736a'
  const ink = '#25332b'
  const tooltip = {
    trigger: props.kind === 'pie' ? 'item' : 'axis',
    backgroundColor: '#fffefa',
    borderColor: '#dfe4d9',
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: ink, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 12 },
    extraCssText: 'box-shadow:0 8px 24px rgba(27,42,32,.12);border-radius:8px;',
  }
  const common = { animationDuration: 260, animationDurationUpdate: 200, textStyle: { color: textColor, fontFamily: 'Microsoft YaHei, sans-serif' }, tooltip }

  if (props.kind === 'pie') {
    const total = props.rows.reduce((sum, row) => sum + Number(row.value || 0), 0)
    const colors = ['#285b43', '#87a36d', '#d38b4c', '#9aafa2', '#b9a28b', '#657d70']
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, formatter: params => `${params.name}<br/>核销量　<b>${Number(params.value || 0)}</b> 份（${params.percent}%）` },
      graphic: total ? [
        { type: 'text', left: 'center', top: '39%', silent: true, style: { text: String(total), fill: ink, font: '600 25px Bahnschrift, Microsoft YaHei, sans-serif', textAlign: 'center' } },
        { type: 'text', left: 'center', top: '55%', silent: true, style: { text: '已核销份数', fill: textColor, font: '11px Microsoft YaHei, sans-serif', textAlign: 'center' } },
      ] : [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: '暂无分类核销数据', fill: textColor, font: '12px Microsoft YaHei, sans-serif' } }],
      legend: { bottom: 0, left: 'center', itemWidth: 8, itemHeight: 8, itemGap: 14, icon: 'circle', textStyle: { color: '#526056', fontSize: 11 } },
      series: [{
        name: '品类核销',
        type: 'pie',
        radius: ['55%', '74%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        stillShowZeroSum: false,
        minAngle: 3,
        itemStyle: { borderRadius: 3, borderColor: '#fffefa', borderWidth: 3 },
        label: { show: false },
        emphasis: { scale: true, scaleSize: 5, itemStyle: { shadowBlur: 12, shadowColor: '#344a3b33' } },
        data: props.rows.map((row, index) => ({ name: row.name, value: Number(row.value || 0), itemStyle: { color: colors[index % colors.length] } })),
      }],
    }, true)
  } else if (props.kind === 'bar') {
    const max = Math.max(...props.rows.map(row => Number(row.value || 0)), 1)
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, formatter: params => `${params.name}<br/>已核销销量　<b>${Number(params.value || 0)}</b> 份` },
      grid: { top: 8, right: 42, bottom: 8, left: 116, containLabel: false },
      xAxis: { type: 'value', min: 0, max: max * 1.18, show: false, splitLine: { show: false } },
      yAxis: {
        type: 'category',
        inverse: true,
        data: props.rows.map(row => row.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#46564b',
          fontSize: 11,
          margin: 14,
          formatter: name => `${String(props.rows.findIndex(row => row.name === name) + 1).padStart(2, '0')}   ${name}`,
        },
      },
      graphic: props.rows.length ? [] : [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: '暂无已核销菜品', fill: textColor, font: '12px Microsoft YaHei, sans-serif' } }],
      series: [{
        name: '已核销销量',
        type: 'bar',
        barWidth: 13,
        showBackground: true,
        backgroundStyle: { color: '#edf0e9', borderRadius: [0, 5, 5, 0] },
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
          color: params => params.dataIndex === 0 ? '#c87837' : '#47765a',
          shadowColor: '#2c503826',
          shadowBlur: 4,
          shadowOffsetY: 2,
        },
        label: { show: true, position: 'right', distance: 9, color: '#35473b', fontSize: 11, fontWeight: 600, formatter: params => `${params.value} 份` },
        emphasis: { itemStyle: { shadowBlur: 9, shadowColor: '#395c4533' } },
        data: props.rows.map(row => Number(row.value || 0)),
      }],
    }, true)
  } else {
    const amounts = props.rows.map(row => Number(row.amount || 0))
    const max = Math.max(...amounts, 1)
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, valueFormatter: value => `¥ ${Number(value || 0).toFixed(2)}` },
      grid: { top: 19, right: 16, bottom: 30, left: 54 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: props.rows.map(row => String(row.day || '').slice(5)),
        axisLine: { lineStyle: { color: '#dfe4db' } },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 10, margin: 12, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: max * 1.12,
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 10, formatter: value => `¥${value}` },
        splitLine: { lineStyle: { color: '#e9ece5', type: 'dashed', width: 1 } },
      },
      graphic: props.rows.length ? [] : [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: '暂无趋势数据', fill: textColor, font: '12px Microsoft YaHei, sans-serif' } }],
      series: [{
        name: '已核销金额',
        type: 'line',
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: true,
        lineStyle: { color: '#285b43', width: 3, shadowColor: '#285b4322', shadowBlur: 5, shadowOffsetY: 3 },
        itemStyle: { color: '#fffefa', borderColor: '#285b43', borderWidth: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#426d4d28' }, { offset: 1, color: '#426d4d00' }]) },
        emphasis: { scale: 1.5, itemStyle: { color: '#d38b4c', borderColor: '#fffefa', borderWidth: 2 } },
        data: amounts,
      }],
    }, true)
  }
}

watch(() => [props.rows, props.kind], render, { deep: true })
onMounted(() => {
  chart = echarts.init(element.value)
  render()
  observer = new ResizeObserver(() => chart.resize())
  observer.observe(element.value)
})
onUnmounted(() => { observer?.disconnect(); chart?.dispose() })
</script>

<template><div ref="element" class="data-chart" role="img" :aria-label="kind==='pie'?'已核销品类占比':kind==='trend'?'近七日已核销金额趋势':'热门菜品销量排行'" /></template>
