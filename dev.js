#!/usr/bin/env node
/**
 * Runs the web app and the TrailBase backend side by side.
 *
 * TrailBase prints the generated admin password exactly once, on the run that
 * bootstraps the depot — miss that line and the only way back in is a password
 * reset. So we watch for it, keep a copy, and reprint it on every start.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const tbDir = join(root, 'services', 'trailbase')
const credentialsFile = join(tbDir, '.admin-credentials.json')
const authComponent = join(tbDir, 'traildepot', 'wasm', 'trailbase_auth_ui_component.wasm')

/*
  Dev is served over TLS so the browser negotiates HTTP/2 — see Caddyfile. The
  app's seven SSE streams do not fit in HTTP/1.1's six-connections-per-origin
  budget, so one collection silently never syncs.

  Caddy owns the public ports; Vite and TrailBase sit 100 above, reachable only
  through it.
*/
const WEB_URL = 'https://localhost:3000'
const TB_URL = 'https://localhost:4000'
const TB_ADDRESS = 'localhost:4100' // Vite's own port lives in apps/web/package.json.
// 5001, not 5000: macOS AirPlay owns 5000. Ollama stays compose-internal.
const AI_URL = 'https://localhost:5001'

// The AI stack is Docker-based and optional: --no-ai skips it (pair with
// FAKE_AI=1 in apps/web/.env for an offline voice loop).
const aiCompose = ['compose', '-f', join(root, 'docker-compose.ai.yml')]
const aiWanted = !process.argv.includes('--no-ai')
let aiState = aiWanted ? 'starting…' : 'off (--no-ai)'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  web: '\x1b[36m',
  tb: '\x1b[35m',
  tls: '\x1b[34m',
  ai: '\x1b[95m',
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
    line('ai', `${c.ai}${AI_URL}${c.reset} ${c.dim}${aiState}${c.reset}`),
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
    if (err.code === 'ENOENT' && command === 'caddy') {
      process.stderr.write(
        `${c.warn}Install Caddy with:${c.reset} brew install caddy\n` +
          `${c.dim}then trust its local CA once:${c.reset} caddy trust\n`,
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
  if (aiState === 'ready') {
    // The containers are detached, so nothing dies with this process — stop
    // them explicitly or Ctrl-C leaves ~4 GB of models resident. Synchronous:
    // process.exit() right after would otherwise outrun an async stop.
    process.stderr.write(`${c.ai}[ai]${c.reset} stopping containers…\n`)
    spawnSync('docker', [...aiCompose, 'stop'], { cwd: root, stdio: 'ignore' })
  }
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
const trailbase = run(
  'tb',
  c.tb,
  'trail',
  ['run', '--address', TB_ADDRESS, '--cors-allowed-origins', WEB_URL],
  { cwd: tbDir },
)
run('web', c.web, 'pnpm', ['--filter', '@tote/web', 'dev'], { cwd: root })
// Terminates TLS on 3000/4000 and forwards to the two above.
run('tls', c.tls, 'caddy', ['run', '--config', join(root, 'Caddyfile')], { cwd: root })

/*
  The AI stack (Open WebUI + Ollama) boots detached rather than as a managed
  child: its health-check chatter would drown the dev console, and compose
  containers survive this process anyway — shutdown() stops them explicitly.
  Unavailable Docker is a warning, not a failure: the voice loop still works
  with FAKE_AI=1, and everything else doesn't need AI at all. Models and env
  come from the root .env (MODEL_CLASSIFY / MODEL_TRANSCRIBE).
*/
if (aiWanted) {
  const up = spawn('docker', [...aiCompose, 'up', '-d'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] })
  let errors = ''
  up.stderr.on('data', (chunk) => (errors += chunk.toString()))
  up.on('error', () => {
    aiState = 'unavailable (docker not installed)'
    process.stderr.write(`${c.warn}[ai] docker not found — voice loop needs FAKE_AI=1${c.reset}\n`)
  })
  up.on('close', (code) => {
    if (shuttingDown) return
    if (code === 0) {
      aiState = 'ready'
      process.stdout.write(`${c.ai}[ai]${c.reset} Open WebUI + Ollama up at ${AI_URL}\n`)
      // (the app's server routes dial 5100 directly — see Caddyfile)
    } else {
      aiState = 'failed to start'
      const hint = errors.includes('daemon') ? ' — is Docker running?' : ''
      process.stderr.write(`${c.warn}[ai] stack failed to start${hint} (--no-ai silences this)${c.reset}\n`)
      process.stderr.write(`${c.dim}${errors.trim().split('\n').slice(-3).join('\n')}${c.reset}\n`)
    }
  })
}

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
