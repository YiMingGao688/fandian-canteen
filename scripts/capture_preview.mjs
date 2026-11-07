import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../artifacts/', import.meta.url))
const base = 'http://127.0.0.1:15173'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const errors = []

try {
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  admin.on('pageerror', error => errors.push(error.message))
  const navigation = admin.getByRole('navigation', { name: '管理导航', exact: true })
  await admin.goto(`${base}/#/admin`, { waitUntil: 'networkidle' })
  await expect(admin).toHaveURL(/#\/admin\/login$/)
  await expect(admin.locator('.admin-login-page')).toBeVisible()
  await expect(admin.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: '使用管理体验账号', exact: true }).click()
  await expect(admin.locator('.premium-overview')).toBeVisible()
  await expect(admin.locator('.pd-sync')).toContainText('更新于')
  await expect(admin).toHaveURL(/#\/admin$/)
  await expect(admin.locator('.admin-header-inner .admin-screen-link')).toHaveCount(1)
  await expect(admin.locator('.admin-header-account')).toBeVisible()
  await expect(navigation.getByRole('button')).toHaveCount(5)
  await expect(admin.locator('.toast')).toBeHidden()
  await admin.goto(`${base}/#/admin/login`, { waitUntil: 'networkidle' })
  await expect(admin).toHaveURL(/#\/admin$/)
  await expect(admin.locator('.premium-overview')).toBeVisible()
  await admin.reload({ waitUntil: 'networkidle' })
  await expect(admin.locator('.pd-sync')).toContainText('更新于')
  await admin.screenshot({ path: output + 'admin-web.png', fullPage: true })
  await admin.setViewportSize({ width: 390, height: 844 })
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await expect(navigation.getByRole('button')).toHaveCount(5)
  await admin.screenshot({ path: output + 'admin-web-mobile.png', fullPage: true })
  await admin.setViewportSize({ width: 1440, height: 1000 })
  await navigation.getByRole('button', { name: '预约订单' }).click()
  await expect(admin.locator('#dispatch-code')).toBeVisible()
  await admin.screenshot({ path: output + 'admin-orders.png', fullPage: true })
  await navigation.getByRole('button', { name: '菜品与库存' }).click()
  await expect(admin.locator('.data-table-wrap')).toBeVisible()
  await admin.screenshot({ path: output + 'admin-menu.png', fullPage: true })
  await navigation.getByRole('button', { name: '学生反馈' }).click()
  await expect(admin.locator('.table-section-heading')).toBeVisible()
  await admin.screenshot({ path: output + 'admin-feedback.png', fullPage: true })
  await admin.setViewportSize({ width: 390, height: 844 })
  for (const [name, selector, screenshot] of [
    ['预约订单', '#dispatch-code', 'admin-orders-mobile.png'],
    ['菜品与库存', '.data-table-wrap', 'admin-menu-mobile.png'],
    ['学生反馈', '.table-section-heading', 'admin-feedback-mobile.png'],
  ]) {
    await navigation.getByRole('button', { name }).click()
    await expect(admin.locator(selector)).toBeVisible()
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await admin.screenshot({ path: output + screenshot, fullPage: true })
  }
  await admin.setViewportSize({ width: 1440, height: 1000 })
  await navigation.getByRole('button', { name: '经营概览' }).click()
  await admin.locator('.admin-header-account summary').click()
  const [adminScreen] = await Promise.all([
    admin.waitForEvent('popup'),
    admin.getByRole('link', { name: /运营数据大屏/ }).click(),
  ])
  await adminScreen.waitForLoadState('networkidle')
  await expect(adminScreen.locator('.screen-chart canvas')).toHaveCount(5)
  await expect(adminScreen.locator('.screen-login')).toHaveCount(0)
  await adminScreen.close()
  await admin.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(admin).toHaveURL(/#\/admin\/login$/)
  await expect(admin.locator('.admin-login-page')).toBeVisible()
  await admin.reload({ waitUntil: 'networkidle' })
  await expect(admin.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible()

  const screen = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  screen.on('pageerror', error => errors.push(error.message))
  await screen.goto(`${base}/#/screen`, { waitUntil: 'networkidle' })
  await screen.getByRole('button', { name: '登录展示大屏', exact: true }).click()
  await screen.getByRole('button', { name: '使用大屏展示体验账号', exact: true }).click()
  await expect(screen.locator('.screen-chart canvas')).toHaveCount(5)
  await expect(screen.locator('.screen-scene canvas')).toHaveCount(1)
  await expect(screen.locator('.screen-scene')).toHaveAttribute('data-ready', 'true')
  await expect(screen.locator('.screen-scene-error')).toHaveCount(0)
  const hotspots = screen.locator('.screen-scene-label')
  await expect(hotspots).toHaveCount(3)
  const secondWindowName = await hotspots.nth(1).locator('small').innerText()
  await hotspots.nth(1).click()
  await expect(hotspots.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(screen.locator('.screen-window-focus h3')).toContainText(secondWindowName)
  await hotspots.first().click()
  await screen.getByRole('button', { name: '场景巡航', exact: true }).click()
  await screen.getByRole('button', { name: '停止巡航', exact: true }).click()
  await screen.getByRole('button', { name: '复位', exact: true }).click()
  for (const name of ['今日', '明日']) {
    await Promise.all([
      screen.waitForResponse(response => response.url().includes('/screen/overview?date=') && response.ok()),
      screen.locator('.screen-day-switch').getByRole('button', { name, exact: true }).click(),
    ])
    await expect(screen.locator('.screen-day-switch').getByRole('button', { name, exact: true })).toHaveClass(/active/)
  }
  await expect(screen.locator('.toast')).toBeHidden()
  expect(await screen.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await screen.screenshot({ path: output + 'operations-screen.png' })
  await screen.setViewportSize({ width: 1440, height: 1000 })
  expect(await screen.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await screen.screenshot({ path: output + 'operations-screen-desktop.png' })
  await screen.setViewportSize({ width: 390, height: 844 })
  expect(await screen.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await screen.goto(`${base}/#/admin`, { waitUntil: 'networkidle' })
  await expect(screen).toHaveURL(/#\/admin\/login$/)
  await expect(screen.locator('.screen-scene')).toHaveCount(0)

  if (errors.length) throw new Error(errors.join('\n'))
  await writeFile(output + 'preview-summary.json', JSON.stringify({ screenshots: ['admin-web.png', 'admin-web-mobile.png', 'admin-orders.png', 'admin-menu.png', 'admin-feedback.png', 'admin-orders-mobile.png', 'admin-menu-mobile.png', 'admin-feedback-mobile.png', 'operations-screen.png', 'operations-screen-desktop.png'], screenViewports: ['1920x1080', '1440x1000', '390x844'], adminChecks: ['direct-login-redirect', 'login-to-dashboard', 'authenticated-login-route-bypass', 'dashboard-refresh', 'navigation-tabs', 'dashboard-mobile-layout', 'orders-mobile-layout', 'menu-mobile-layout', 'feedback-mobile-layout', 'logout-to-login', 'screen-new-tab-auth'], screenChecks: ['five-echarts', 'webgl-scene', 'window-selection', 'cruise-reset', 'date-switch', 'viewport-fit', 'scene-unmount'], browserErrors: errors.length }, null, 2), 'utf8')
  console.log(JSON.stringify({ captured: 10, adminChecks: 11, screenChecks: 7, browserErrors: errors.length }))
} finally {
  await browser.close()
}
