// Renders the app icon from build/icon.svg (docs/features/release.md,
// section 6). Run with Electron, not Node: Chromium is the SVG renderer this
// project already ships, so no image library is needed.
//
//   npm run icon
//     writes build/icon.png, build/icon.ico and resources/icon.png
//   npm run icon -- --preview <dir> [file.svg ...]
//     writes <dir>/<name>-preview.png, a sheet to look at before committing
//
// Each size is drawn from the SVG at that size, never scaled down from a big
// PNG, so small sizes stay as sharp as Chromium can make them.
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIco } from './ico.mjs'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(appDir, 'build', 'icon.svg')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
// electron-builder wants at least 256 px; 512 matches the template it replaces.
const PNG_SIZE = 512

// Runs inside the page, so it may only use browser APIs.
async function rasterizeInPage(svgDataUrl, size) {
  const image = new Image()
  image.src = svgDataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d').drawImage(image, 0, 0, size, size)
  return canvas.toDataURL('image/png').split(',')[1]
}

// Runs inside the page. Shows every size at 1:1 on a dark and a light
// background (Windows taskbars come in both), then 16 and 32 px enlarged
// without smoothing so single pixels can be judged.
async function previewSheetInPage(images) {
  const gap = 24
  const label = 18
  const rowHeight = 256 + label + gap
  const zoomed = [
    { size: 16, scale: 8 },
    { size: 32, scale: 4 }
  ]
  const width = images.reduce((sum, { size }) => sum + size + gap, gap)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = rowHeight * 3 + gap
  const ctx = canvas.getContext('2d')
  ctx.font = '13px sans-serif'

  const decoded = new Map()
  for (const { size, png } of images) {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    decoded.set(size, image)
  }

  const rows = [
    { background: '#1f1f1f', text: '#cccccc' },
    { background: '#f3f3f3', text: '#333333' }
  ]
  rows.forEach(({ background, text }, row) => {
    const top = row * rowHeight
    ctx.fillStyle = background
    ctx.fillRect(0, top, width, rowHeight)
    let x = gap
    for (const { size } of images) {
      ctx.fillStyle = text
      ctx.fillText(`${size}`, x, top + gap)
      ctx.drawImage(decoded.get(size), x, top + gap + label - 8)
      x += size + gap
    }
  })

  const top = rowHeight * 2
  ctx.fillStyle = '#1f1f1f'
  ctx.fillRect(0, top, width, rowHeight + gap)
  ctx.imageSmoothingEnabled = false
  let x = gap
  for (const { size, scale } of zoomed) {
    ctx.fillStyle = '#cccccc'
    ctx.fillText(`${size} px at ${scale}x`, x, top + gap)
    ctx.drawImage(decoded.get(size), x, top + gap + label - 8, size * scale, size * scale)
    x += size * scale + gap
  }
  return canvas.toDataURL('image/png').split(',')[1]
}

async function inPage(win, fn, ...args) {
  const call = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`
  return Buffer.from(await win.webContents.executeJavaScript(call), 'base64')
}

async function main() {
  // Anything unexpected is refused rather than ignored: `npm run icon --
  // draft.svg` must not quietly overwrite the committed icons from icon.svg.
  const args = process.argv.slice(2)
  const usage = 'usage: npm run icon [-- --preview <folder> [file.svg ...]]'
  const previewing = args[0] === '--preview'
  if (args.length > 0 && !previewing) throw new Error(usage)
  const previewDir = previewing ? args[1] : null
  if (previewing && (!previewDir || previewDir.startsWith('-'))) throw new Error(usage)
  const sources = previewing ? args.slice(2) : []
  if (sources.some((source) => source.startsWith('-'))) throw new Error(usage)
  if (sources.length === 0) sources.push(SOURCE)

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  await win.loadURL('about:blank')

  for (const source of sources) {
    const svg = readFileSync(source)
    const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`
    const pngs = []
    for (const size of ICO_SIZES) {
      pngs.push({ size, png: await inPage(win, rasterizeInPage, dataUrl, size) })
    }

    if (previewDir) {
      mkdirSync(previewDir, { recursive: true })
      const sheet = await inPage(
        win,
        previewSheetInPage,
        pngs.map(({ size, png }) => ({ size, png: png.toString('base64') }))
      )
      const out = join(previewDir, `${basename(source, '.svg')}-preview.png`)
      writeFileSync(out, sheet)
      console.log(`wrote ${out}`)
      continue
    }

    // Everything is built before the first write, so a failure leaves the
    // old set intact instead of new PNGs next to an old ICO.
    const large = await inPage(win, rasterizeInPage, dataUrl, PNG_SIZE)
    const ico = buildIco(pngs.map(({ png }) => png))
    writeFileSync(join(appDir, 'build', 'icon.png'), large)
    writeFileSync(join(appDir, 'resources', 'icon.png'), large)
    writeFileSync(join(appDir, 'build', 'icon.ico'), ico)
    console.log('wrote build/icon.png, build/icon.ico and resources/icon.png')
  }
}

app.dock?.hide()
app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (err) => {
      console.error(err)
      app.exit(1)
    }
  )
