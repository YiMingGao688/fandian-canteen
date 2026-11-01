<script setup>
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'

const props = defineProps({
  /** 容器语义标签，图表用 section，指标卡可用 article。 */
  as: { type: String, default: 'section' },
  /** core 为核心图表装甲，kpi 为轻量斜切边框，subtle 为次级内凹边框。 */
  level: { type: String, default: 'core', validator: value => ['core', 'kpi', 'subtle'].includes(value) },
  /** 青绿为主结构光，香槟金用于强调指标。 */
  accent: { type: String, default: 'teal', validator: value => ['teal', 'gold'].includes(value) },
  title: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  badge: { type: String, default: '' },
})

const element = ref(null)
const size = ref({ width: 410, height: 354 })
const uid = `metal-panel-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const corners = ['tl', 'tr', 'bl', 'br']
let observer
const compact = computed(() => size.value.width < 340)
const structure = computed(() => ({
  core: { cut: 17, thickness: 5, depth: 2 },
  kpi: { cut: 12, thickness: 3.5, depth: 1.5 },
  subtle: { cut: 8, thickness: 3, depth: 1 },
})[props.level])

/** 所有切角都使用实际像素计算，窗口变化时保留金属边宽和护角比例。 */
function contour(inset = 0) {
  const x = 2 + inset
  const y = 2 + inset
  const right = Math.max(x + 24, size.value.width - 3 - inset)
  const bottom = Math.max(y + 24, size.value.height - 3 - structure.value.depth - inset)
  const cut = Math.max(5, structure.value.cut - inset * 0.45)
  return `M${x + cut} ${y}H${right - cut}L${right} ${y + cut}V${bottom - cut}L${right - cut} ${bottom}H${x + cut}L${x} ${bottom - cut}V${y + cut}Z`
}

const bodyPath = computed(() => contour())
const channelPath = computed(() => contour(structure.value.thickness - 3))
const wellPath = computed(() => contour(structure.value.thickness))
const lipPath = computed(() => {
  const { width, height } = size.value
  const y = height - structure.value.depth - 3
  const cut = structure.value.cut
  return `M2 ${y - cut}V${2 + cut}L${2 + cut} 2H${width - 3 - cut}L${width - 3} ${2 + cut}`
})
const lowerLipPath = computed(() => {
  const { width, height } = size.value
  const y = height - structure.value.depth - 3
  return `M${structure.value.cut + 2} ${y}H${width - structure.value.cut - 3}L${width - 3} ${y - structure.value.cut}`
})
const edgePath = computed(() => {
  const { width, height } = size.value
  return `M${width * 0.28} ${height - structure.value.depth - 7}H${width * 0.72}`
})

onMounted(() => {
  const measure = () => {
    if (!element.value) return
    const bounds = element.value.getBoundingClientRect()
    if (bounds.width && bounds.height) size.value = { width: bounds.width, height: bounds.height }
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(element.value)
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <component :is="as" ref="element" class="mechanical-panel" :class="[`mechanical-panel--${level}`, `mechanical-panel--${accent}`]" :data-compact="compact" :aria-labelledby="title ? `${uid}-title` : undefined">
    <!-- 底部暗侧壁、金属外壳与内凹槽分层绘制，图表始终位于独立内容层。 -->
    <svg class="mechanical-panel__frame" :viewBox="`0 0 ${size.width} ${size.height}`" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <defs>
        <linearGradient :id="`${uid}-shell`" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#657f78" /><stop offset=".12" stop-color="#3f5c60" /><stop offset=".42" stop-color="#203a45" /><stop offset=".74" stop-color="#162d37" /><stop offset="1" stop-color="#4e6c65" />
        </linearGradient>
        <linearGradient :id="`${uid}-body`" x1="0" y1="0" x2=".3" y2="1">
          <stop stop-color="#1b3039" /><stop offset=".52" stop-color="#14242f" /><stop offset="1" stop-color="#10202a" />
        </linearGradient>
        <linearGradient :id="`${uid}-corner`" x1="0" y1="0" x2=".8" y2="1">
          <stop stop-color="#637e77" /><stop offset=".24" stop-color="#405d60" /><stop offset=".72" stop-color="#263f49" /><stop offset="1" stop-color="#1c343f" />
        </linearGradient>
        <linearGradient :id="`${uid}-bevel`" x1="0" y1="0" x2=".2" y2="1">
          <stop stop-color="#9dad99" /><stop offset=".2" stop-color="#71897e" /><stop offset=".6" stop-color="#3b575e" /><stop offset="1" stop-color="#628177" />
        </linearGradient>
        <linearGradient :id="`${uid}-gold`" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#f6e0b5" /><stop offset=".36" stop-color="#d7b582" /><stop offset="1" stop-color="#7c6246" />
        </linearGradient>
      </defs>
      <path :d="bodyPath" :transform="`translate(0 ${structure.depth})`" fill="#07141e" stroke="#030b12" stroke-width="1.5" />
      <path :d="bodyPath" :fill="`url(#${uid}-shell)`" stroke="#94a99b" stroke-opacity=".27" />
      <path :d="channelPath" fill="#091923" stroke="#0a121b" stroke-width="1.3" />
      <path :d="wellPath" :fill="`url(#${uid}-body)`" stroke="#759c92" stroke-opacity=".28" stroke-width=".8" />
      <path :d="lipPath" stroke="#c9d0b2" stroke-opacity=".3" stroke-width=".8" />
      <path :d="lowerLipPath" stroke="#08151f" stroke-width="1.5" />
      <path :d="lowerLipPath" transform="translate(0 1)" stroke="#5b7d77" stroke-opacity=".3" stroke-width=".7" />
      <path :d="edgePath" class="mechanical-panel__edge-track" stroke="#030f16" stroke-width="3" />
      <path :d="edgePath" class="mechanical-panel__edge-light" stroke="currentColor" stroke-width="1.2" stroke-dasharray="22 180" />
      <g v-if="level === 'core'" stroke="#7e9990" stroke-opacity=".42" stroke-width="1">
        <path :d="`M${size.width * .22} ${size.height - 4}h10m4 0h4m4 0h4`" />
        <path :d="`M${size.width * .78} ${size.height - 4}h-10m-4 0h-4m-4 0h-4`" />
      </g>
    </svg>

    <svg v-for="corner in level === 'subtle' ? [] : corners" :key="corner" class="mechanical-panel__corner" :class="`mechanical-panel__corner--${corner}`" viewBox="0 0 76 54" fill="none" aria-hidden="true">
      <!-- 内部护角用窄斜切接片表达装配关系，体量小于屏幕外围装甲。 -->
      <path d="M3 22L22 3H57L64 10H26L10 26V41L3 48Z" fill="#08151f" />
      <path d="M1 19L19 1H55L61 7H23L7 23V39L1 45Z" :fill="`url(#${uid}-corner)`" />
      <path d="M1 19L19 1H55L58 4H21L4 21V42L1 45Z" :fill="`url(#${uid}-bevel)`" />
      <path d="M7 24L24 8H60L63 11H26L10 27V40L7 43Z" fill="#10232e" />
      <path d="M24 3H46L49 6H24Z" :fill="`url(#${uid}-gold)`" />
      <path d="M26 3.3H44" stroke="#ffe7ba" stroke-opacity=".5" stroke-width=".65" />
      <path d="M4.5 26V33" class="mechanical-panel__corner-led" stroke="currentColor" stroke-width="1" />
      <circle cx="13" cy="12" r="2.5" fill="#12232b" /><circle cx="13" cy="12" r="1.5" fill="#617b70" />
      <path d="M12 12H14" stroke="#c3cbb1" stroke-opacity=".65" stroke-width=".6" />
      <path d="M27 10H31M33 10H37" stroke="#648a80" stroke-opacity=".6" stroke-width=".7" />
    </svg>

    <header v-if="title || $slots.heading" class="mechanical-panel__heading">
      <slot name="heading">
        <div class="mechanical-panel__mounts" aria-hidden="true"><i /><i /></div>
        <div class="mechanical-panel__plaque">
          <i class="mechanical-panel__plaque-depth" aria-hidden="true" />
          <i class="mechanical-panel__fastener mechanical-panel__fastener--left" aria-hidden="true" />
          <i class="mechanical-panel__fastener mechanical-panel__fastener--right" aria-hidden="true" />
          <span v-if="eyebrow">{{ eyebrow }}</span>
          <h2 :id="`${uid}-title`">{{ title }}</h2>
        </div>
        <span v-if="badge" class="mechanical-panel__badge">{{ badge }}</span>
      </slot>
    </header>
    <div class="mechanical-panel__content"><slot /></div>
  </component>
</template>

<style scoped>
.mechanical-panel {
  --mp-accent: #77c3b0;
  --mp-corner-width: 56px;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 12px 16px 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  animation: mechanical-panel-arrive .45s ease-out both;
}
.mechanical-panel--gold { --mp-accent: #d8bb87; }
.mechanical-panel__frame {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  filter: drop-shadow(0 2px 2px #02090d80);
}
.mechanical-panel__corner {
  position: absolute;
  z-index: 1;
  width: var(--mp-corner-width);
  height: auto;
  pointer-events: none;
  filter: drop-shadow(0 1px 1px #030b1370);
}
.mechanical-panel__corner--tl { left: 0; top: 0; }
.mechanical-panel__corner--tr { right: 0; top: 0; transform: scaleX(-1); }
.mechanical-panel__corner--bl { left: 0; bottom: 0; transform: scaleY(-1); }
.mechanical-panel__corner--br { right: 0; bottom: 0; transform: scale(-1); }
.mechanical-panel__edge-light { color: var(--mp-accent); opacity: .65; animation: mechanical-edge-travel 14s linear infinite; }
.mechanical-panel__corner-led { color: var(--mp-accent); opacity: .78; }
.mechanical-panel__heading {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 46px;
  min-width: 0;
  margin-bottom: 10px;
}
.mechanical-panel__mounts { position: absolute; inset: -9px 30% 6px; display: flex; justify-content: space-between; pointer-events: none; }
.mechanical-panel__mounts i { width: 5px; background: linear-gradient(90deg, #172b33, #56756d 40%, #243f46); box-shadow: 1px 1px 1px #0005; }
.mechanical-panel__plaque {
  position: relative;
  isolation: isolate;
  width: 208px;
  max-width: calc(100% - 100px);
  padding: 6px 20px 8px;
  text-align: center;
  filter: drop-shadow(0 2px 2px #030c1570);
}
.mechanical-panel__plaque::before,
.mechanical-panel__plaque::after,
.mechanical-panel__plaque-depth {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 9px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 9px), 0 10px);
}
.mechanical-panel__plaque-depth { transform: translateY(2px); background: #0c202a; }
.mechanical-panel__plaque::before { background: linear-gradient(145deg, #9daf9a, #607e76 24%, #2d4b53 51%, #a08b6b 78%, #425f60); }
.mechanical-panel__plaque::after { inset: 1.4px 1.4px 2px; background: linear-gradient(170deg, #3a4f51, #233a42 30%, #172b36 78%); }
.mechanical-panel__plaque > span { display: block; position: relative; margin-bottom: 4px; font: 8px/1.1 'Bahnschrift', 'Segoe UI', sans-serif; color: #c6b18a; letter-spacing: 1.6px; }
.mechanical-panel__plaque h2 { position: relative; color: #f0e7ce; font-size: 17px; font-weight: 600; line-height: 1.25; letter-spacing: 1px; text-shadow: 0 1px 1px #0009; white-space: nowrap; }
.mechanical-panel__fastener { position: absolute; top: 50%; width: 3px; height: 3px; border: 1px solid #b4bd9b80; background: #13232c; border-radius: 50%; box-shadow: 0 1px #050f16; }
.mechanical-panel__fastener--left { left: 9px; }
.mechanical-panel__fastener--right { right: 9px; }
.mechanical-panel__badge { position: absolute; right: 0; top: 17px; padding: 4px 6px; color: #abc0b7; background: #101f29; border-top: 1px solid #6a89815c; font: 9px/1.2 'Microsoft YaHei', sans-serif; white-space: nowrap; }
.mechanical-panel__content { position: relative; z-index: 2; display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.mechanical-panel--kpi { --mp-corner-width: 38px; padding: 12px 15px 15px; }
.mechanical-panel--kpi .mechanical-panel__corner { opacity: .8; }
.mechanical-panel--subtle { padding: 10px 14px 13px; }
.mechanical-panel--subtle .mechanical-panel__edge-light { opacity: .3; animation: none; }
.mechanical-panel[data-compact='true'] { --mp-corner-width: 46px; padding-inline: 15px; }
.mechanical-panel[data-compact='true'] .mechanical-panel__heading { flex-basis: 58px; }
.mechanical-panel[data-compact='true'] .mechanical-panel__plaque { max-width: calc(100% - 16px); }
.mechanical-panel[data-compact='true'] .mechanical-panel__plaque h2 { font-size: 15px; }
.mechanical-panel[data-compact='true'] .mechanical-panel__badge { top: auto; bottom: -8px; padding: 2px 4px; font-size: 8px; }
@keyframes mechanical-edge-travel { to { stroke-dashoffset: -202; } }
@keyframes mechanical-panel-arrive { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .mechanical-panel, .mechanical-panel__edge-light { animation: none; } }
</style>
