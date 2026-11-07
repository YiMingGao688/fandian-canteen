import { chromium } from '../web/node_modules/@playwright/test/index.mjs'
import { fileURLToPath } from 'node:url'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}})
 await page.goto(new URL('./research/contact-sheet.html',import.meta.url).href)
 await page.screenshot({path:fileURLToPath(new URL('./research/contact-sheet.png',import.meta.url)),fullPage:true})
 try {
  await page.goto('http://127.0.0.1:15173/#/admin/login',{waitUntil:'networkidle',timeout:10000})
  await page.getByRole('button',{name:'使用管理体验账号',exact:true}).click()
  await page.waitForURL('**/#/admin')
  await page.locator('.overview-revenue-value').waitFor()
  await page.screenshot({path:fileURLToPath(new URL('./research/current-admin.png',import.meta.url)),fullPage:true})
 } catch(e) { console.log('Current admin capture unavailable: '+e.message.slice(0,100)) }
} finally {await browser.close()}
