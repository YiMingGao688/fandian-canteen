<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, CustomChart, LineChart, SankeyChart, ScatterChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, CustomChart, LineChart, SankeyChart, ScatterChart, GraphicComponent, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({ rows: { type: Array, default: () => [] }, kind: { type: String, default: 'trend' } })
const element = ref(null)
const palette = ['#e8ac69', '#72c9b6', '#9a9ae0', '#d87c79', '#85adc9']
const chartNames = { trend: '近七日核销金额走势', sales: '累计核销菜品排名', composition: '核销菜品分类比例', slots: '预约时段名额分布', flow: '各窗口已支付订单状态分布' }
let chart
let observer

function number(value) {
  return Number(value || 0)
}

/** 按同一配色生成图表正面渐变，让自定义立体柱体沿用大屏色板。 */
function faceGradient(top, bottom) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ])
}

/** 绘制各类图表；所有坐标和值均来自只读接口的聚合结果。 */
function render() {
  if (!chart) return
  const tooltip = { trigger: 'item', renderMode: 'richText', backgroundColor: '#202f35', borderColor: '#627267', padding: 12, textStyle: { color: '#e5e9dc', fontFamily: 'Microsoft YaHei', fontSize: 12 } }
  const common = { animation: false, textStyle: { fontFamily: 'Microsoft YaHei, sans-serif', color: '#8ca6a3' }, tooltip }

  if (props.kind === 'sales') {
    const max = Math.max(...props.rows.map(row => number(row.value)), 1)
    const rowHeight = chart.getHeight() / Math.max(props.rows.length, 1)
    const graphic = props.rows.flatMap((row, index) => [
      { type: 'text', left: 0, top: index * rowHeight + 4, silent: true, style: { text: String(index + 1).padStart(2, '0'), fill: index === 0 ? '#f0c78b' : '#54747a', font: 'italic 19px Bahnschrift, sans-serif', textShadowColor: '#d08c4d', textShadowBlur: 8 } },
      { type: 'text', left: 33, top: index * rowHeight + 5, silent: true, style: { text: row.name, fill: index === 0 ? '#eee2cc' : '#a0b6b3', font: '12px Microsoft YaHei', width: Math.max(chart.getWidth() - 78, 30), overflow: 'truncate' } },
      { type: 'text', right: 1, top: index * rowHeight + 3, silent: true, style: { text: String(number(row.value)), fill: index === 0 ? '#f0c184' : '#a9c5bc', font: '17px Bahnschrift, sans-serif', textShadowColor: '#c1824d', textShadowBlur: index === 0 ? 7 : 2 } },
    ])
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, formatter: params => `${params.name}\n核销份数  ${number(props.rows[params.dataIndex]?.value)}` },
      graphic,
      grid: { left: 33, right: 8, top: 24, bottom: 2 },
      xAxis: { type: 'value', show: false, min: 0, max: max * 1.16 },
      yAxis: { type: 'category', show: false, inverse: true, data: props.rows.map(row => row.name) },
      series: [{
        type: 'custom',
        name: '核销份数',
        encode: { x: 0, y: 1 },
        data: props.rows.map(row => ({ name: row.name, value: [number(row.value), row.name] })),
        renderItem(params, api) {
          const value = number(api.value(0))
          if (value <= 0) return null
          const category = api.value(1)
          const start = api.coord([0, category])
          const end = api.coord([value, category])
          const x0 = start[0]
          const x1 = Math.max(x0 + 2, end[0])
          const centerY = start[1]
          const height = Math.min(11, Math.max(6, Math.abs(api.size([0, 1])[1]) * 0.27))
          const dx = 5
          const dy = 4
          const top = centerY - height / 2
          const bottom = centerY + height / 2
          const lead = params.dataIndex === 0
          const front = faceGradient(lead ? '#ffe0a8' : '#b6e1d0', lead ? '#bd793f' : '#47796d')
          return {
            type: 'group',
            children: [
              { type: 'polygon', shape: { points: [[x0, top + 2], [x1, top + 2], [x1 + dx, top - dy + 2], [x1 + dx, bottom - dy + 2], [x0, bottom + 2]] }, style: { fill: '#030a0d99', shadowColor: '#000a', shadowBlur: 6 } },
              { type: 'polygon', shape: { points: [[x1, top], [x1 + dx, top - dy], [x1 + dx, bottom - dy], [x1, bottom]] }, style: { fill: lead ? '#8c5a36' : '#31584f', stroke: '#d8d3b359', lineWidth: 0.7 } },
              { type: 'polygon', shape: { points: [[x0, top], [x1, top], [x1 + dx, top - dy], [x0 + dx, top - dy]] }, style: { fill: lead ? '#ffe1ad' : '#c1e8d8', stroke: '#f4e3bf70', lineWidth: 0.7 } },
              { type: 'rect', shape: { x: x0, y: top, width: Math.max(2, x1 - x0), height }, style: { fill: front, stroke: lead ? '#f8d397' : '#91d0b9', lineWidth: 0.65, shadowColor: lead ? '#da9e5a88' : '#6bc5aa66', shadowBlur: 7 } },
              { type: 'line', shape: { x1: x0 + 1, y1: top + 1, x2: x1 - 1, y2: top + 1 }, style: { stroke: '#fff1d38c', lineWidth: 0.8 } },
            ],
          }
        },
      }],
    }, true)
  } else if (props.kind === 'composition') {
    const total = props.rows.reduce((sum, row) => sum + number(row.value), 0)
    let cursor = 0
    const faces = [
      ['#ffe0a8', '#b9793e', '#83552f'], ['#b8ebdc', '#4a897b', '#31584f'], ['#d3d0ff', '#716daa', '#4d4a7a'], ['#ffd0bc', '#bd6d5f', '#82483f'], ['#cbe6ff', '#5e88a8', '#415d76'],
    ]
    const series = props.rows.map((row, index) => {
      const start = cursor
      cursor += number(row.value)
      const [light, dark, side] = faces[index % faces.length]
      return {
        type: 'custom',
        name: row.name,
        encode: { x: [0, 1], y: 2 },
        data: [{ name: row.name, value: [start, cursor, 0] }],
        renderItem(params, api) {
          const left = api.coord([api.value(0), 0])[0] + 1
          const right = api.coord([api.value(1), 0])[0] - 1
          const centerY = api.coord([0, api.value(2)])[1]
          if (right <= left) return null
          const height = 17
          const depthX = 4
          const depthY = 4
          const top = centerY - height / 2
          const bottom = centerY + height / 2
          return {
            type: 'group',
            children: [
              { type: 'polygon', shape: { points: [[left, bottom], [right, bottom], [right + depthX, bottom + depthY], [left + depthX, bottom + depthY]] }, style: { fill: '#02090d99', shadowColor: '#000b', shadowBlur: 7 } },
              { type: 'polygon', shape: { points: [[right, top], [right + depthX, top - depthY], [right + depthX, bottom + depthY], [right, bottom]] }, style: { fill: side, stroke: '#e8ddc677', lineWidth: 0.7 } },
              { type: 'polygon', shape: { points: [[left, top], [right, top], [right + depthX, top - depthY], [left + depthX, top - depthY]] }, style: { fill: light, stroke: '#fff0c799', lineWidth: 0.7 } },
              { type: 'rect', shape: { x: left, y: top, width: right - left, height }, style: { fill: faceGradient(light, dark), stroke: '#101c21', lineWidth: 0.7, shadowColor: `${dark}88`, shadowBlur: 7 } },
              { type: 'line', shape: { x1: left + 1, y1: top + 1, x2: right - 1, y2: top + 1 }, style: { stroke: '#fff4d89c', lineWidth: 0.8 } },
            ],
          }
        },
      }
    })
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, formatter: params => { const row = props.rows.find(item => item.name === params.seriesName); return `${params.seriesName}\n${number(row?.value)} 份` } },
      graphic: total ? [] : [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: '暂无已核销菜品', fill: '#6b898f', font: '12px Microsoft YaHei' } }],
      grid: { left: 0, right: 5, top: 4, bottom: 8 },
      xAxis: { type: 'value', show: false, min: 0, max: total || 1 },
      yAxis: { type: 'category', show: false, data: ['分类'] },
      series,
    }, true)
  } else if (props.kind === 'flow') {
    const statuses = [
      ['pending', '待接单', '#d9ad67', '#ffe2a5', '#90632f'],
      ['preparing', '备餐中', '#71b8bf', '#c6f0e4', '#376a70'],
      ['ready', '待取餐', '#dc8a73', '#ffd3b7', '#8e5043'],
      ['completed', '已核销', '#75b7a3', '#c9f1d8', '#3c7565'],
    ]
    const links = props.rows.flatMap(row => statuses.map(([key]) => ({ source: `window:${row.id}`, target: `status:${key}`, value: number(row[key]) })).filter(link => link.value > 0))
    const activeWindows = props.rows.filter(row => statuses.some(([key]) => number(row[key]) > 0))
    const nodes = activeWindows.map(row => ({
      name: `window:${row.id}`,
      itemStyle: { color: faceGradient('#c5d2be', '#526d67'), borderColor: '#d5dbc39c', borderWidth: 1, shadowColor: '#5aa99499', shadowBlur: 12, shadowOffsetX: 4, shadowOffsetY: 4 },
      label: { position: 'left', formatter: row.name, color: '#c3d5cc', fontWeight: 500, textShadowColor: '#50b99c88', textShadowBlur: 7 },
    }))
    statuses.forEach(([key, label, color, light, dark]) => {
      const total = props.rows.reduce((sum, row) => sum + number(row[key]), 0)
      if (total) nodes.push({
        name: `status:${key}`,
        itemStyle: { color: faceGradient(light, color), borderColor: `${light}bb`, borderWidth: 1, shadowColor: `${color}aa`, shadowBlur: 11, shadowOffsetX: 4, shadowOffsetY: 4 },
        label: { position: 'right', formatter: `${label}  ${total}`, color: light, fontWeight: 500, textShadowColor: `${dark}cc`, textShadowBlur: 5 },
      })
    })
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, formatter: params => params.dataType === 'edge' ? `订单状态分布：${params.value} 笔` : params.data.label?.formatter || params.name },
      graphic: links.length ? [] : [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: '所选预约日暂无已支付订单', fill: '#6b898f', font: '12px Microsoft YaHei' } }],
      series: [{
        type: 'sankey',
        left: 86,
        right: 72,
        top: 10,
        bottom: 10,
        nodeAlign: 'justify',
        nodeWidth: 13,
        nodeGap: 12,
        layoutIterations: 0,
        draggable: false,
        label: { fontSize: 11, fontFamily: 'Microsoft YaHei' },
        lineStyle: { color: 'target', opacity: 0.38, curveness: 0.52, shadowColor: '#6db9ab77', shadowBlur: 8, shadowOffsetY: 4 },
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.68, shadowBlur: 14 } },
        data: nodes,
        links,
      }],
    }, true)
  } else if (props.kind === 'slots') {
    const peak = Math.max(...props.rows.map(row => number(row.value)), 0)
    chart.setOption({
      ...common,
      grid: { left: 6, right: 13, top: 26, bottom: 25 },
      xAxis: { type: 'category', data: props.rows.map(row => row.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#789b99', fontSize: 11, hideOverlap: true, margin: 13 } },
      yAxis: { type: 'value', show: false, min: 0, max: peak ? peak * 1.32 : 1 },
      graphic: props.rows.length ? [] : [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: '暂无预约占用', fill: '#6b898f', font: '12px Microsoft YaHei' } }],
      series: [
        {
          type: 'custom',
          name: '已占名额',
          encode: { x: 0, y: 1 },
          data: props.rows.map(row => ({ name: row.name, value: [row.name, number(row.value)] })),
          renderItem(params, api) {
            const value = number(api.value(1))
            if (value <= 0) return null
            const base = api.coord([api.value(0), 0])
            const cap = api.coord([api.value(0), value])
            const width = Math.min(19, Math.abs(api.size([1, 0])[0]) * 0.46)
            const left = base[0] - width / 2
            const right = base[0] + width / 2
            const top = cap[1]
            const bottom = base[1]
            const dx = 5
            const dy = 4
            const isPeak = value === peak
            const front = faceGradient(isPeak ? '#ffe0a8' : '#b5e3d2', isPeak ? '#b5783e' : '#437a70')
            return {
              type: 'group',
              children: [
                { type: 'polygon', shape: { points: [[left, bottom + 2], [right, bottom + 2], [right + dx, bottom - dy + 2], [right + dx, top - dy + 2], [left, top + 2]] }, style: { fill: '#02090d99', shadowColor: '#000b', shadowBlur: 7 } },
                { type: 'polygon', shape: { points: [[right, top], [right + dx, top - dy], [right + dx, bottom - dy], [right, bottom]] }, style: { fill: isPeak ? '#8d5d34' : '#315b52', stroke: '#e7dfc583', lineWidth: 0.75 } },
                { type: 'polygon', shape: { points: [[left, top], [right, top], [right + dx, top - dy], [left + dx, top - dy]] }, style: { fill: isPeak ? '#ffe0a8' : '#c5eddf', stroke: '#fff0cc99', lineWidth: 0.8 } },
                { type: 'rect', shape: { x: left, y: top, width, height: Math.max(1, bottom - top) }, style: { fill: front, stroke: isPeak ? '#f2c783' : '#8ecbb6', lineWidth: 0.75, shadowColor: isPeak ? '#dfa85c88' : '#65b49b77', shadowBlur: 8 } },
                { type: 'line', shape: { x1: left + 1, y1: top + 1, x2: right - 1, y2: top + 1 }, style: { stroke: '#fff4d59c', lineWidth: 0.8 } },
              ],
            }
          },
        },
        {
          type: 'scatter',
          name: '名额数值',
          silent: true,
          symbolSize: 2,
          encode: { x: 0, y: 1 },
          data: props.rows.map(row => [row.name, number(row.value)]),
          itemStyle: { opacity: 0 },
          label: { show: true, position: 'top', distance: 8, formatter: params => String(number(params.value[1])), color: '#c6dfd1', fontSize: 11, fontFamily: 'Bahnschrift', textBorderColor: '#17252b', textBorderWidth: 2, textShadowColor: '#6bc2a2', textShadowBlur: 7 },
        },
      ],
    }, true)
  } else {
    const amounts = props.rows.map(row => number(row.amount))
    chart.setOption({
      ...common,
      tooltip: { ...tooltip, trigger: 'axis', valueFormatter: value => `¥ ${number(value).toFixed(2)}` },
      grid: { left: 6, right: 17, top: 17, bottom: 24 },
      xAxis: { type: 'category', boundaryGap: false, data: props.rows.map(row => String(row.day).slice(5)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#718d94', fontSize: 10, hideOverlap: true, margin: 12 } },
      yAxis: { type: 'value', min: 0, max: Math.max(...amounts, 1) * 1.15, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#92ada518', type: 'dashed' } } },
      series: [{
        name: '核销金额',
        type: 'line',
        smooth: 0.32,
        symbol: 'circle',
        symbolSize: (_, params) => params.dataIndex === amounts.length - 1 ? 11 : 7,
        itemStyle: {
          color: new echarts.graphic.RadialGradient(0.28, 0.22, 0.92, [
            { offset: 0, color: '#fff5d7' },
            { offset: 0.24, color: '#d9e8ca' },
            { offset: 0.62, color: '#92c8ae' },
            { offset: 1, color: '#43776c' },
          ]),
          borderColor: '#d9efda',
          borderWidth: 1.2,
          shadowColor: '#8cdbb8cc',
          shadowBlur: 10,
        },
        lineStyle: { width: 4, color: '#82c6ae', shadowColor: '#74c5a799', shadowBlur: 9, shadowOffsetY: 5, cap: 'round' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#9ad8b44a' }, { offset: 0.55, color: '#70bfa81c' }, { offset: 1, color: '#70bfa800' }]) },
        data: amounts,
      }],
    }, true)
  }
}

watch(() => [props.rows, props.kind], render, { deep: true })
onMounted(() => {
  chart = echarts.init(element.value)
  render()
  observer = new ResizeObserver(() => { chart.resize(); render() })
  observer.observe(element.value)
})
onUnmounted(() => { observer?.disconnect(); chart?.dispose() })
</script>

<template><div ref="element" class="screen-chart" role="img" :aria-label="chartNames[kind] || '食堂运营图表'" /></template>
