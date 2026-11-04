// The benchmark: the plugin's own refresh() and pane, on a fake Claude config
// folder (fixture.mjs), with the real disk and real processes behind a fake
// engine. Prints how long a cold read, a warm poll and a draw take, and where
// the time goes (each process and file call, by kind). See DEVELOPING.md.
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// the JSX factory a hooks module is given: plain nodes, counted
let nodes = 0
;(globalThis as Record<string, unknown>).h = (type: unknown, props: unknown, ...children: unknown[]) => (nodes++, { type, props, children })
;(globalThis as Record<string, unknown>).Fragment = 'Fragment'

const { register, refresh } = await import('../hooks/register')

const dir = process.env.TAMA_FIXTURE!
const ids: string[] = JSON.parse(readFileSync(`${dir}/ids.json`, 'utf8'))
const polls = Number(process.env.TAMA_POLLS ?? 10)
// the registry's sessions run as this process, so the plugin finds them running
for (const f of readdirSync(`${dir}/sessions`)) {
  const reg = JSON.parse(readFileSync(`${dir}/sessions/${f}`, 'utf8'))
  writeFileSync(`${dir}/sessions/${f}`, JSON.stringify({ ...reg, pid: process.pid, updatedAt: Date.now() }))
}

// where the time goes: each call's kind, how many, how long in all
const spent = new Map<string, { n: number; ms: number }>()
async function timed<T>(kind: string, f: () => Promise<T>): Promise<T> {
  const t = performance.now()
  try { return await f() } finally {
    const took = performance.now() - t
    // a slow call is said at once: a run that hangs still tells where
    if (took > 1000) console.log(`    slow: ${Math.round(took)} ms  ${kind}`)
    const s = spent.get(kind) ?? { n: 0, ms: 0 }
    spent.set(kind, { n: s.n + 1, ms: s.ms + performance.now() - t })
  }
}
// a script is named by its first words, a command by its program and first argument
const kindOf = (argv: string[]) => (argv[0] === 'sh' ? `sh: ${argv[2]!.replace(/\s+/g, ' ').slice(0, 40)}` : argv.slice(0, 2).join(' '))

function run(argv: string[], opts: { timeoutMs?: number } = {}) {
  return timed(kindOf(argv), () => new Promise((resolve, reject) => {
    const p = spawn(argv[0]!, argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = [], err: Buffer[] = []
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    const timer = opts.timeoutMs ? setTimeout(() => p.kill('SIGKILL'), opts.timeoutMs) : null
    p.on('error', reject)
    p.on('close', code => {
      if (timer) clearTimeout(timer)
      resolve({ exitCode: code ?? 1, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), isStdoutTruncated: false, isStderrTruncated: false })
    })
  }))
}

const statOf = (path: string) => {
  const s = statSync(path)
  return { kind: s.isDirectory() ? 'dir' : 'file', size: s.size, mtimeMs: s.mtimeMs, isLink: false }
}
const store = new Map<string, unknown>()
const toasts: string[] = []
const $ = {
  __state: new Map<string, unknown>(),
  fs: {
    read: (path: string) => timed('fs.read', async () => readFileSync(path, 'utf8')),
    write: (path: string, text: string) => timed('fs.write', async () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }),
    stat: (path: string) => timed('fs.stat', async () => statOf(path)),
    exists: (path: string) => timed('fs.exists', async () => existsSync(path)),
    list: (path: string) => timed('fs.list', async () => readdirSync(path).map(name => ({ name, ...statOf(`${path}/${name}`) }))),
  },
  process: { run },
  env: { get: async (name: string) => ({ HOME: process.env.HOME, CLAUDE_CONFIG_DIR: dir } as Record<string, string | undefined>)[name] },
  clock: { now: async () => Date.now(), every: () => ({ cancel() {} }) },
  store: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
  session: { id: async () => ids[0], send: async () => ({ isDelivered: true }) },
  command: { register: async () => undefined, run: async () => undefined },
  plugin: { root: process.cwd() },
  ui: {
    toast: (t: string) => void toasts.push(t), log: (t: string) => void toasts.push(t), notify: async () => undefined,
    open: async () => ({ isPlaced: true }), focus: async () => undefined, blit: async () => ({}), copy: async () => ({ isCopied: true }),
    resolve: () => new Proxy({}, { get: (_t, name) => name }),
  },
}

// the plugin's hooks, by event: the pane is drawn by its own render hook
const hooks: { event: string; match: Record<string, unknown> | null; fn: Function }[] = []
register(((event: string, a: unknown, b?: unknown) => hooks.push({ event, match: b ? a as Record<string, unknown> : null, fn: (b ?? a) as Function })) as never, {})
const pane = hooks.find(h => h.event === 'ui.render' && h.match?.component === 'Pane')!.fn
// not its start hook, which reads at once on its own: this session's id, as it sets it
$.__state.set('me', ids[0])

const ms = (t: number) => `${Math.round(t)} ms`
async function draw(label: string) {
  nodes = 0
  const t = performance.now()
  await pane($, { surface: 'terminal', requestId: 'tamaclaudchi', props: { bodyColumns: 140, isFocused: true } })
  console.log(`${label}: ${ms(performance.now() - t)}, ${nodes} elements`)
}
function report(label: string) {
  console.log(`  where ${label} went:`)
  for (const [k, s] of [...spent].sort(([, a], [, b]) => b.ms - a.ms).slice(0, 12)) console.log(`    ${ms(s.ms).padStart(9)}  ×${String(s.n).padEnd(5)} ${k}`)
  spent.clear()
}
// a poll's worth of activity: ten live pets write a turn, the many-agent pet's running agents write
function work(round: number) {
  for (const id of ids.slice(0, 10)) {
    const path = readdirSync(`${dir}/projects`).map(p => `${dir}/projects/${p}/${id}.jsonl`).find(existsSync)!
    appendFileSync(path, JSON.stringify({ type: 'assistant', sessionId: id, timestamp: new Date().toISOString(), message: { id: `msg_bench_${round}_${id}`, role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 50, cache_read_input_tokens: 100_000 }, content: [{ type: 'text', text: 'more work' }] } }) + '\n')
  }
  const sub = readdirSync(`${dir}/projects`).map(p => `${dir}/projects/${p}/${ids[0]}/subagents`).find(existsSync)
  if (sub) for (const f of readdirSync(sub).filter(f => f.endsWith('.jsonl')).slice(0, 50)) utimesSync(`${sub}/${f}`, new Date(), new Date())
}

// when the shelf is first drawn with pets on it: a first read draws before it ends
let firstDrawn = 0
const set = $.__state.set.bind($.__state)
$.__state.set = (k: string, v: unknown) => {
  if (k === 'sessions' && !firstDrawn && Array.isArray(v) && v.length) firstDrawn = performance.now()
  return set(k, v)
}
let t = performance.now()
await refresh($ as never)
console.log(`cold read: ${ms(performance.now() - t)}, the shelf first drawn after ${ms(firstDrawn - t)}`)
report('the cold read')
await draw('shelf drawn')

const times: number[] = []
for (let i = 0; i < polls; i++) {
  work(i)
  t = performance.now()
  await refresh($ as never)
  times.push(performance.now() - t)
}
console.log(`warm poll, ${polls} with activity: avg ${ms(times.reduce((a, b) => a + b, 0) / polls)}, max ${ms(Math.max(...times))}`)
report(`${polls} warm polls`)

// the many-agent pet's page open: its subagents are read at every poll
$.__state.set('selected', ids[0])
t = performance.now()
await refresh($ as never)
console.log(`poll with the many-agent pet open: ${ms(performance.now() - t)}`)
report('that poll')
await draw('its page drawn')
if (toasts.length) console.log(`(${toasts.length} toasts/logs, e.g. ${toasts[0]})`)
process.exit(0)
