<script setup>
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
const props = defineProps({ total: {type:Number,default:0}, pageSize: {type:Number,default:6}, label: {type:String,default:'列表分页'}, unit: {type:String,default:'条'}, scopeLabel: {type:String,default:'共'} })
const page = defineModel({type:Number,default:1})
const pageCount = computed(() => Math.max(1,Math.ceil(props.total/props.pageSize)))
const start = computed(() => props.total ? (page.value-1)*props.pageSize+1 : 0)
const end = computed(() => Math.min(props.total,page.value*props.pageSize))
// 页码窗口只展示相邻三页；首尾控制保留跳转能力，避免小面板横向挤压。
const pages = computed(() => {
  const first = Math.max(1,Math.min(page.value-1,pageCount.value-2))
  return Array.from({length:Math.min(3,pageCount.value)},(_,index)=>first+index)
})
</script>
<template>
  <nav class="admin-pagination" :aria-label="label">
    <span class="admin-page-count">{{ scopeLabel }} {{ total }} {{ unit }}<span class="admin-page-range"> · {{ start }}–{{ end }}</span></span>
    <div class="admin-page-controls">
      <button aria-label="上一页" title="上一页" :disabled="page<=1" @click="page=Math.max(1,page-1)"><ChevronLeft :size="15" /></button>
      <button v-for="value in pages" :key="value" :aria-label="'第'+value+'页'" :aria-current="page===value?'page':undefined" @click="page=value">{{ value }}</button>
      <span v-if="pages.at(-1)<pageCount" class="admin-page-last"><span>…</span><button :aria-label="'第'+pageCount+'页'" @click="page=pageCount">{{ pageCount }}</button></span>
      <button aria-label="下一页" title="下一页" :disabled="page>=pageCount" @click="page=Math.min(pageCount,page+1)"><ChevronRight :size="15" /></button>
    </div>
    <slot />
  </nav>
</template>
<style scoped>
.admin-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;min-height:40px;padding:7px 0 0;font-size:12px;color:var(--ed-muted)}
.admin-page-count{white-space:nowrap}.admin-page-range{color:var(--ed-muted)}
.admin-page-controls,.admin-page-last{display:flex;align-items:center;gap:4px}.admin-page-controls{margin-left:auto}
button{display:grid;place-items:center;min-width:28px;height:28px;padding:0 6px;border:0;border-radius:8px;color:var(--ed-muted);background:transparent;font:inherit}
button:hover:not(:disabled){background:var(--ed-raised);color:var(--ed-ink)}button[aria-current]{background:#263b2d;color:#fff}button:disabled{opacity:.32;cursor:default}
.admin-page-last>span{padding:0 2px}
@media(max-width:640px){.admin-pagination{gap:7px;flex-wrap:wrap}.admin-page-range{display:none}.admin-page-controls{gap:2px}button{min-width:27px}}
</style>
