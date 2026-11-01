<script setup>
import { defineAsyncComponent, onMounted } from 'vue'
import { Leaf } from '@lucide/vue'
import { state } from '../state'

const AdminLoginCanteen = defineAsyncComponent(() => import('../components/AdminLoginCanteen.vue'))

onMounted(() => {
  state.loginRole = 'STAFF'
  state.loginOpen = true
})
</script>

<template>
  <section class="admin-login-page" aria-label="食堂管理登录">
    <svg class="admin-login-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="login-contour" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#d9c796" stop-opacity=".22" />
          <stop offset=".52" stop-color="#adc49b" stop-opacity=".15" />
          <stop offset="1" stop-color="#d9c796" stop-opacity=".04" />
        </linearGradient>
      </defs>
      <g class="login-contours login-contours-upper" fill="none" stroke="url(#login-contour)" stroke-width="1">
        <path d="M940 -120C1010 85 1160 158 1325 116s246-170 390-159" />
        <path d="M890 -88C980 153 1160 222 1342 173s267-169 411-144" />
        <path d="M842 -52C948 214 1158 287 1361 230s284-165 424-126" />
        <path d="M800 -10C916 272 1152 354 1380 290s303-160 438-105" />
      </g>
      <g class="login-contours login-contours-lower" fill="none" stroke="url(#login-contour)" stroke-width="1">
        <path d="M-180 808C36 680 194 690 330 804s210 198 398 180" />
        <path d="M-165 858C54 731 205 745 349 861s218 184 405 159" />
        <path d="M-144 910C74 785 224 802 368 918s224 170 409 137" />
      </g>
      <g class="login-leaf-line" fill="none" stroke="#d9c796" stroke-opacity=".15" stroke-width="1">
        <path d="M1390 630c-10-68 23-132 95-170-3 70-30 127-95 170Zm0 0c-50-51-103-62-160-36 43 51 97 65 160 36Z" />
        <path d="M1230 594c72 2 125 17 160 36m-65-170c-1 68-25 124-95 170" />
      </g>
    </svg>
    <AdminLoginCanteen />
    <header class="admin-login-brand"><span><Leaf :size="24" /></span><b>禾序食堂管理</b><small>HEXU · ADMINISTRATION</small></header>
    <div class="admin-login-copy">
      <p>OPERATIONS CONSOLE · SECURE ACCESS</p>
      <h1>食堂运营管理</h1>
      <span>登录后进入经营概览，处理预约、菜品库存与学生反馈。</span>
    </div>
    <footer>经营概览 <i /> 预约订单 <i /> 菜品与库存 <i /> 学生反馈</footer>
  </section>
</template>
