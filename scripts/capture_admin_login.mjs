import { chromium } from '../web/node_modules/@playwright/test/index.mjs'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const suffix = process.argv[2] === 'before' ? 'before' : 'after'
const output = fileURLToPath(new URL('../artifacts/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

try {
  const browserErrors = []
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1440, height: 1000 }, false],
    ['mobile', { width: 390, height: 844 }, true],
  ]) {
    const page = await browser.newPage({ viewport, isMobile: mobile, deviceScaleFactor: 1 })
    page.on('pageerror', error => browserErrors.push(error.message))
    await page.goto('http://127.0.0.1:15173/#/admin/login', { waitUntil: 'networkidle' })
    assert.equal(await page.locator('.admin-login-page').count(), 1, `${name}: admin login background should render`)
    assert.equal(await page.locator('.login-modal').isVisible(), true, `${name}: login card should remain visible`)
    assert.equal(await page.locator('.admin-login-art').isVisible(), true, `${name}: SVG background should render`)
    await page.waitForFunction(() => document.querySelector('.admin-login-canteen')?.dataset.ready === 'true')
    assert.equal(await page.locator('.admin-login-canteen canvas').count(), 1, `${name}: 3D canteen canvas should render`)
    const layout = await page.evaluate(() => ({
      widthFits: document.documentElement.scrollWidth <= innerWidth,
      backdropFilter: getComputedStyle(document.querySelector('.admin-login-backdrop')).backdropFilter,
    }))
    assert.equal(layout.widthFits, true, `${name}: page should not overflow horizontally`)
    assert.equal(layout.backdropFilter, 'none', `${name}: login backdrop should not blur the page`)
    await page.screenshot({ path: `${output}admin-login-${suffix}-${name}.png`, fullPage: true })
    if (mobile) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(await page.locator('.login-contours-upper').evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced-motion preference should disable background animation')
    }
    await page.close()
  }
  assert.deepEqual(browserErrors, [], 'login background should not raise browser errors')
} finally {
  await browser.close()
}
