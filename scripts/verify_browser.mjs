import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../artifacts/', import.meta.url))
const base = 'http://127.0.0.1:15173'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const results = [], errors = []
const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 })
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const screenContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const student = await studentContext.newPage(), admin = await adminContext.newPage(), screen = await screenContext.newPage()
for (const page of [student, admin, screen]) page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`))

async function check(name, action) {
  await action()
  results.push({ name, passed: true })
  console.log('PASS', name)
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

try {
  await student.goto(`${base}/`, { waitUntil: 'networkidle' })
  await expect(student).toHaveURL(/#\/m/)
  await check('手机 H5 展示校园窗口、菜品和固定手机导航', async () => {
    await expect(student.locator('.phone-hero')).toBeVisible()
    await expect(student.locator('.phone-dish')).toHaveCount(6)
    await expect(student.locator('.phone-bottom-nav')).toBeVisible()
    await noOverflow(student)
  })
  await student.screenshot({ path: output + 'mobile-h5.png' })

  await student.locator('.phone-login').click()
  await student.getByRole('button', { name: '使用学生体验账号', exact: true }).click()
  await expect(student.locator('.phone-avatar')).toBeVisible()
  await check('学生能在手机端加菜、选择取餐时段并提交预约', async () => {
    const dish = student.locator('.phone-dish').filter({ hasText: '照烧鸡腿饭' })
    await dish.getByRole('button', { name: '添加照烧鸡腿饭', exact: true }).click()
    await dish.getByRole('button', { name: '添加照烧鸡腿饭', exact: true }).click()
    await expect(dish.locator('.phone-quantity span')).toHaveText('2')
    await student.getByRole('button', { name: /去预约/ }).click()
    await expect(student.locator('.phone-cart-sheet')).toBeVisible()
    await student.locator('.phone-sheet-time .date-switch').getByRole('button', { name: '明天' }).click()
    await expect(student.locator('select[aria-label="取餐时段"]')).not.toHaveValue('')
    await student.getByRole('button', { name: '确认预约', exact: true }).click()
    await expect(student).toHaveURL(/#\/m\/orders/)
    await expect(student.getByRole('button', { name: '去支付', exact: true }).first()).toBeVisible()
  })
  await student.getByRole('button', { name: '去支付', exact: true }).first().click()
  await expect(student.locator('.order-card').first().locator('.status-badge')).toHaveText('等待接单')

  await admin.goto(`${base}/`, { waitUntil: 'networkidle' })
  await expect(admin).toHaveURL(/#\/admin\/login$/)
  await expect(admin.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: '使用管理体验账号', exact: true }).click()
  await check('PC 管理后台展示全校统计和 ECharts 经营图表', async () => {
    await expect(admin.locator('.overview-bento > article')).toHaveCount(6)
    await expect(admin.locator('.overview-revenue-card')).toBeVisible()
    await expect(admin.locator('.overview-queue-card')).toBeVisible()
    await expect(admin.locator('.data-chart canvas')).toHaveCount(3)
    await expect(admin.locator('.workbench-sidebar')).toContainText('全校数据权限')
    await noOverflow(admin)
  })
  await expect(admin.locator('.toast')).toBeHidden()
  await admin.screenshot({ path: output + 'admin-web.png', fullPage: true })
  await admin.locator('.workbench-sidebar nav').getByRole('button', { name: '预约订单', exact: true }).click()
  const order = admin.locator('.staff-order').filter({ hasText: '林同学' }).first()
  await check('管理员可在 PC 后台接单、完成备餐并核销手机端订单', async () => {
    await expect(order.getByRole('button', { name: '接单并开始备餐' })).toBeVisible()
    await order.getByRole('button', { name: '接单并开始备餐' }).click()
    await order.getByRole('button', { name: '这一餐备好了' }).click()
    await expect(order.locator('.status-badge')).toHaveText('待取餐')
    await student.reload({ waitUntil: 'networkidle' })
    await expect(student.locator('.order-card').first().locator('.status-badge')).toHaveText('待取餐')
    const code = (await student.locator('.pickup-ticket strong').first().innerText()).replace(/\s+/g, '')
    await admin.getByRole('textbox', { name: '学生取餐码' }).fill(code)
    await admin.getByRole('button', { name: '确认核销', exact: true }).click()
    await expect(admin.locator('.pickup-success')).toContainText('林同学')
    await student.reload({ waitUntil: 'networkidle' })
    await expect(student.locator('.order-card').first().locator('.status-badge')).toHaveText('已取餐')
  })
  await student.getByRole('button', { name: '评价这一餐' }).first().click()
  await student.getByPlaceholder('味道、分量、服务，都可以聊聊。').fill('手机预约、窗口备餐和取餐核销都完成了。')
  await student.getByRole('button', { name: '提交评价', exact: true }).click()
  await expect(student.locator('.order-card').first()).toContainText('已评价')

  await screen.goto(`${base}/#/screen`, { waitUntil: 'networkidle' })
  await screen.getByRole('button', { name: '登录展示大屏', exact: true }).click()
  await screen.getByRole('button', { name: '使用大屏展示体验账号', exact: true }).click()
  await check('独立运营大屏显示全校窗口和五张真实 ECharts 图表', async () => {
    await expect(screen.locator('.operations-screen')).toBeVisible()
    await expect(screen.locator('.site-header')).toHaveCount(0)
    await expect(screen.locator('.screen-metrics article')).toHaveCount(5)
    await expect(screen.locator('.screen-scene-label')).toHaveCount(3)
    await expect(screen.locator('.screen-scene canvas')).toHaveCount(1)
    await expect(screen.locator('.screen-chart canvas')).toHaveCount(5)
    await expect(screen.locator('.screen-footer')).toContainText('不含学生个人信息')
    await noOverflow(screen)
  })
  await expect(screen.locator('.toast')).toBeHidden()
  await screen.screenshot({ path: output + 'operations-screen.png', fullPage: true })
  await screen.locator('.screen-day-switch').getByRole('button', { name: '今日', exact: true }).click()
  await expect(screen.locator('.screen-day-switch').getByRole('button', { name: '今日', exact: true })).toHaveClass(/active/)
  await screen.locator('.screen-toolbar').getByRole('button', { name: '刷新' }).click()
  await screen.setViewportSize({ width: 390, height: 844 })
  await check('运营大屏缩窄窗口后可堆叠显示且没有横向溢出', async () => {
    await noOverflow(screen)
    await expect(screen.locator('.screen-layout')).toBeVisible()
  })

  await check('三类入口浏览器运行无未处理 JavaScript 错误', async () => {
    expect(errors).toEqual([])
  })
  const report = { passed: results.length, failed: 0, checks: results, errors, screenshots: ['mobile-h5.png', 'admin-web.png', 'operations-screen.png'] }
  await writeFile(output + 'browser-verification.json', JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, errors }))
} finally {
  await browser.close()
}
