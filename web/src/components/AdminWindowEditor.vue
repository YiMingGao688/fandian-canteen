<script setup>
import { reactive, ref } from 'vue'
import { ArrowRight, X } from '@lucide/vue'
import AdminSelect from './AdminSelect.vue'
import { useAdminDialog } from '../composables/useAdminDialog'
import { api, state } from '../state'
const props=defineProps({window:Object})
const emit=defineEmits(['close','saved'])
const panel=ref(null),busy=ref(false),error=ref(''),discarding=ref(false),isNew=!props.window?.id
const form=reactive({canteenName:'',name:'',location:'',description:'',capacity:12,openingHours:'07:00-09:00 / 11:00-13:20 / 17:00-19:20',enabled:0,...props.window})
const initial=JSON.stringify(form),statusOptions=[{value:1,label:'开放预约'},{value:0,label:'暂停预约'}]
useAdminDialog(panel,close)
function close(){if(busy.value)return;if(JSON.stringify(form)!==initial)discarding.value=true;else emit('close')}
/** 营业区间由后端校验并用于学生预约；暂停后已有订单仍可继续接单、备餐与核销。 */
async function save(){
  if(busy.value)return;busy.value=true;error.value='';discarding.value=false
  try{
    const body={canteenName:form.canteenName.trim(),name:form.name.trim(),location:form.location.trim(),description:form.description?.trim()||'',capacity:Number(form.capacity),openingHours:form.openingHours.trim(),enabled:Number(form.enabled)}
    const result=await api(isNew?'/staff/settings/windows':`/staff/settings/windows/${props.window.id}`,{method:isNew?'POST':'PUT',body});emit('saved',result,isNew)
  }catch(cause){error.value=cause.message}finally{busy.value=false}
}
</script>
<template><Teleport to="body"><div class="am-backdrop" @click.self="close"><form ref="panel" class="ops-dialog" role="dialog" aria-modal="true" aria-labelledby="window-editor-title" @submit.prevent="save"><header class="am-dialog-header"><div><span class="am-eyebrow">窗口与营业</span><h2 id="window-editor-title">{{ isNew?'新增食堂窗口':'编辑食堂窗口' }}</h2><p>维护取餐位置、营业时间和预约状态。</p></div><button type="button" class="am-close" aria-label="关闭窗口编辑" :disabled="busy" @click="close"><X :size="20" /></button></header><div class="ops-form-body am-fields"><div class="am-field-row"><label>所属食堂 <span class="am-required">*</span><input v-model="form.canteenName" data-initial-focus aria-label="所属食堂" required maxlength="40" :disabled="busy||state.account.role!=='ADMIN'" placeholder="例如：一食堂" /></label><label>窗口名称 <span class="am-required">*</span><input v-model="form.name" aria-label="窗口名称" required maxlength="40" :disabled="busy" placeholder="例如：家常小炒" /></label></div><label>取餐位置 <span class="am-required">*</span><input v-model="form.location" aria-label="取餐位置" required maxlength="120" :disabled="busy" placeholder="例如：一层东侧 3 号窗口" /></label><label>营业时间 <span class="am-required">*</span><input v-model="form.openingHours" aria-label="营业时间" required maxlength="80" :disabled="busy" placeholder="07:00-09:00 / 11:00-13:20" /></label><p class="am-field-note">最多四段，每段至少二十分钟，不跨午夜。调整后只在新营业区间内接受预约，已有预约继续保留。</p><div class="am-field-row"><label>每时段默认容量（笔）<input v-model="form.capacity" aria-label="时段默认容量" type="number" min="1" max="200" step="1" required :disabled="busy" /></label><label>营业状态<AdminSelect v-model="form.enabled" label="营业状态" :options="statusOptions" :disabled="busy" /></label></div><label>窗口介绍<textarea v-model="form.description" aria-label="窗口介绍" rows="2" maxlength="240" :disabled="busy" /></label><p class="am-field-note">容量设置对新发布时段生效，已有时段容量和名额保持不变。暂停预约后，已有订单仍可接单、备餐和核销。</p></div><footer class="am-dialog-footer"><p v-if="error" role="alert" class="am-inline-error">{{ error }}</p><div v-if="discarding" class="am-confirm-row"><span>还有未保存的修改。</span><button type="button" class="am-secondary" @click="discarding=false">继续编辑</button><button type="button" class="am-danger" @click="emit('close')">放弃修改</button></div><div v-else class="am-footer-actions"><span class="am-footer-note">{{ isNew?'新窗口默认暂停预约':'营业设置保存后生效' }}</span><button type="button" class="am-secondary" :disabled="busy" @click="close">取消</button><button class="am-primary" :disabled="busy">{{ busy?'正在保存…':isNew?'创建窗口':'保存窗口' }}<ArrowRight :size="16" /></button></div></footer></form></div></Teleport></template>
