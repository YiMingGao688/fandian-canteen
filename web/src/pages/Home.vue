<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowUpRight, ArrowRight, Clock3, MapPin, Search, SlidersHorizontal, Heart, Plus, Minus, ShoppingBag, Leaf, Star, Ticket, Check, Trash2, CalendarDays, Utensils, X, LoaderCircle, ShieldCheck } from '@lucide/vue'
import { state, api, attempt, notify, requireStudent, refreshStudent, refreshMenu, cartCount, cartTotal, money, sameId, dateString, createRequestId } from '../state'

const router = useRouter(), windowId = ref('1'), query = ref(''), category = ref('all'), favoritesOnly = ref(false)
const date = ref(dateString()), slots = ref([]), slotId = ref(''), remark = ref(''), cutlery = ref(true)
const checkoutOpen = ref(false), submitting = ref(false), changing = ref(false), requestId = ref(createRequestId())
let slotSequence = 0
const currentWindow = computed(() => state.windows.find(w => sameId(w.id, windowId.value)))
const cartWindow = computed(() => {
  const dish = state.menu.find(d => sameId(d.id, state.cart[0]?.dishId))
  return state.windows.find(w => sameId(w.id, dish?.windowId)) || currentWindow.value
})
const cartWindowId = computed(() => cartWindow.value?.id || windowId.value)
const filtered = computed(() => state.menu.filter(d => sameId(d.windowId, windowId.value) && Number(d.status) === 1 && (category.value === 'all' || sameId(d.categoryId, category.value)) && (!favoritesOnly.value || favorite(d.id)) && `${d.name}${d.tags}${d.description}`.includes(query.value.trim())))
const chosenSlot = computed(() => slots.value.find(s => sameId(s.id, slotId.value)))
const nutrients = computed(() => state.cart.reduce((sum, row) => sum + Number(row.number) * Number(state.menu.find(d => sameId(d.id, row.dishId))?.calories || 0), 0))
const dayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(new Date())
function favorite(id) { return state.favorites.some(value => sameId(id, value)) }
function count(id) { return state.cart.find(row => sameId(row.dishId, id))?.number || 0 }
async function change(dish, delta) {
  if (!requireStudent() || changing.value) return
  changing.value = true
  await attempt(async () => { await api('/student/cart', { method: 'POST', body: { dishId: dish.id, delta } }); requestId.value = createRequestId(); await refreshStudent() })
  changing.value = false
}
async function toggleFavorite(dish) {
  if (!requireStudent()) return
  await attempt(async () => { await api(`/student/favorites/${dish.id}?enabled=${!favorite(dish.id)}`, { method: 'PUT' }); await refreshStudent() })
}
async function clear() { await attempt(async () => { await api('/student/cart', { method: 'DELETE' }); await refreshStudent(); requestId.value = createRequestId() }) }
async function loadSlots() {
  const seq = ++slotSequence
  await attempt(async () => {
    let available = await api(`/public/slots?windowId=${cartWindowId.value}&date=${date.value}`)
    if (seq !== slotSequence) return
    if (!available.length && date.value === dateString()) { date.value = dateString(1); return }
    slots.value = available
    if (!available.some(s => sameId(s.id, slotId.value) && Number(s.reserved) < Number(s.capacity))) slotId.value = available.find(s => Number(s.reserved) < Number(s.capacity))?.id || ''
  })
}
function openCheckout() {
  if (!requireStudent()) return
  if (!state.cart.length) return notify('先挑选几道喜欢的菜吧', true)
  if (!chosenSlot.value) return notify('请选择可以预约的取餐时段', true)
  checkoutOpen.value = true
}
async function submit() {
  if (submitting.value) return
  submitting.value = true
  await attempt(async () => {
    await api('/student/orders', { method: 'POST', body: { slotId: slotId.value, requestId: requestId.value, remark: remark.value, needCutlery: cutlery.value } })
    checkoutOpen.value = false; requestId.value = createRequestId(); remark.value = ''
    await Promise.all([refreshStudent(), refreshMenu(), loadSlots()]); notify('预约已创建，请在 15 分钟内完成演示支付'); router.push('/orders')
  })
  submitting.value = false
}
function scrollMenu() { document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function scrollCart() { document.getElementById('meal-cart')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
watch([cartWindowId, date], loadSlots)
onMounted(loadSlots)
</script>

<template>
  <div class="page-wrap home-page">
    <div class="welcome-line"><span><i class="live-dot" />今天也要好好吃饭</span><span>{{ dayLabel }}<span class="welcome-separator">/</span>校园食堂预约开放中</span></div>
    <section class="hero">
      <div class="hero-copy"><p class="eyebrow"><span />GOOD FOOD, GOOD CAMPUS LIFE</p><h1>下课，就开饭。<br><span>把时间留给喜欢的事。</span></h1><p class="hero-description">提前选好心仪的一餐，约定你的取餐时间。<br>少一点等待，多一点校园里的小美好。</p><button class="button hero-cta" @click="scrollMenu">看看今日菜单<ArrowUpRight :size="19" /></button><div class="hero-benefits"><span><CalendarDays :size="15" />提前预约</span><span><Ticket :size="15" />凭码取餐</span><span><Leaf :size="15" />按需点餐</span></div></div>
      <div class="hero-visual"><img class="hero-image" src="/images/hero.jpg" alt="清爽食物搭配示意" fetchpriority="high" /><div class="hero-stamp">FRESH<br><span>EVERY DAY</span><Leaf :size="20" /></div><div class="hero-floating"><span class="floating-icon"><Check :size="21" /></span><div><b>好好吃饭，从不将就</b><small>新鲜一餐 · 校园好味道</small></div></div><span class="hero-image-note">演示菜品图片</span></div>
    </section>

    <section class="windows-section"><div class="section-top"><div><span class="eyebrow">FIND YOUR FAVORITE</span><h2>从这里，找到你的好味道<span class="title-dot">.</span></h2></div><span class="section-caption">{{ state.windows.length }} 个校园窗口 · 任选心仪的一家</span></div><div class="window-grid"><button v-for="(window, index) in state.windows" :key="window.id" class="window-card" :class="{ active: sameId(windowId, window.id) }" @click="windowId = String(window.id); category = 'all'; query = ''"><span class="window-number">0{{ index + 1 }}</span><div><span class="window-canteen">{{ window.canteenName }}</span><h3>{{ window.name }}</h3><p><MapPin :size="12" />{{ window.location }}</p></div><span class="window-check"><Check v-if="sameId(windowId, window.id)" :size="17" /><ArrowUpRight v-else :size="17" /></span></button></div></section>

    <section id="menu-section" class="menu-section"><div class="menu-main"><div class="section-top menu-title"><div><p class="eyebrow">MADE FOR YOUR EVERYDAY</p><h2>{{ currentWindow?.name || '今日菜单' }}<span class="small-count">{{ filtered.length }} 道好味</span></h2></div><div class="menu-search"><Search :size="16" /><input v-model="query" aria-label="搜索菜品" placeholder="搜搜今天想吃什么" /><button v-if="query" class="icon-button" aria-label="清空搜索" @click="query = ''"><X :size="14" /></button></div></div>
        <div class="menu-filters"><div class="filter-chips"><button v-for="item in [{id:'all',name:'全部美味'},{id:1,name:'人气主食'},{id:2,name:'清爽轻食'},{id:3,name:'面点小吃'},{id:4,name:'暖心汤饮'}]" :key="item.id" :class="{ active: sameId(category, item.id) }" @click="category = item.id">{{ item.name }}</button></div><button class="favorite-filter" :class="{ selected: favoritesOnly }" @click="requireStudent() && (favoritesOnly = !favoritesOnly)"><Heart :size="14" :fill="favoritesOnly ? 'currentColor' : 'none'" />收藏</button></div>
        <div v-if="!filtered.length" class="empty-state small-empty"><ShoppingBag :size="35" /><h3>{{ state.menu.length ? '还没有找到心仪的菜' : '正在为你准备今日菜单' }}</h3><p>换个窗口，或试试别的关键词。</p><button class="text-button" @click="query = ''; category = 'all'; favoritesOnly = false">查看全部菜品<ArrowRight :size="14" /></button></div>
        <div class="dish-grid"><article v-for="dish in filtered" :key="dish.id" class="dish-card"><div class="dish-image-wrap"><img :src="dish.image" :alt="`${dish.name}演示示意图`" loading="lazy" /><span class="dish-badge" :class="{ light: !dish.tags?.includes('招牌') }">{{ dish.tags?.split(',')[0] }}</span><button class="favorite-button" :class="{ selected: favorite(dish.id) }" :aria-label="`${favorite(dish.id) ? '取消收藏' : '收藏'}${dish.name}`" @click="toggleFavorite(dish)"><Heart :size="17" :fill="favorite(dish.id) ? 'currentColor' : 'none'" /></button><span v-if="Number(dish.stock) === 0" class="sold-out-overlay">今天太受欢迎，暂时售罄</span></div><div class="dish-content"><div class="dish-name-line"><h3>{{ dish.name }}</h3><span v-if="dish.rating" class="rating"><Star :size="11" fill="currentColor" />{{ dish.rating }}</span></div><p class="dish-description">{{ dish.description }}</p><div class="dish-meta"><span><Leaf :size="11" />约 {{ dish.calories }} kcal</span><span>余 {{ dish.stock }} 份</span></div><div class="dish-bottom"><div class="dish-price"><span>¥</span>{{ money(dish.price).split('.')[0] }}<small>.{{ money(dish.price).split('.')[1] }}</small><em>/ 份</em></div><div v-if="count(dish.id)" class="quantity-control"><button :disabled="changing" :aria-label="`减少${dish.name}`" @click="change(dish, -1)"><Minus :size="13" /></button><span>{{ count(dish.id) }}</span><button :disabled="changing || Number(dish.stock) <= Number(count(dish.id))" :aria-label="`添加${dish.name}`" @click="change(dish, 1)"><Plus :size="14" /></button></div><button v-else class="add-dish" :disabled="changing || !Number(dish.stock)" :aria-label="`添加${dish.name}`" @click="change(dish, 1)"><Plus :size="20" /></button></div></div></article></div>
        <p class="menu-footnote"><Leaf :size="13" />珍惜每一份食物，按需选择。图片与营养数值为演示示意。</p>
      </div>

      <aside id="meal-cart" class="meal-cart"><div class="cart-heading"><span class="cart-heading-icon"><ShoppingBag :size="21" /></span><div><h3>我的餐盘<span v-if="cartCount" class="count-pill">{{ cartCount }}</span></h3><p>把喜欢的，装进今天的一餐</p></div><button v-if="state.cart.length" class="icon-button" aria-label="清空餐盘" @click="clear"><Trash2 :size="15" /></button></div>
        <div v-if="!state.cart.length" class="empty-cart"><div class="empty-cart-icon"><Utensils :size="28" :stroke-width="1.3" /></div><b>餐盘还空着呢</b><p>选几道喜欢的菜<br>为下一餐留点期待</p></div><div v-else class="cart-items"><span class="cart-window-label"><MapPin :size="13" />{{ cartWindow?.name }}</span><div v-for="item in state.cart" :key="item.id" class="cart-item"><img :src="item.image" :alt="item.name" /><div><b>{{ item.name }}</b><span>¥{{ money(item.amount) }}</span></div><div class="mini-quantity"><button :disabled="changing" :aria-label="`餐盘减少${item.name}`" @click="change({id:item.dishId},-1)"><Minus :size="12" /></button><span>{{ item.number }}</span><button :disabled="changing" :aria-label="`餐盘添加${item.name}`" @click="change({id:item.dishId},1)"><Plus :size="12" /></button></div></div><div class="nutrition-summary"><Leaf :size="13" />本餐能量估算<span>{{ nutrients }} kcal</span></div></div>
        <div class="reservation-picker"><label class="picker-title"><Clock3 :size="15" />约个取餐时间</label><div class="date-switch"><button :class="{ active: date === dateString() }" @click="date = dateString()">今天</button><button :class="{ active: date === dateString(1) }" @click="date = dateString(1)">明天</button></div><select v-model="slotId" aria-label="取餐时段"><option value="" disabled>请选择取餐时段</option><option v-for="slot in slots" :key="slot.id" :value="slot.id" :disabled="Number(slot.reserved) >= Number(slot.capacity)">{{ slot.startTime }} – {{ slot.endTime }} · {{ Number(slot.reserved) >= Number(slot.capacity) ? '已约满' : `余 ${Number(slot.capacity) - Number(slot.reserved)} 位` }}</option></select><p><MapPin :size="12" />{{ cartWindow?.location || '请先选择食堂窗口' }}</p></div>
        <div class="cart-checkout"><div class="cart-total"><span>合计<small>共 {{ cartCount }} 份</small></span><strong><small>¥</small>{{ money(cartTotal) }}</strong></div><button class="button button-primary full" :disabled="!cartCount || !slotId" @click="openCheckout">预约这一餐<ArrowRight :size="17" /></button><p><ShieldCheck :size="12" />到窗凭码取餐 · 演示支付不扣款</p></div>
      </aside>
    </section>
    <div v-if="cartCount" class="mobile-cart-bar"><button @click="scrollCart"><ShoppingBag :size="20" /><span>{{ cartCount }} 份<strong>¥{{ money(cartTotal) }}</strong></span></button><button class="button button-primary" @click="scrollCart">选择时段，去预约<ArrowRight :size="16" /></button></div>
    <div v-if="checkoutOpen" class="modal-backdrop" @click.self="!submitting && (checkoutOpen = false)"><section class="modal checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button class="icon-button modal-close" :disabled="submitting" aria-label="关闭确认预约" @click="checkoutOpen = false"><X :size="20" /></button><span class="eyebrow">YOUR NEXT GOOD MEAL</span><h2 id="checkout-title">为下一餐，留个位置。</h2><div class="checkout-location"><MapPin :size="20" /><div><b>{{ cartWindow?.name }}</b><p>{{ cartWindow?.location }}</p></div></div><div class="checkout-time"><CalendarDays :size="17" />{{ date }}<b>{{ chosenSlot?.startTime }} – {{ chosenSlot?.endTime }}</b></div><div class="checkout-list"><p v-for="item in state.cart" :key="item.id"><span>{{ item.name }}<small>× {{ item.number }}</small></span><b>¥{{ money(Number(item.amount) * Number(item.number)) }}</b></p></div><label>给窗口留句话<textarea v-model="remark" placeholder="例如：少辣，不要香菜（具体以窗口回复为准）" maxlength="100" rows="2" /></label><label class="checkbox-label"><input v-model="cutlery" type="checkbox" />需要一份餐具<span>自带餐盒，也是绿色的一餐</span></label><div class="checkout-confirm-total"><span>本次预约预计金额</span><strong>¥{{ money(cartTotal) }}</strong></div><p class="form-hint">提交后请在 15 分钟内完成演示支付。最终金额以服务端生成的订单为准。</p><button class="button button-primary full" :disabled="submitting" @click="submit"><LoaderCircle v-if="submitting" class="spin" :size="16" />确认预约<ArrowRight :size="17" /></button></section></div>
  </div>
</template>
