import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir, networkInterfaces } from 'node:os'
import { resolve, join } from 'node:path'
import { createWorkspaceServer } from '../../server/app.mjs'

let app, url, directory
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'night-crew-browser-'))
  app = createWorkspaceServer({ directory, ownerKey: 'browser-test-key-000000000000000', host: '0.0.0.0', port: 0, staticDirectory: resolve('dist') })
  url = await app.listen()
})
test.afterAll(async () => { await app?.close(); if (directory) rmSync(directory, { recursive: true, force: true }) })

test('private generation, live collaboration, selection focus and backup restore', async ({ page, browser }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.getByLabel('New board', { exact: true }).fill('Feature architecture')
  await page.getByRole('button', { name: 'Create board', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Feature architecture', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Saved locally')
  expect(errors).toEqual([])
  const boardId = new URL(page.url()).searchParams.get('board')
  const read = async () => (await page.request.get(`${url}/api/boards/${boardId}`)).json()
  const count = (await read()).elements.filter(e => e.type === 'rectangle').length
  await page.locator('.excalidraw canvas').last().click({ position: { x: 400, y: 300 } })
  await page.keyboard.press('r')
  const bounds = await page.locator('.excalidraw canvas').last().boundingBox()
  await page.mouse.move(bounds.x + 400, bounds.y + 300)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 520, bounds.y + 380, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await read()).elements.filter(e => e.type === 'rectangle').length).toBe(count + 1)
  await page.getByRole('tab', { name: 'Private drafts' }).click()
  await page.getByLabel('Private idea 1', { exact: true }).fill('A private unexplored possibility')
  expect(JSON.stringify(await read())).not.toContain('A private unexplored possibility')
  await page.reload()
  await page.getByRole('tab', { name: 'Private drafts' }).click()
  await expect(page.getByLabel('Private idea 1', { exact: true })).toHaveValue('A private unexplored possibility')
  await page.getByRole('button', { name: 'Reveal my ideas' }).click()
  await expect.poll(async () => JSON.stringify(await read())).toContain('A private unexplored possibility')

  const teammate = await browser.newContext()
  const other = await teammate.newPage()
  await other.goto(page.url())
  await expect(other.getByRole('heading', { name: 'Feature architecture', exact: true })).toBeVisible()
  await other.getByLabel('Add a shared idea').fill('A teammate proposes a simulation')
  await other.getByRole('button', { name: 'Add idea to canvas', exact: true }).click()
  await expect.poll(async () => JSON.stringify(await read())).toContain('A teammate proposes a simulation')
  await other.getByRole('button', { name: 'Converge', exact: true }).click()
  await expect(other.getByLabel('Decision criteria')).toBeVisible()
  await expect(page.getByLabel('Decision criteria')).toBeVisible()
  await page.getByRole('button', { name: 'Diverge', exact: true }).click()
  await expect(other.getByLabel('Add a shared idea')).toBeVisible()
  await page.getByLabel('Vision and context').fill('An unfinished vision draft')
  await page.getByRole('tab', { name: 'Private drafts' }).click()
  await page.getByRole('tab', { name: 'Session', exact: true }).click()
  await expect(page.getByLabel('Vision and context')).toHaveValue('An unfinished vision draft')
  await page.getByRole('button', { name: 'Discard my edit', exact: true }).click()

  // Select the native canvas elements, then scope the MCP request to them.
  await page.locator('.excalidraw canvas').last().click({ position: { x: 25, y: 300 } })
  await page.keyboard.press('Control+a')
  await expect(page.getByRole('button', { name: /Diverge thinking \(/ })).toBeEnabled()
  await page.getByRole('button', { name: /Diverge thinking \(/ }).click()
  await expect(page.getByLabel('Request for your AI chat')).toHaveValue(new RegExp(boardId))
  expect((await read()).focus.elementIds.length).toBeGreaterThan(0)
  const board = await read()
  await page.locator('input[type=file]').setInputFiles({ name: 'team-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'excali-cloud-local', version: 1, board })) })
  await expect(page.getByRole('heading', { name: 'team-backup', exact: true })).toBeVisible()
  mkdirSync('.tmp', { recursive: true })
  await page.screenshot({ path: '.tmp/workspace-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Hide panel', exact: true }).click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.screenshot({ path: '.tmp/workspace-mobile.png' })
  expect(errors).toEqual([])
  await teammate.close()
})

test('private-network invitation supports guest notes without secure-context UUIDs', async ({ page }) => {
  const address = Object.values(networkInterfaces()).flat().find(item => item?.family === 'IPv4' && !item.internal)?.address
  test.skip(!address, 'No private network interface on this test host')
  const headers = { authorization: 'Bearer browser-test-key-000000000000000' }
  const board = await (await page.request.post(`${url}/api/boards`, { headers, data: { name: 'LAN check', template: 'blank' } })).json()
  const { token } = await (await page.request.post(`${url}/api/boards/${board.id}/invite`, { headers, data: {} })).json()
  const lanUrl = url.replace('127.0.0.1', address)
  await page.goto(`${lanUrl}/?board=${board.id}#key=${token}`)
  await expect(page.getByRole('heading', { name: 'LAN check', exact: true })).toBeVisible()
  expect(await page.evaluate(() => isSecureContext)).toBe(false)
  await page.getByLabel('Add a shared idea').fill('A real LAN guest idea')
  await page.getByRole('button', { name: 'Add idea to canvas', exact: true }).click()
  await expect.poll(async () => JSON.stringify(app.store.read(board.id))).toContain('A real LAN guest idea')
  await page.getByRole('tab', { name: 'AI partner', exact: true }).click()
  await page.getByLabel('Discussion message').fill('LAN discussion works')
  await page.getByRole('button', { name: 'Post to discussion', exact: true }).click()
  await expect(page.getByRole('article').getByText('LAN discussion works', { exact: true })).toBeVisible()
})
