import { computed, onMounted, onUnmounted, ref, unref, watch } from 'vue'

/**
 * 按列表实际可用高度分页；serverTotal 存在时保留服务端当前页，仅计算页码和可用行数。
 * @param {import('vue').ComputedRef<Array>} records 已完成搜索、筛选及排序的数据。
 * @param {object} options 行高、表头高度及筛选重置键；这些尺寸需与对应列表样式一致。
 * @returns {{viewport: object, page: object, pageSize: object, total: object, visibleRows: object}} 分页状态与当前页数据。
 */
export function usePagedRows(records, { rowHeight = 64, headerHeight = 44, resetKey, serverTotal } = {}) {
  const viewport = ref(null), page = ref(1), height = ref(0), width = ref(globalThis.innerWidth)
  let observer
  const total = computed(() => serverTotal === undefined ? unref(records).length : Number(unref(serverTotal) || 0))
  const pageSize = computed(() => width.value < 900 || !height.value ? 6 : Math.max(1, Math.min(14, Math.floor((height.value - headerHeight) / rowHeight))))
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const visibleRows = computed(() => serverTotal === undefined ? unref(records).slice((page.value - 1) * pageSize.value, page.value * pageSize.value) : unref(records))
  // 轮询、筛选与窗口缩放都可能改变总页数，始终收敛到有效页，避免空白末页。
  watch(pageCount, count => { page.value = Math.min(page.value, count) }, { flush: 'sync' })
  if (resetKey) watch(resetKey, () => { page.value = 1 })
  watch(viewport, element => {
    observer?.disconnect()
    if (!element) { height.value = 0; return }
    height.value = element.clientHeight
    observer = new ResizeObserver(entries => { height.value = entries[0].target.clientHeight })
    observer.observe(element)
  }, { flush: 'post' })
  const resize = () => { width.value = globalThis.innerWidth }
  onMounted(() => globalThis.addEventListener('resize', resize))
  onUnmounted(() => { observer?.disconnect(); globalThis.removeEventListener('resize', resize) })
  return { viewport, page, pageSize, total, visibleRows }
}
