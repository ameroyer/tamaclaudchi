// Writes a fake Claude Code config folder for the benchmark: many sessions
// across many repos, some with big transcripts, one with a great many
// subagents, and a registry that says which run (run.ts gives them its own
// pid, so the plugin finds them running).
//
//   node bench/fixture.mjs <dir> [pets=300] [live=120] [agents=1000] [bigMb=40]
import { mkdirSync, writeFileSync, appendFileSync, utimesSync, existsSync } from 'node:fs'

const [dir, pets = 300, live = 120, agents = 1000, bigMb = 40] = [process.argv[2], ...process.argv.slice(3).map(Number)]
if (!dir) throw new Error('usage: node bench/fixture.mjs <dir> [pets] [live] [agents] [bigMb]')
const marker = `${dir}/.fixture-${pets}-${live}-${agents}-${bigMb}`
if (existsSync(marker)) process.exit(0)

const now = Date.now()
const REPOS = 40
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']
const uuid = (n, salt = 0) => {
  const h = (n * 2654435761 + salt * 40503) >>> 0
  const hex = (h.toString(16) + n.toString(16).padStart(8, '0') + '0'.repeat(32)).slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
const line = o => JSON.stringify(o) + '\n'
let msg = 0

/** One turn: a typed prompt, a tool call with a result of `pad` bytes, and a reply. */
function turn(id, cwd, model, at, pad) {
  const ts = t => new Date(t).toISOString()
  const usage = { input_tokens: 12, output_tokens: 400, cache_read_input_tokens: 90_000 + (msg % 50_000), cache_creation_input_tokens: 2_000 }
  return line({ type: 'user', sessionId: id, cwd, gitBranch: 'main', timestamp: ts(at), promptSource: 'typed', message: { role: 'user', content: `please look at part ${msg} of the code` } })
    + line({ type: 'assistant', sessionId: id, cwd, gitBranch: 'main', timestamp: ts(at + 1000), message: { id: `msg_${++msg}`, role: 'assistant', model, stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: `toolu_${msg}`, name: 'Read', input: { file_path: `${cwd}/src/f${msg}.ts` } }] } })
    + line({ type: 'user', sessionId: id, cwd, gitBranch: 'main', timestamp: ts(at + 2000), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${msg}`, content: 'x'.repeat(pad) }] } })
    + line({ type: 'assistant', sessionId: id, cwd, gitBranch: 'main', timestamp: ts(at + 3000), message: { id: `msg_${++msg}`, role: 'assistant', model, stop_reason: 'end_turn', usage, content: [{ type: 'text', text: `Done with part ${msg}: it reads fine.` }] } })
}

/** A transcript of about `bytes`, its turns spread over the hours before `end`. */
function transcript(path, id, cwd, model, bytes, end) {
  const pad = bytes > 5e6 ? 60_000 : 4_000
  const turns = Math.max(2, Math.round(bytes / (pad + 1500)))
  let chunk = line({ type: 'ai-title', aiTitle: `work on ${cwd.split('/').pop()} #${id.slice(0, 4)}`, sessionId: id })
  writeFileSync(path, '')
  for (let i = 0; i < turns; i++) {
    chunk += turn(id, cwd, model, end - (turns - i) * 60_000, pad)
    if (chunk.length > 4e6) { appendFileSync(path, chunk); chunk = '' }
  }
  appendFileSync(path, chunk)
  const t = end / 1000
  utimesSync(path, t, t)
}

mkdirSync(`${dir}/projects`, { recursive: true })
mkdirSync(`${dir}/sessions`, { recursive: true })
writeFileSync(`${dir}/settings.json`, '{}')
const ids = []
for (let i = 0; i < pets; i++) {
  const id = uuid(i + 1)
  ids.push(id)
  const repo = `repo${i % REPOS}`
  const cwd = `${dir}/src/${repo}`
  const proj = `${dir}/projects/${cwd.replace(/[^\w]/g, '-')}`
  mkdirSync(proj, { recursive: true })
  mkdirSync(cwd, { recursive: true })
  const isLive = i < live
  // live ones wrote in the last hour, closed ones over the last four days
  const end = isLive ? now - (i % 60) * 60_000 : now - 3600_000 - (i * 977_000) % (4 * 86_400_000)
  const bytes = i < 8 ? bigMb * 1e6 : 200_000 + (i * 7919) % 1_800_000
  transcript(`${proj}/${id}.jsonl`, id, cwd, MODELS[i % MODELS.length], bytes, end)
  if (isLive) {
    writeFileSync(`${dir}/sessions/${100_000 + i}.json`, JSON.stringify({
      pid: process.pid, sessionId: id, cwd, startedAt: end - 3 * 3600_000, updatedAt: now,
      status: i % 5 === 0 ? 'busy' : i % 7 === 0 ? 'waiting' : 'idle', waitingFor: i % 7 === 0 ? 'permission prompt' : undefined,
    }))
  }
  // the first pet has `agents` subagents, the next ten twenty each; a few of each still at work
  const count = i === 0 ? agents : i <= 10 ? 20 : 0
  if (count) {
    const sub = `${proj}/${id}/subagents`
    mkdirSync(sub, { recursive: true })
    for (let n = 0; n < count; n++) {
      const a = `${sub}/agent-a${n.toString(16).padStart(6, '0')}`
      const isRunning = n % 20 === 0
      const at = isRunning ? now - 30_000 : now - 3600_000 - n * 60_000
      let text = ''
      for (let k = 0; k < 6; k++) text += turn(id, cwd, 'claude-haiku-5-5', at - (6 - k) * 5000, 2_000).replaceAll('"type":"user"', '"isSidechain":true,"type":"user"').replaceAll('"type":"assistant"', '"isSidechain":true,"type":"assistant"')
      // a running one's last reply asks for a tool; a finished one ends its turn
      if (isRunning) text = text.slice(0, text.lastIndexOf('{"isSidechain":true,"type":"user"'))
      writeFileSync(`${a}.jsonl`, text)
      writeFileSync(`${a}.meta.json`, JSON.stringify({ agentType: n % 3 ? 'general-purpose' : 'Explore', description: `task ${n}: check module ${n % 97}` }))
      utimesSync(`${a}.jsonl`, at / 1000, at / 1000)
    }
  }
}
writeFileSync(`${dir}/ids.json`, JSON.stringify(ids))
writeFileSync(marker, '')
