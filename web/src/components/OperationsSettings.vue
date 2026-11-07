<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { KeyRound, Pencil, Plus, RefreshCw, Search, UserRound } from '@lucide/vue'
import { useRouter } from 'vue-router'
import BusinessReports from './BusinessReports.vue'
import AdminAccountEditor from './AdminAccountEditor.vue'
import AdminWindowEditor from './AdminWindowEditor.vue'
import AdminPagination from './AdminPagination.vue'
import AdminSelect from './AdminSelect.vue'
import { usePagedRows } from '../composables/usePagedRows'
import { api, logout, notify, sameId, state } from '../state'
import '../admin-menu.css'
import '../admin-operations.css'

const emit=defineEmits(['changed']),router=useRouter(),reportPanel=ref(null)
const isAdmin=computed(()=>state.account?.role==='ADMIN'),section=ref('windows'),windows=ref([]),accounts=ref([]),accountTotal=ref(0)
const loading=ref(false),accountsLoading=ref(false),error=ref(''),pending=ref(''),accountEdit=ref(null),windowEdit=ref(null)
const keyword=ref(''),searchTerm=ref(''),role=ref(''),enabled=ref('')
const {viewport:windowViewport,page:windowPage,pageSize:windowPageSize,total:windowTotal,visibleRows:windowRows}=usePagedRows(windows,{rowHeight:72,headerHeight:44})
const {viewport:accountViewport,page:accountPage,pageSize:accountPageSize,visibleRows:accountRows}=usePagedRows(accounts,{rowHeight:72,headerHeight:44,serverTotal:accountTotal,resetKey:()=>[searchTerm.value,role.value,enabled.value]})
const roleOptions=[{value:'',label:'全部身份'},{value:'STAFF',label:'窗口工作人员'},{value:'ADMIN',label:'全校管理员'},{value:'SCREEN',label:'只读大屏账号'}]
const statusOptions=[{value:'',label:'全部状态'},{value:1,label:'启用'},{value:0,label:'停用'}]
const roleName=value=>({ADMIN:'全校管理员',STAFF:'窗口工作人员',SCREEN:'只读大屏账号'}[value]||value)
let delay,requestNumber=0,controller
watch(keyword,value=>{clearTimeout(delay);delay=setTimeout(()=>{searchTerm.value=value.trim()},200)})
/** 工作账号查询由后端分页，快速筛选时中止旧请求，防止旧结果覆盖新条件。 */
async function loadAccounts(){
  if(!isAdmin.value||section.value!=='accounts')return
  controller?.abort();controller=new AbortController();const number=++requestNumber
  accountsLoading.value=true;error.value=''
  try{
    const params=new URLSearchParams({page:String(accountPage.value),pageSize:String(accountPageSize.value)})
    if(searchTerm.value)params.set('keyword',searchTerm.value);if(role.value)params.set('role',role.value);if(enabled.value!=='')params.set('enabled',String(enabled.value))
    const result=await api('/staff/accounts?'+params,{signal:controller.signal})
    if(number===requestNumber){accountTotal.value=Number(result.total);accounts.value=result.records||[]}
  }catch(cause){if(cause.name!=='AbortError'&&number===requestNumber)error.value=cause.message}
  finally{if(number===requestNumber)accountsLoading.value=false}
}
async function loadWindows(){loading.value=true;error.value='';try{windows.value=await api('/staff/settings/windows')}catch(cause){error.value=cause.message}finally{loading.value=false}}
async function refresh(){if(section.value==='reports'){await reportPanel.value?.load();return}await Promise.all([loadWindows(),loadAccounts()])}
/** 快速开关只发送 enabled，不把列表中的旧资料带回去覆盖管理员刚完成的编辑。 */
async function toggle(item,kind){
  if(pending.value)return;pending.value=kind+String(item.userId||item.id)
  try{
    await api(kind==='account'?`/staff/accounts/${item.userId}/status`:`/staff/settings/windows/${item.id}/status`,{method:'PUT',body:{enabled:Number(item.enabled)===1?0:1}})
    notify(kind==='account'?(Number(item.enabled)===1?'工作账号已停用':'工作账号已启用'):(Number(item.enabled)===1?'窗口已暂停预约':'窗口已恢复预约'))
    await refresh();emit('changed')
  }catch(cause){notify(cause.message,true)}finally{pending.value=''}
}
async function accountSaved(account,kind,self){
  accountEdit.value=null
  if(kind==='password'&&self){logout(false);notify('密码已更新，请重新登录');await router.replace('/admin/login');return}
  notify(kind==='password'?'密码已重置，原登录会话已失效':kind==='created'?'工作账号已创建':'账号资料已更新')
  if(kind==='created'){keyword.value=account.username;searchTerm.value=account.username;accountPage.value=1;await nextTick()}
  await loadAccounts();emit('changed')
}
async function windowSaved(window,created){windowEdit.value=null;notify(created?'食堂窗口已创建':'营业设置已保存');await loadWindows();try{state.windows=await api('/public/windows')}catch{/* 保存已完成，公开目录会在重新打开学生端时再同步。 */}emit('changed')}
watch([section,accountPage,accountPageSize,searchTerm,role,enabled],loadAccounts)
onMounted(loadWindows)
onUnmounted(()=>{clearTimeout(delay);controller?.abort();requestNumber++})
</script>

<template><article class="ops-page ed-page"><header class="edition-heading"><div><div class="edition-context">{{ isAdmin?'全校运营管理':'当前窗口管理' }}</div><h1>运营设置</h1></div><div class="edition-tools"><button title="刷新运营设置" :disabled="loading||accountsLoading" @click="refresh"><RefreshCw :size="15" :class="{spin:loading||accountsLoading}" />刷新</button></div></header><section class="ops-panel fn-list-panel">
  <header class="ops-toolbar"><div class="ops-tabs" aria-label="运营设置分类"><button :aria-pressed="section==='windows'" @click="section='windows'">窗口与营业</button><button :aria-pressed="section==='reports'" @click="section='reports'">经营报表</button><button v-if="isAdmin" :aria-pressed="section==='accounts'" @click="section='accounts'">工作账号</button></div><button v-if="isAdmin&&section!=='reports'" class="am-primary" @click="section==='windows'?windowEdit={}:accountEdit={account:null,mode:'account'}"><Plus :size="16" />{{ section==='windows'?'新增窗口':'新增工作账号' }}</button></header>
  <template v-if="section==='windows'"><div class="ops-caption"><span>{{ isAdmin?'管理食堂窗口、营业时间和预约状态':'维护绑定窗口的营业时间、取餐位置和预约状态' }}</span><span>{{ windows.filter(window=>Number(window.enabled)===1).length }} / {{ windows.length }} 个窗口开放预约</span></div><div ref="windowViewport" class="fn-list-viewport data-table-wrap"><table class="data-table ops-window-table"><thead><tr><th>食堂窗口</th><th>取餐位置</th><th>营业时间</th><th>默认容量</th><th>营业状态</th><th>操作</th></tr></thead><tbody><tr v-for="window in windowRows" :key="window.id"><td><b class="ops-primary-text">{{ window.name }}</b><small>{{ window.canteenName }}</small></td><td><span class="ops-ellipsis" :title="window.location">{{ window.location }}</span></td><td><span class="ops-hours" :title="window.openingHours">{{ window.openingHours }}</span></td><td>{{ window.capacity }} <small class="ops-inline-note">笔 / 时段</small></td><td><button class="ops-status-toggle" :class="{on:Number(window.enabled)===1}" :disabled="!!pending" :aria-label="`${Number(window.enabled)===1?'暂停':'恢复'}${window.name}预约`" @click="toggle(window,'window')"><i aria-hidden="true" /><span>{{ Number(window.enabled)===1?'开放':'暂停' }}</span></button></td><td><button class="text-button" :aria-label="'编辑窗口'+window.name" @click="windowEdit={...window}"><Pencil :size="14" />编辑</button></td></tr></tbody></table><p v-if="!windowTotal" class="fn-list-empty">{{ loading?'正在载入窗口…':'当前没有可维护的窗口' }}</p></div><AdminPagination v-model="windowPage" :total="windowTotal" :page-size="windowPageSize" label="窗口分页" unit="个" /></template>
  <BusinessReports v-else-if="section==='reports'" ref="reportPanel" /><template v-else><div class="ops-account-filters"><label class="ed-search"><Search :size="16" /><input v-model="keyword" aria-label="搜索工作账号" maxlength="80" placeholder="搜索账号、人员或窗口" /></label><AdminSelect v-model="role" :options="roleOptions" label="工作身份筛选" /><AdminSelect v-model="enabled" :options="statusOptions" label="账号启用状态筛选" /></div><div ref="accountViewport" class="fn-list-viewport data-table-wrap"><table class="data-table ops-account-table"><thead><tr><th>人员 / 登录账号</th><th>工作身份</th><th>授权范围</th><th>账号状态</th><th>操作</th></tr></thead><tbody><tr v-for="account in accountRows" :key="account.userId"><td><div class="ops-person"><span class="avatar" aria-hidden="true"><UserRound :size="17" /></span><div><b class="ops-primary-text">{{ account.displayName }}<em v-if="sameId(account.userId,state.account.userId)">当前账号</em></b><small>{{ account.username }}</small></div></div></td><td>{{ roleName(account.role) }}</td><td><b class="ops-primary-text">{{ account.role==='STAFF'?account.windowName:account.role==='ADMIN'?'全校食堂':'只读运营数据' }}</b><small v-if="account.role==='STAFF'">{{ account.canteenName }}</small></td><td><button class="ops-status-toggle" :class="{on:Number(account.enabled)===1}" :disabled="!!pending||sameId(account.userId,state.account.userId)" :aria-label="`${Number(account.enabled)===1?'停用':'启用'}${account.username}`" @click="toggle(account,'account')"><i aria-hidden="true" /><span>{{ Number(account.enabled)===1?'启用':'停用' }}</span></button></td><td><div class="ops-row-actions"><button class="text-button" :aria-label="'编辑账号'+account.username" @click="accountEdit={account:{...account},mode:'account'}"><Pencil :size="14" />编辑</button><button class="ops-key-button" :aria-label="'重置密码'+account.username" title="重置密码" @click="accountEdit={account:{...account},mode:'password'}"><KeyRound :size="16" /></button></div></td></tr></tbody></table><p v-if="!accountTotal" class="fn-list-empty">{{ accountsLoading?'正在载入工作账号…':'没有匹配的工作账号' }}</p></div><AdminPagination v-model="accountPage" :total="accountTotal" :page-size="accountPageSize" label="工作账号分页" unit="个" /></template>
  <p v-if="error" role="alert" class="ops-load-error">{{ error }}<button class="am-link" @click="refresh">重试</button></p>
</section><AdminAccountEditor v-if="accountEdit" :account="accountEdit.account" :windows="windows" :mode="accountEdit.mode" @close="accountEdit=null" @saved="accountSaved" /><AdminWindowEditor v-if="windowEdit" :window="windowEdit" @close="windowEdit=null" @saved="windowSaved" /></article></template>
