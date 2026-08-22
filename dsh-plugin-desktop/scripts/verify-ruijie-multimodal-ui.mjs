/** Headless browser smoke for the authenticated local Ruijie Web surface. */

import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const url = process.argv[2]
if (url === undefined) throw new Error('usage: node scripts/verify-ruijie-multimodal-ui.mjs <local-web-url>')
const desktopUrl = new URL(url)
if (!desktopUrl.searchParams.has('dsh-desktop-mode')) desktopUrl.searchParams.set('dsh-desktop-mode', 'compatibility')
if (!desktopUrl.searchParams.has('dsh-desktop-platform')) desktopUrl.searchParams.set('dsh-desktop-platform', 'win32')

const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const executablePath = candidates.find(existsSync)
if (executablePath === undefined) throw new Error('no supported local Chromium browser found')

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--disable-extensions', '--no-first-run'],
})
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(desktopUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 30_000 })
  await new Promise(resolve => { setTimeout(resolve, 2_000) })

  const triggerBeforeOpen = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    const target = buttons.find(button => {
      const copy = [button.textContent, button.getAttribute('aria-label'), button.title].join(' ')
      return /DeepSeek-V4-(?:Flash|Pro)|选择模型|Select model/iu.test(copy)
    })
    target?.click()
    return target === undefined ? null : {
      text: target.innerText.trim(),
      aria: target.getAttribute('aria-label') ?? '',
      title: target.title,
    }
  })
  if (triggerBeforeOpen === null) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 2_000))
    throw new Error(`model selector trigger was not found; renderer errors=${errors.join(' | ')}; body=${body}`)
  }
  await new Promise(resolve => { setTimeout(resolve, 500) })
  const rootPane = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"][aria-label*="模型"], [role="menu"][aria-label*="Model"]')
    const menuItems = [...(menu?.querySelectorAll('button[role="menuitem"]') ?? [])]
    return menuItems.map(button => button.textContent?.trim() ?? '')
  })
  const modelPaneClicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    const modelPane = buttons.find(button => /^(?:模型|Model)(?:\s|$)/iu.test(button.innerText.trim()))
    modelPane?.click()
    return modelPane !== undefined
  })
  if (!modelPaneClicked) throw new Error(`model pane is missing; root pane=${JSON.stringify(rootPane)}`)
  await new Promise(resolve => { setTimeout(resolve, 300) })

  const modelPane = await page.evaluate(() => {
    const bodyText = document.body.innerText
    const buttons = [...document.querySelectorAll('button')].map(button => ({
      text: button.innerText.trim(),
      aria: button.getAttribute('aria-label') ?? '',
      title: button.title,
      role: button.getAttribute('role') ?? '',
      checked: button.getAttribute('aria-checked'),
    }))
    const modelButtons = buttons.filter(button => button.role === 'menuitemradio' && /DeepSeek-V4-(?:Flash|Pro)/u.test(button.text))
    const attachmentButtons = buttons.filter(button => /附件|attach|paperclip|文件|file/iu.test(
      `${button.text} ${button.aria} ${button.title}`,
    ))
    const groupNames = [...document.querySelectorAll('section[role="group"]')]
      .map(section => section.getAttribute('aria-labelledby'))
      .map(id => id === null ? '' : document.getElementById(id)?.textContent?.trim() ?? '')
    return {
      modelButtons,
      attachmentButtons,
      groupNames,
      hasGptChatModel: /GPT[- ]?5|gpt-5\.6-luna/iu.test(bodyText),
      hasVisionSettings: /Vision Router|图片识别/u.test(bodyText),
    }
  })

  await page.evaluate(async () => {
    const trigger = [...document.querySelectorAll('button')].find(button =>
      /DeepSeek-V4-(?:Flash|Pro)|选择模型|Select model/iu.test(
        [button.textContent, button.getAttribute('aria-label'), button.title].join(' '),
      ) && button.getAttribute('aria-haspopup') === 'menu')
    trigger?.click()
    await new Promise(resolve => { setTimeout(resolve, 100) })
    trigger?.click()
  })
  await new Promise(resolve => { setTimeout(resolve, 300) })
  const effortPaneClicked = await page.evaluate(() => {
    const effortPane = [...document.querySelectorAll('button[role="menuitem"]')]
      .find(button => /^(?:推理等级|Effort)(?:\s|$)/iu.test(button.innerText.trim()))
    effortPane?.click()
    return effortPane !== undefined
  })
  await new Promise(resolve => { setTimeout(resolve, 300) })
  const effortButtons = effortPaneClicked
    ? await page.evaluate(() => [...document.querySelectorAll('button[role="menuitemradio"]')].map(button => ({
      text: button.textContent?.trim() ?? '',
      checked: button.getAttribute('aria-checked'),
    })))
    : []

  const snapshot = { triggerBeforeOpen, rootPane, ...modelPane, effortButtons }

  process.stdout.write(`${JSON.stringify({ ...snapshot, errors }, null, 2)}\n`)
  if (errors.length > 0) throw new Error(`renderer errors: ${errors.join(' | ')}`)
  if (snapshot.hasGptChatModel) throw new Error('hidden GPTAuth vision model leaked into the chat UI')
  if (!/DeepSeek-V4-(?:Flash|Pro)/u.test(snapshot.triggerBeforeOpen.text)) {
    throw new Error(`the current DeepSeek model is missing from the trigger: ${JSON.stringify(snapshot.triggerBeforeOpen)}`)
  }
  if (!/High|高/iu.test(`${snapshot.triggerBeforeOpen.text} ${snapshot.triggerBeforeOpen.aria} ${snapshot.triggerBeforeOpen.title}`)) {
    throw new Error(`the selected default reasoning effort is missing from the trigger: ${JSON.stringify(snapshot.triggerBeforeOpen)}`)
  }
  if (snapshot.groupNames.length !== 1 || snapshot.groupNames[0] !== 'DeepSeek') {
    throw new Error(`expected exactly one public DeepSeek model group: ${JSON.stringify(snapshot.groupNames)}`)
  }
  if (!snapshot.modelButtons.some(button => button.text === 'DeepSeek-V4-Flash')) {
    throw new Error('DeepSeek-V4-Flash is missing from the model selector')
  }
  if (!snapshot.modelButtons.some(button => button.text === 'DeepSeek-V4-Pro')) {
    throw new Error('DeepSeek-V4-Pro is missing from the model selector')
  }
  if (snapshot.modelButtons.length !== 2) {
    throw new Error(`expected exactly two public models: ${JSON.stringify(snapshot.modelButtons)}`)
  }
  const efforts = snapshot.effortButtons.map(button => button.text)
  for (const expected of ['Off', 'Low', 'High', 'Max']) {
    if (!efforts.includes(expected)) throw new Error(`${expected} reasoning effort is missing: ${JSON.stringify(efforts)}`)
  }
  if (snapshot.attachmentButtons.length === 0) throw new Error('attachment button was not found')
} finally {
  await browser.close()
}
