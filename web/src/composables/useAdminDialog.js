import { nextTick, onMounted, onUnmounted } from 'vue'

/** 管理弹层约束键盘焦点；关闭后回到触发按钮，避免键盘操作落入遮罩下的业务表格。 */
export function useAdminDialog(panel, close) {
  let previous, overflow
  function keydown(event) {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close(); return }
    if (event.key !== 'Tab' || !panel.value) return
    const controls = [...panel.value.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.tabIndex >= 0 && el.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  onMounted(async () => {
    previous = document.activeElement; overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', keydown)
    await nextTick()
    const initial=panel.value?.querySelector('[data-initial-focus]:not(:disabled)')||panel.value?.querySelector('button:not(:disabled),input:not(:disabled):not([type=file]),textarea:not(:disabled)')
    initial?.focus({ preventScroll: true })
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow
    if (previous?.isConnected) previous.focus({ preventScroll: true })
  })
}
