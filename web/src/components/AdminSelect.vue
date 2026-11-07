<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'

const props = defineProps({
  // 选项值直接交回现有表单：菜品状态为数字，反馈筛选为字符串。
  options: { type: Array, required: true },
  label: { type: String, required: true },
  disabled: Boolean,
})
const model = defineModel({ type: [String, Number] })
const trigger = ref(null), menu = ref(null), opened = ref(false), activeIndex = ref(0)
const listId = 'admin-select-' + useId()
const position = ref({})
const selectedIndex = computed(() => props.options.findIndex(option => String(option.value) === String(model.value)))
const selected = computed(() => props.options[selectedIndex.value])
const activeId = computed(() => opened.value ? listId + '-option-' + activeIndex.value : undefined)

/** 下拉层使用视口定位，空间不足时向上展开；不参与表单排版，也不撑动弹窗。 */
function placeMenu() {
  if (!opened.value || !trigger.value) return
  const box = trigger.value.getBoundingClientRect(), gap = 6, edge = 8
  const width = Math.min(box.width, globalThis.innerWidth - edge * 2)
  const desired = Math.min(240, props.options.length * 40 + 14)
  const below = globalThis.innerHeight - box.bottom - gap - edge
  const above = box.top - gap - edge
  const down = below >= desired || below >= above
  const maxHeight = Math.max(40, Math.min(desired, down ? below : above))
  position.value = {
    left: Math.min(Math.max(edge, box.left), globalThis.innerWidth - width - edge) + 'px',
    top: (down ? box.bottom + gap : Math.max(edge, box.top - gap - maxHeight)) + 'px',
    width: width + 'px', maxHeight: maxHeight + 'px',
  }
}
async function openMenu() {
  if (props.disabled || !props.options.length) return
  activeIndex.value = Math.max(0, selectedIndex.value)
  opened.value = true
  await nextTick()
  placeMenu()
}
function closeMenu(restoreFocus = false) {
  opened.value = false
  if (restoreFocus) trigger.value?.focus({ preventScroll: true })
}
/** 只有明确选择选项才更新 v-model；展开、悬停和键盘浏览均不会提交表单。 */
function choose(index) {
  const option = props.options[index]
  if (!option) return
  model.value = option.value
  closeMenu(true)
}
async function moveTo(index) {
  activeIndex.value = Math.max(0, Math.min(props.options.length - 1, index))
  await nextTick()
  document.getElementById(listId + '-option-' + activeIndex.value)?.scrollIntoView({ block: 'nearest' })
}
function onKeydown(event) {
  if (props.disabled) return
  if (event.key === 'Tab') { closeMenu(); return }
  if (event.key === 'Escape') {
    if (opened.value) { event.preventDefault(); event.stopPropagation(); closeMenu(true) }
    return
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) event.preventDefault()
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!opened.value) openMenu()
    else moveTo(activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1))
  } else if (event.key === 'Home' || event.key === 'End') {
    if (!opened.value) openMenu()
    moveTo(event.key === 'Home' ? 0 : props.options.length - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    if (opened.value) choose(activeIndex.value)
    else openMenu()
  }
}
function outside(event) {
  if (!trigger.value?.contains(event.target) && !menu.value?.contains(event.target)) closeMenu()
}
watch(() => props.disabled, value => { if (value) closeMenu() })
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
  globalThis.addEventListener('resize', placeMenu)
  globalThis.addEventListener('scroll', placeMenu, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside, true)
  globalThis.removeEventListener('resize', placeMenu)
  globalThis.removeEventListener('scroll', placeMenu, true)
})
</script>

<template>
  <div class="admin-select" :class="{'is-open':opened}">
    <button ref="trigger" type="button" class="admin-select-trigger" role="combobox" aria-haspopup="listbox" :aria-label="label" :aria-expanded="opened" :aria-controls="listId" :aria-activedescendant="activeId" :disabled="disabled || !options.length" @click="opened?closeMenu():openMenu()" @keydown="onKeydown"><span>{{ selected?.label || '请选择' }}</span><ChevronDown :size="16" :stroke-width="1.6" /></button>
    <Teleport to="body">
      <div v-if="opened" :id="listId" ref="menu" class="admin-select-menu" role="listbox" :aria-label="label" :style="position">
        <button v-for="(option,index) in options" :id="listId+'-option-'+index" :key="option.value" type="button" class="admin-select-option" :class="{'is-active':activeIndex===index}" role="option" :aria-selected="selectedIndex===index" tabindex="-1" @pointerdown.prevent @pointermove="activeIndex=index" @click="choose(index)"><span>{{ option.label }}</span><i v-if="selectedIndex===index" aria-hidden="true" /></button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 统一管理端下拉外观；焦点保留在触发器，由活动选项属性提供键盘读取位置。 */
.admin-select{min-width:0;width:100%;font-family:var(--fn-font)}
.admin-select .admin-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:42px;padding:10px 12px;background:var(--ed-head);color:var(--ed-ink);border:1px solid var(--ed-rule);border-radius:10px;font-size:14px;line-height:20px;text-align:left;white-space:nowrap;box-shadow:none;transform:none;transition:background-color .15s,border-color .15s,box-shadow .15s}
.admin-select-trigger>span{min-width:0;overflow:hidden;text-overflow:ellipsis}.admin-select-trigger>svg{color:var(--ed-muted);transition:transform .15s}
.admin-select .admin-select-trigger:hover:not(:disabled){border-color:#c7d1c1}
.admin-select.is-open .admin-select-trigger,.admin-select .admin-select-trigger:focus-visible{outline:none;border-color:#9db292;box-shadow:0 0 0 3px #47643e12}
.admin-select .admin-select-trigger:focus:not(:focus-visible){outline:none}
.admin-select.is-open .admin-select-trigger>svg{transform:rotate(180deg)}
.admin-select-menu{position:fixed;z-index:300;box-sizing:border-box;overflow-y:auto;padding:6px;background:var(--ed-head);color:var(--ed-ink);border:1px solid var(--ed-rule);border-radius:12px;box-shadow:0 8px 28px #19301c1a;font-family:var(--fn-font);scrollbar-width:thin}
.admin-select-menu .admin-select-option{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;width:100%;height:40px;padding:8px 10px;border:0;border-radius:7px;background:transparent;color:var(--ed-ink);font:400 14px/20px var(--fn-font);text-align:left;white-space:nowrap;transform:none;box-shadow:none}
.admin-select-option.is-active{background:var(--ed-raised)}
.admin-select-option[aria-selected=true]{color:var(--fn-green);font-weight:500}
.admin-select-option>i{height:5px;width:5px;flex:none;border-radius:50%;background:var(--fn-green)}
@media(prefers-reduced-motion:reduce){.admin-select-trigger,.admin-select-trigger>svg{transition:none}}
</style>
