<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowRight, Plus, Trash2, X } from '@lucide/vue'
import AdminSelect from './AdminSelect.vue'
import AdminPagination from './AdminPagination.vue'
import { useAdminDialog } from '../composables/useAdminDialog'
import { api, notify } from '../state'
import '../admin-menu.css'

const emit = defineEmits(['close', 'changed'])
const panel = ref(null), categories = ref([]), page = ref(1), loading = ref(true), busy = ref(false), error = ref(''), confirming = ref(false)
const form = reactive({ id: null, name: '', sort: 0, status: 1 })
const pageRows = computed(() => categories.value.slice((page.value - 1) * 6, page.value * 6))
const statusOptions = [{ value: 1, label: '启用' }, { value: 0, label: '停用' }]
useAdminDialog(panel, () => { if (!busy.value) emit('close') })
/** 分类统一读取真实 category 数据，分页只影响本弹层列表展示。 */
async function load() {
  loading.value = true
  try { categories.value = (await api('/staff/menu/options')).categories; page.value = Math.max(1, Math.min(page.value, Math.ceil(categories.value.length / 6))) }
  catch (cause) { error.value = cause.message }
  finally { loading.value = false }
}
function select(item = {}) { Object.assign(form, { id: null, name: '', sort: 0, status: 1 }, item); error.value = ''; confirming.value = false }
/** 更新共享分类后刷新实际选项，错误时不清空正在编辑的内容。 */
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const created = !form.id
    const result = await api(created ? '/staff/menu/categories' : `/staff/menu/categories/${form.id}`, { method: created ? 'POST' : 'PUT', body: { name: form.name.trim(), sort: Number(form.sort), status: Number(form.status) } })
    await load(); select(result); notify(created ? '菜品分类已新增' : '菜品分类已更新'); emit('changed')
    const index = categories.value.findIndex(item => item.id === result.id); if (index >= 0) page.value = Math.floor(index / 6) + 1
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
/** 删除需要确认并由后端再次校验真实引用；不根据前端显示数量直接放行。 */
async function remove() {
  if (busy.value || !form.id) return
  busy.value = true; error.value = ''
  try { await api(`/staff/menu/categories/${form.id}`, { method: 'DELETE' }); await load(); select(); notify('菜品分类已删除'); emit('changed') }
  catch (cause) { error.value = cause.message; confirming.value = false }
  finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <Teleport to="body"><div class="am-backdrop" @click.self="!busy&&emit('close')"><section ref="panel" class="am-category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-manager-title"><header class="am-dialog-header"><div><span class="am-eyebrow">全校共享菜单</span><h2 id="category-manager-title">菜品分类</h2><p>维护全校共用的分类、顺序和启用状态。</p></div><button class="am-close" aria-label="关闭分类管理" :disabled="busy" @click="emit('close')"><X :size="21" /></button></header>
    <div class="am-category-body"><section class="am-category-list"><header><span>{{ categories.length }} 个分类</span><button class="am-link" :disabled="busy" @click="select()"><Plus :size="15" />新增分类</button></header><div class="am-category-rows"><button v-for="category in pageRows" :key="category.id" class="am-category-item" :class="{'is-current':form.id===category.id}" :disabled="busy" @click="select(category)"><span><b>{{ category.name }}</b><small>{{ category.dishCount }} 道菜品 · 排序 {{ category.sort }}</small></span><i :class="{enabled:Number(category.status)===1}">{{ Number(category.status)===1?'启用':'停用' }}</i></button><p v-if="!categories.length" class="am-field-note">{{ loading?'正在读取分类…':'还没有菜品分类' }}</p></div><AdminPagination v-model="page" :total="categories.length" :page-size="6" label="分类分页" unit="个" /></section>
    <form class="am-category-form am-fields" @submit.prevent="save"><h3>{{ form.id?'编辑分类':'新增分类' }}</h3><label>分类名称 <span class="am-required">*</span><input v-model="form.name" data-initial-focus aria-label="分类名称" maxlength="32" placeholder="例如：家常小炒" required :disabled="busy" /></label><label>展示排序<input v-model="form.sort" aria-label="分类排序" type="number" min="0" max="999" step="1" required :disabled="busy" /></label><label>分类状态<AdminSelect v-model="form.status" :options="statusOptions" label="分类状态" :disabled="busy" /></label><p class="am-field-note">数值越小越靠前。停用后无法新增或换入菜品，已有菜品保持原状。</p><p v-if="error" role="alert" class="am-inline-error">{{ error }}</p><div v-if="confirming" class="am-category-confirm"><p>确认删除这个分类？</p><div><button type="button" class="am-secondary" :disabled="busy" @click="confirming=false">取消</button><button type="button" class="am-danger" :disabled="busy" @click="remove">确认删除</button></div></div><div v-else class="am-category-actions"><button v-if="form.id" type="button" class="am-delete" :disabled="busy" @click="confirming=true"><Trash2 :size="15" />删除</button><button class="am-primary" :disabled="busy||loading">{{ busy?'正在保存…':form.id?'保存分类':'创建分类' }}<ArrowRight :size="16" /></button></div></form></div>
  </section></div></Teleport>
</template>
