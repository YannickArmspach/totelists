#!/usr/bin/env node
/**
 * Runs the web app and the TrailBase backend side by side.
 *
 * TrailBase prints the generated admin password exactly once, on the run that
 * bootstraps the depot — miss that line and the only way back in is a password
 * reset. So we watch for it, keep a copy, and reprint it on every start.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const tbDir = join(root, 'services', 'trailbase')
const credentialsFile = join(tbDir, '.admin-credentials.json')
const authComponent = join(tbDir, 'traildepot', 'wasm', 'trailbase_auth_ui_component.wasm')

const WEB_URL = 'http://localhost:3000'
const TB_URL = 'http://localhost:4000'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  web: '\x1b[36m',
  tb: '\x1b[35m',
  key: '\x1b[32m',
  warn: '\x1b[33m',
}

function prefixed(label, colour, stream) {
  let buffered = ''
  return (chunk) => {
    buffered += chunk.toString()
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) stream.write(`${colour}[${label}]${c.reset} ${line}\n`)
  }
}

function readCredentials() {
  try {
    return JSON.parse(readFileSync(credentialsFile, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Pull the credentials out of TrailBase's bootstrap log, which looks like:
 *
 *   Created new admin user:
 *     email: 'admin@localhost'
 *     password: 'hunter2'
 */
function scanForCredentials(text) {
  const email = text.match(/email:\s*'([^']+)'/)
  const password = text.match(/password:\s*'([^']+)'/)
  return email && password ? { email: email[1], password: password[1] } : null
}

function banner(credentials) {
  const line = (label, value) => `  ${c.dim}${label.padEnd(10)}${c.reset}${value}`
  const out = [
    '',
    `${c.bold}Tote dev${c.reset} ${c.dim}— say it, we bag it.${c.reset}`,
    line('app', `${c.web}${WEB_URL}${c.reset}`),
    line('admin', `${c.tb}${TB_URL}/_/admin/${c.reset}`),
    line('sign in', `${c.web}${WEB_URL}/login${c.reset}`),
  ]
  if (credentials) {
    out.push(
      line('email', `${c.key}${credentials.email}${c.reset}`),
      line('password', `${c.key}${credentials.password}${c.reset}`),
    )
  }
  out.push('')
  process.stdout.write(out.join('\n'))
}

// The auth UI is a WASM component living under traildepot/wasm, which TrailBase
// gitignores — a fresh clone has to fetch it again before /_/auth/login exists.
if (!existsSync(authComponent)) {
  process.stdout.write(`${c.warn}Installing the TrailBase auth UI component…${c.reset}\n`)
  const add = spawn('trail', ['components', 'add', 'trailbase/auth_ui'], {
    cwd: tbDir,
    stdio: 'inherit',
  })
  await new Promise((resolve) => add.on('close', resolve))
}

const children = []

function run(label, colour, command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['inherit', 'pipe', 'pipe'] })
  child.stdout.on('data', prefixed(label, colour, process.stdout))
  child.stderr.on('data', prefixed(label, colour, process.stderr))
  child.on('error', (err) => {
    process.stderr.write(`${c.warn}[${label}] failed to start: ${err.message}${c.reset}\n`)
    if (err.code === 'ENOENT' && command === 'trail') {
      process.stderr.write(
        `${c.warn}Install TrailBase with:${c.reset} curl -sSL https://trailbase.io/install.sh | bash\n` +
          `${c.dim}(it lands in ~/.local/bin, which must be on your PATH)${c.reset}\n`,
      )
    }
    shutdown(1)
  })
  child.on('close', (code) => {
    process.stderr.write(`${c.warn}[${label}] exited (${code})${c.reset}\n`)
    shutdown(code ?? 0)
  })
  children.push(child)
  return child
}

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

/*
  `--cors-allowed-origins` rather than `--dev`. Both open CORS to the web app,
  but `--dev` also relaxes cookies to SameSite=None, which the app has no use
  for: it authenticates with bearer tokens and never reads a cookie. Strict is
  what production gets too, so dev behaves the same way.
*/
const trailbase = run('tb', c.tb, 'trail', ['run', '--cors-allowed-origins', WEB_URL], {
  cwd: tbDir,
})
run('web', c.web, 'pnpm', ['--filter', '@tote/web', 'dev'], { cwd: root })

let credentials = readCredentials()
let bannerShown = false

function showBanner(creds) {
  if (bannerShown) return
  bannerShown = true
  banner(creds)
}

// Only the bootstrap run prints credentials; on every other run this never fires
// and the stored copy is what the banner shows.
if (!credentials) {
  // The email and password sit on separate lines, which may land in separate
  // chunks, so match against everything seen so far rather than one chunk.
  let seen = ''
  const watch = (chunk) => {
    seen += chunk.toString()
    const found = scanForCredentials(seen)
    if (!found) return
    credentials = found
    writeFileSync(credentialsFile, `${JSON.stringify(found, null, 2)}\n`)
    trailbase.stdout.off('data', watch)
    trailbase.stderr.off('data', watch)
    showBanner(found)
  }
  trailbase.stdout.on('data', watch)
  trailbase.stderr.on('data', watch)
}

setTimeout(() => showBanner(credentials), 2500)
