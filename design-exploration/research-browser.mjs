// 公开页面的研究快照；遇到登录、403 或付费墙如实记录，不绕过访问限制。
import { chromium } from '../web/node_modules/@playwright/test/index.mjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
await mkdir(path.join(root, 'research'), { recursive: true })
const sources = JSON.parse(await readFile(path.join(root, 'research-sources.json'), 'utf8'))
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
let results = []
try { results = JSON.parse(await readFile(path.join(root, 'research/access-results.json'), 'utf8')) } catch {}
const pending = sources.filter(source => !results.some(result => result.id === source.id))
async function inspect(source) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const result = { ...source, checkedAt: new Date().toISOString() }
  try {
    const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    result.httpStatus = response?.status(); result.pageTitle = await page.title()
    await page.waitForTimeout(800)
    result.visibleExcerpt = (await page.locator('body').innerText()).slice(0, 1800)
    await page.screenshot({ path: path.join(root, `research/${source.id}-page.jpg`), type: 'jpeg', quality: 65 })
    if (result.httpStatus >= 400 || (result.httpStatus === 202 && !result.visibleExcerpt) || /just a moment|access denied|captcha/i.test(result.pageTitle)) result.access = '访问受限'
    else {
      result.access = '公开页面可访问'
      result.imageUrl = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:image"]')?.content
        const candidates = [...document.images].filter(i => i.naturalWidth > 600 && i.naturalHeight > 300 && !/logo|avatar|announcements|placeholder/i.test(i.src)).sort((a,b) => b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight)
        return candidates[0]?.src || og || ''
      })
      if (result.imageUrl && /^https:/.test(result.imageUrl)) {
        await page.goto(result.imageUrl, { waitUntil: 'load', timeout: 18000 })
        result.imageTitle = await page.title()
        await page.screenshot({ path: path.join(root, `research/${source.id}-visual.jpg`), type: 'jpeg', quality: 80 })
        result.visual = `research/${source.id}-visual.jpg`
      }
    }
  } catch (error) { result.error = error.message.slice(0, 220); result.access ||= '网络或页面加载受限' }
  finally { await page.close() }
  results.push(result)
  await writeFile(path.join(root, 'research/access-results.json'), JSON.stringify(results.sort((a,b)=>a.id.localeCompare(b.id)), null, 2))
  console.log(`${source.id}: ${result.access}; visual=${!!result.visual}`)
}
try {
  let index = 0
  await Promise.all(Array.from({ length: 3 }, async () => { while (index < pending.length) await inspect(pending[index++]) }))
} finally { await browser.close() }
