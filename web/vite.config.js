import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 网页只通过同源代理访问校园 API，本地服务不需要开放跨域权限。
export default defineConfig({ plugins: [vue()], base: './', server: { proxy: { '/campus': { target: 'http://127.0.0.1:18088', ws: true } } } })
