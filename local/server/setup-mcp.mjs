import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { localRoot } from './config.mjs'

const root = resolve(localRoot, '..').replaceAll('\\', '/')
const directory = resolve(root, '.codex')
mkdirSync(directory, { recursive: true })
const target = resolve(directory, 'config.toml')
if (existsSync(target)) console.log('Project MCP configuration already exists; leaving it unchanged.')
else {
  writeFileSync(target, `[mcp_servers.night-crew]\ncommand = "node"\nargs = ["local/server/mcp.mjs"]\ncwd = ${JSON.stringify(root)}\nstartup_timeout_sec = 20\ntool_timeout_sec = 30\n`, { flag: 'wx' })
  console.log('Created project MCP configuration. Reopen the project in your AI client to load it.')
}
