<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ArrowRight, KeyRound, X } from '@lucide/vue'
import AdminSelect from './AdminSelect.vue'
import { useAdminDialog } from '../composables/useAdminDialog'
import { api, sameId, state } from '../state'

const props=defineProps({account:Object,windows:Array,mode:{type:String,default:'account'}})
const emit=defineEmits(['close','saved'])
const panel=ref(null),busy=ref(false),error=ref(''),discarding=ref(false)
const isNew=!props.account?.userId,isPassword=props.mode==='password',isSelf=sameId(props.account?.userId,state.account.userId)
const form=reactive({username:'',displayName:'',role:'STAFF',windowId:'',enabled:1,...props.account,password:'',confirmation:''})
if(isNew&&props.windows.length===1)form.windowId=props.windows[0].id
if(form.role!=='STAFF')form.windowId=''
const initial=JSON.stringify(form)
const roleOptions=[{value:'STAFF',label:'窗口工作人员'},{value:'ADMIN',label:'全校管理员'},{value:'SCREEN',label:'只读大屏账号'}]
const statusOptions=[{value:1,label:'启用'},{value:0,label:'停用'}]
const windowOptions=computed(()=>form.role==='STAFF'?props.windows.map(window=>({value:window.id,label:`${window.canteenName} · ${window.name}`})):[{value:'',label:'无需绑定窗口'}])
watch(()=>form.role,value=>{if(value!=='STAFF')form.windowId='';else if(!form.windowId&&props.windows.length===1)form.windowId=props.windows[0].id})
useAdminDialog(panel,close)
function close(){if(busy.value)return;if(JSON.stringify(form)!==initial)discarding.value=true;else emit('close')}
/** 工作资料和密码重置使用独立接口；明文密码仅随本次请求发送，不进入页面列表。 */
async function save(){
  if(busy.value)return;error.value='';discarding.value=false
  if((isNew||isPassword)&&form.password!==form.confirmation){error.value='两次输入的密码不一致';return}
  if(!isPassword&&form.role==='STAFF'&&!form.windowId){error.value='请为窗口工作人员绑定食堂窗口';return}
  busy.value=true
  try{
    const path=isPassword?`/staff/accounts/${props.account.userId}/password`:isNew?'/staff/accounts':`/staff/accounts/${props.account.userId}`
    const body=isPassword?{password:form.password}:{username:form.username.trim(),displayName:form.displayName.trim(),role:form.role,windowId:form.role==='STAFF'?Number(form.windowId):null,enabled:Number(form.enabled),...(isNew?{password:form.password}:{})}
    const result=await api(path,{method:isPassword||isNew?'POST':'PUT',body});emit('saved',result,isPassword?'password':isNew?'created':'updated',isSelf)
  }catch(cause){error.value=cause.message}finally{busy.value=false}
}
</script>

<template><Teleport to="body"><div class="am-backdrop" @click.self="close"><form ref="panel" class="ops-dialog" role="dialog" aria-modal="true" aria-labelledby="account-editor-title" @submit.prevent="save"><header class="am-dialog-header"><div><span class="am-eyebrow">账号与权限</span><h2 id="account-editor-title">{{ isPassword?'重置密码':isNew?'新增工作账号':'编辑工作账号' }}</h2><p>{{ isPassword?`${account.displayName} · ${account.username}`:'为管理人员分配身份和窗口范围。' }}</p></div><button type="button" class="am-close" aria-label="关闭账号编辑" :disabled="busy" @click="close"><X :size="20" /></button></header>
  <div class="ops-form-body am-fields"><template v-if="!isPassword"><div class="am-field-row"><label>登录账号 <span class="am-required">*</span><input v-model="form.username" data-initial-focus aria-label="登录账号" minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]{3,24}" :disabled="busy||!isNew" required placeholder="例如：window04" autocomplete="off" /></label><label>显示名称 <span class="am-required">*</span><input v-model="form.displayName" aria-label="人员显示名称" minlength="2" maxlength="32" required :disabled="busy" placeholder="例如：西区食堂工作人员" /></label></div><div class="am-field-row"><label>工作身份<AdminSelect v-model="form.role" label="工作身份" :options="roleOptions" :disabled="busy||isSelf" /></label><label>账号状态<AdminSelect v-model="form.enabled" label="账号状态" :options="statusOptions" :disabled="busy||isSelf" /></label></div><label>授权窗口<AdminSelect v-model="form.windowId" label="授权窗口" :options="windowOptions" :disabled="busy||form.role!=='STAFF'" /></label><p class="am-field-note">窗口人员只能维护绑定窗口。登录账号创建后不可修改，当前管理员不能停用或降级自己。</p></template>
  <template v-if="isNew||isPassword"><div class="am-field-row"><label>{{ isPassword?'新密码':'初始密码' }} <span class="am-required">*</span><input v-model="form.password" :data-initial-focus="isPassword?'':undefined" aria-label="设置密码" type="password" minlength="8" maxlength="64" required :disabled="busy" autocomplete="new-password" /></label><label>再次输入密码 <span class="am-required">*</span><input v-model="form.confirmation" aria-label="确认密码" type="password" minlength="8" maxlength="64" required :disabled="busy" autocomplete="new-password" /></label></div><p class="am-field-note">密码长度为 8 至 64 位。{{ isPassword?'重置后，该账号原有登录会话失效，需要重新登录。':'请将初始密码交给对应工作人员。' }}</p></template></div>
  <footer class="am-dialog-footer"><p v-if="error" role="alert" class="am-inline-error">{{ error }}</p><div v-if="discarding" class="am-confirm-row"><span>还有未保存的修改。</span><button type="button" class="am-secondary" @click="discarding=false">继续编辑</button><button type="button" class="am-danger" @click="emit('close')">放弃修改</button></div><div v-else class="am-footer-actions"><span class="am-footer-note">{{ isSelf?'当前登录账号':'仅全校管理员可以维护' }}</span><button type="button" class="am-secondary" :disabled="busy" @click="close">取消</button><button class="am-primary" :disabled="busy"><KeyRound v-if="isPassword" :size="16" />{{ busy?'正在保存…':isPassword?'确认重置':isNew?'创建账号':'保存账号' }}<ArrowRight v-if="!isPassword" :size="16" /></button></div></footer>
</form></div></Teleport></template>
