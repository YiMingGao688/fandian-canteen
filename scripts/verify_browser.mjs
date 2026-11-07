// 只在临时 Vite 服务中验证 Web 入口与账号切换，接口响应由浏览器测试提供。
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { createServer } from '../web/node_modules/vite/dist/node/index.js'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../web/', import.meta.url))
const vite = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
const accounts = {
  canteen_admin: { userId: 1, username: 'canteen_admin', displayName: '测试管理员', role: 'ADMIN' },
  canteen_screen: { userId: 2, username: 'canteen_screen', displayName: '测试展示账号', role: 'SCREEN' },
  '20260001': { userId: 3, username: '20260001', displayName: '测试学生', role: 'STUDENT' },
}
const windows = [{ id: 1, name: '测试窗口', canteenName: '测试食堂', location: '东区 · 一楼', enabled: 1 }]
const fixtures = {
  '/public/windows': windows,
  '/staff/dashboard': { summary: {} },
  '/staff/orders': [],
  '/staff/menu': [],
  '/staff/feedback': [],
  '/screen/overview': { summary: {}, windows, slotUsage: { capacity: 20, occupied: 1 } },
}
const unexpected = []
const errors = []
let browser

async function fixturePage(viewport) {
  const page = await browser.newPage({ viewport })
  page.context().on('page', tab => tab.on('pageerror', error => errors.push(error.message)))
  page.on('pageerror', error => errors.push(error.message))
  await page.context().route('**/campus/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.slice('/campus'.length)
    if (path === '/auth/login' && request.method() === 'POST') {
      const account = accounts[request.postDataJSON().username]
      if (account) return route.fulfill({ json: { code: 1, data: { account, token: 'fixture-' + account.username } } })
      return route.fulfill({ status: 401, json: { code: 0, msg: '账号或密码错误' } })
    }
    if (path === '/me' && request.method() === 'GET') {
      const account = accounts[request.headers().authorization?.replace(/^Bearer fixture-/, '')]
      if (account) return route.fulfill({ json: { code: 1, data: account } })
      return route.fulfill({ status: 401, json: { code: 0, msg: '登录已过期' } })
    }
    if (request.method() === 'GET' && Object.hasOwn(fixtures, path)) {
      return route.fulfill({ json: { code: 1, data: fixtures[path] } })
    }
    unexpected.push(request.method() + ' ' + path)
    return route.fulfill({ status: 501, json: { code: 0, msg: '未配置的测试接口' } })
  })
  return page
}

async function check(name, action) {
  await action()
  console.log('PASS', name)
}

try {
  await vite.listen()
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const mobile = await fixturePage({ width: 390, height: 844 })
  const admin = await fixturePage({ width: 1440, height: 1000 })
  const screen = await fixturePage({ width: 1440, height: 1000 })
  const loginUrl = /#\/admin\/login$/

  await check('窄屏首页与旧学生网页地址进入管理登录', async () => {
    for (const path of ['/', '/#/m', '/#/m/orders', '/#/m/notices', '/#/m/profile', '/#/orders', '/#/notices']) {
      await mobile.goto(base + path)
      await expect(mobile).toHaveURL(loginUrl)
      await expect(mobile.getByRole('heading', { name: '管理员登录' })).toBeVisible()
    }
  })

  await check('旧学生会话清理，学生登录提示改用微信小程序', async () => {
    await mobile.evaluate(session => sessionStorage.setItem('hexu.session', JSON.stringify(session)), {
      account: accounts['20260001'], token: 'fixture-20260001',
    })
    await mobile.reload()
    await expect(mobile).toHaveURL(loginUrl)
    await expect(mobile.getByRole('heading', { name: '管理员登录' })).toBeVisible()
    expect(await mobile.evaluate(() => sessionStorage.getItem('hexu.session'))).toBeNull()
    await mobile.getByLabel('管理或展示账号').fill('20260001')
    await mobile.getByLabel('密码', { exact: true }).fill('test-password')
    await mobile.getByRole('button', { name: '登录饭点', exact: true }).click()
    await expect(mobile.getByRole('status')).toContainText('学生点餐请使用微信小程序')
    await expect(mobile).toHaveURL(loginUrl)
  })

  await check('管理员登录和刷新后可进入后台，并可打开大屏', async () => {
    await admin.goto(base + '/')
    await expect(admin).toHaveURL(loginUrl)
    await admin.getByRole('button', { name: '使用管理体验账号', exact: true }).click()
    await expect(admin.locator('.premium-overview')).toBeVisible()
    await admin.reload()
    await expect(admin.locator('.premium-overview')).toBeVisible()
    await admin.locator('.admin-header-account summary').click()
    const [popup] = await Promise.all([
      admin.waitForEvent('popup'),
      admin.getByRole('link', { name: '运营数据大屏' }).click(),
    ])
    await expect(popup).toHaveURL(/#\/screen$/)
    await expect(popup.locator('.screen-metrics')).toBeVisible()
    await popup.close()
  })

  await check('大屏账号可独立登录，进入管理地址时要求工作账号', async () => {
    await screen.goto(base + '/#/screen')
    await screen.getByRole('button', { name: '登录展示大屏', exact: true }).click()
    await screen.getByRole('button', { name: '使用大屏展示体验账号', exact: true }).click()
    await expect(screen.locator('.screen-metrics')).toBeVisible()
    await screen.goto(base + '/#/admin')
    await expect(screen).toHaveURL(loginUrl)
  })

  await check('管理会话过期后回到管理登录', async () => {
    await admin.evaluate(account => sessionStorage.setItem('hexu.session', JSON.stringify({ account, token: 'expired' })), accounts.canteen_admin)
    await admin.reload()
    await expect(admin).toHaveURL(loginUrl)
    await expect(admin.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  })

  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
} finally {
  await browser?.close()
  await vite.close()
}
