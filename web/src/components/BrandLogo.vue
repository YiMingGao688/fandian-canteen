<script setup>
defineProps({ symbol: Boolean, badge: Boolean })
</script>
<template><img class="fandian-logo" :class="{'fandian-symbol':symbol,'fandian-badge':badge}" :src="symbol?'/branding/fandian-symbol.png':'/branding/fandian-lockup.png'" :alt="symbol?'':'饭点'" :aria-hidden="symbol?true:undefined" /></template>
<style scoped>
.fandian-logo{display:block;width:118px;height:39px;object-fit:contain;flex-shrink:0}.fandian-symbol{width:32px;height:32px}
.fandian-badge{width:132px;height:44px;padding:5px 8px;background:#fafbf4;border-radius:12px}
.fandian-symbol.fandian-badge{width:36px;height:36px;padding:3px;border-radius:9px}
</style>
