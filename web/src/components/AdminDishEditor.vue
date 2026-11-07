<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowRight, ImagePlus, LoaderCircle, Trash2, Upload, X } from '@lucide/vue'
import AdminSelect from './AdminSelect.vue'
import { useAdminDialog } from '../composables/useAdminDialog'
import { prepareDishImage } from '../utils/dishImage'
import { api, money } from '../state'
import '../admin-menu.css'

const props = defineProps({ dish: { type: Object, default: null } })
const emit = defineEmits(['close', 'saved', 'deleted'])
const panel = ref(null), picker = ref(null), options = ref({ windows: [], categories: [] })
const loading = ref(true), saving = ref(false), uploading = ref(false), error = ref(''), discarding = ref(false), deleting = ref(false)
const isNew = !props.dish?.id
const form = reactive({ name: '', windowId: '', categoryId: '', price: '', stock: 0, status: 0, image: '', description: '', calories: 0, tags: '', ...props.dish })
let initial = JSON.stringify(form)
const changed = computed(() => JSON.stringify(form) !== initial)
const busy = computed(() => saving.value || uploading.value)
const windows = computed(() => options.value.windows.map(item => ({ value: item.id, label: `${item.canteenName} · ${item.name}` })))
// 原分类已停用时允许保留；新建和换入只展示启用分类，实际规则仍由后端校验。
const categories = computed(() => {
  const list = options.value.categories.filter(item => Number(item.status) === 1 || !isNew && String(item.id) === String(props.dish.categoryId))
  if (!isNew && !list.some(item => String(item.id) === String(props.dish.categoryId))) list.push({ id: props.dish.categoryId, name: props.dish.categoryName, status: 0 })
  return list.map(item => ({ value: item.id, label: item.name + (Number(item.status) === 0 ? '（已停用）' : '') }))
})
const statusOptions = [{ value: 0, label: '已下架' }, { value: 1, label: '在售' }]
const selectedWindow = computed(() => options.value.windows.find(item => String(item.id) === String(form.windowId)))
useAdminDialog(panel, close)

/** 元数据来自真实分类和账号授权窗口；加载失败时保留表单并允许重试。 */
async function loadOptions() {
  loading.value = true; error.value = ''
  try {
    const untouched = JSON.stringify(form) === initial
    options.value = await api('/staff/menu/options')
    if (isNew) {
      if (!form.windowId && windows.value.length === 1) form.windowId = windows.value[0].value
      if (!form.categoryId && categories.value.length) form.categoryId = categories.value[0].value
      if (untouched) initial = JSON.stringify(form)
    }
  } catch (cause) { error.value = cause.message }
  finally { loading.value = false }
}
function close() {
  if (busy.value) return
  if (changed.value) { discarding.value = true; deleting.value = false }
  else emit('close')
}
/** 选图后先压缩再通过同源 multipart 上传，失败时保留原图及所有输入。 */
async function chooseImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value) return
  uploading.value = true; error.value = ''; discarding.value = false
  try {
    const body = new FormData(); body.append('file', await prepareDishImage(file))
    const result = await api('/staff/menu/image', { method: 'POST', body })
    form.image = result.url
  } catch (cause) { error.value = cause.message }
  finally { uploading.value = false }
}
/** 完整维护资料；库存未被用户修改时省略，让后端保留编辑期间已经扣减的最新库存。 */
async function save() {
  if (busy.value || loading.value) return
  error.value = ''; deleting.value = false; discarding.value = false
  if (!form.image) { error.value = '请先上传菜品图片'; panel.value?.querySelector('[aria-label="选择菜品图片"]')?.focus(); return }
  if (!form.windowId || !form.categoryId) { error.value = '请选择食堂窗口和菜品分类'; return }
  saving.value = true
  try {
    const body = { name: form.name.trim(), windowId: Number(form.windowId), categoryId: Number(form.categoryId), price: Number(form.price), status: Number(form.status), image: form.image, description: form.description?.trim() || '', calories: Number(form.calories || 0), tags: form.tags?.trim() || '' }
    if (isNew || Number(form.stock) !== Number(props.dish.stock)) body.stock = Number(form.stock)
    const result = await api(isNew ? '/staff/menu' : `/staff/menu/${props.dish.id}`, { method: isNew ? 'POST' : 'PUT', body })
    emit('saved', result, isNew)
  } catch (cause) { error.value = cause.message }
  finally { saving.value = false }
}
/** 删除需要单独明确确认；服务端仍校验下架、窗口权限和历史引用。 */
async function remove() {
  if (busy.value || isNew) return
  saving.value = true; error.value = ''
  try { await api(`/staff/menu/${props.dish.id}`, { method: 'DELETE' }); emit('deleted') }
  catch (cause) { error.value = cause.message; deleting.value = false }
  finally { saving.value = false }
}
onMounted(loadOptions)
</script>

<template>
  <Teleport to="body">
    <div class="am-backdrop" @click.self="close">
      <form ref="panel" class="am-editor" role="dialog" aria-modal="true" aria-labelledby="dish-editor-title" :aria-busy="busy" @submit.prevent="save">
        <header class="am-dialog-header"><div><span class="am-eyebrow">菜品与库存</span><h2 id="dish-editor-title">{{ isNew ? '新增菜品' : '编辑菜品' }}</h2><p>{{ isNew ? '填写菜品资料，上传图片并设置可售数量。' : '统一维护菜品资料、库存与上架状态。' }}</p></div><button type="button" class="am-close" :disabled="busy" :aria-label="isNew?'关闭新增菜品':'关闭菜品编辑'" @click="close"><X :size="21" /></button></header>
        <div class="am-editor-body">
          <aside class="am-photo-column">
            <input ref="picker" class="am-file-input" type="file" tabindex="-1" accept="image/jpeg,image/png,image/webp" aria-label="上传菜品图片" :disabled="busy" @change="chooseImage" />
            <button type="button" class="am-photo" :class="{'has-image':form.image}" :disabled="busy" aria-label="选择菜品图片" @click="picker.click()"><img v-if="form.image" :src="form.image" alt="菜品图片预览" /><span v-else class="am-photo-placeholder"><ImagePlus :size="34" :stroke-width="1.3" /><b>添加菜品图片</b><small>上传清晰的菜品实拍图</small></span><span v-if="uploading" class="am-photo-loading"><LoaderCircle class="spin" :size="23" />正在上传</span><span v-else-if="form.image" class="am-photo-change"><Upload :size="15" />更换图片</span></button>
            <p class="am-photo-hint">JPG、PNG 或 WebP，原图不超过 10 MB。上传时自动优化尺寸。</p>
            <div class="am-menu-preview"><span>学生端菜单预览</span><h3>{{ form.name || '菜品名称' }}</h3><p>{{ selectedWindow?.name || '所属窗口' }}<i />{{ Number(form.status)===1?'在售':'已下架' }}</p><strong><small>¥</small>{{ money(form.price) }}</strong><span>{{ Number(form.stock)||0 }} 份可售</span></div>
          </aside>
          <div class="am-fields">
            <label>菜品名称 <span class="am-required">*</span><input v-model="form.name" data-initial-focus aria-label="菜品名称" maxlength="32" required placeholder="例如：香菇滑鸡饭" :disabled="busy" /></label>
            <label>所属窗口 <span class="am-required">*</span><AdminSelect v-model="form.windowId" :options="windows" label="所属窗口" :disabled="busy||loading||!isNew||windows.length===1" /></label>
            <div class="am-field-row"><label>菜品分类 <span class="am-required">*</span><AdminSelect v-model="form.categoryId" :options="categories" label="菜品分类" :disabled="busy||loading" /></label><label>上架状态<AdminSelect v-model="form.status" :options="statusOptions" label="上架状态" :disabled="busy" /></label></div>
            <div class="am-field-row"><label>单价（元） <span class="am-required">*</span><input v-model="form.price" aria-label="菜品单价" type="number" min="0.01" max="999" step="0.01" required placeholder="0.00" :disabled="busy" /></label><label>{{ isNew?'初始可售库存':'可售库存' }}（份） <span class="am-required">*</span><input v-model="form.stock" aria-label="可售库存" type="number" min="0" max="10000" step="1" required :disabled="busy" /></label></div>
            <div class="am-field-row"><label>每份能量（千卡）<input v-model="form.calories" aria-label="每份能量" type="number" min="0" max="5000" step="1" placeholder="选填" :disabled="busy" /></label><label>展示标签<input v-model="form.tags" aria-label="展示标签" maxlength="100" placeholder="少油少盐,人气推荐" :disabled="busy" /></label></div>
            <label>菜品介绍<textarea v-model="form.description" aria-label="菜品介绍" maxlength="255" rows="2" placeholder="写下主要食材、口味或适合的人群" :disabled="busy" /></label>
            <p class="am-field-note">{{ isNew?'新菜品默认下架，资料确认后可切换为在售。':'库存仅在数值修改时调整；已有预约的金额与菜品快照保持不变。' }}</p>
            <p v-if="!loading&&!categories.length" class="am-inline-error">尚无启用的菜品分类，请先由全校管理员添加分类。</p>
          </div>
        </div>
        <footer class="am-dialog-footer">
          <p v-if="error" role="alert" class="am-inline-error">{{ error }} <button v-if="!options.windows.length" type="button" class="am-link" @click="loadOptions">重新载入</button></p>
          <div v-if="discarding" class="am-confirm-row"><span>还有未保存的修改。</span><button type="button" class="am-secondary" @click="discarding=false">继续编辑</button><button type="button" class="am-danger" @click="emit('close')">放弃修改</button></div>
          <div v-else-if="deleting" class="am-confirm-row"><span>确认删除「{{ dish.name }}」？</span><button type="button" class="am-secondary" :disabled="busy" @click="deleting=false">取消</button><button type="button" class="am-danger" :disabled="busy" @click="remove">确认删除</button></div>
          <div v-else class="am-footer-actions"><button v-if="!isNew" type="button" class="am-delete" :disabled="busy" @click="deleting=true"><Trash2 :size="15" />删除菜品</button><span v-else class="am-footer-note">{{ loading?'正在载入窗口与分类…':'保存后可在菜单中查看' }}</span><button type="button" class="am-secondary" :disabled="busy" @click="close">取消</button><button type="submit" class="am-primary" :disabled="busy||loading||!categories.length"><LoaderCircle v-if="saving" class="spin" :size="16" />{{ saving?'正在保存…':isNew?'创建菜品':'保存修改' }}<ArrowRight v-if="!saving" :size="17" /></button></div>
        </footer>
      </form>
    </div>
  </Teleport>
</template>
