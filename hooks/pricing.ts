// What a reply cost, estimated from the usage Claude Code writes per API call.
// First-party API list prices in $ per million tokens, as of 2026-09-25; a
// subscription is not billed this way, so this is what the turn would cost
// on the API. Cache writes are 1.25x input for the 5-minute TTL, 2x for 1 hour.
// A model with a long-prompt rate card bills the whole call at it once the
// prompt (input, cache reads and writes) passes its threshold.
type Rates = { input: number; output: number; cacheRead: number }
type Price = Rates & { long?: { overTokens: number } & Rates }

const PRICES: [prefix: string, price: Price][] = [
  // as of 2026-10-06; cache reads 0.1x input on both cards
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01, long: { overTokens: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } }],
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-mythos-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-8', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-7', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-6', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-5', { input: 5, output: 25, cacheRead: 0.5 }],
  // Opus 4 and 4.1
  ['claude-opus-4', { input: 15, output: 75, cacheRead: 1.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-4', { input: 1, output: 5, cacheRead: 0.1 }],
]

export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
}

/** Every token one API call moved: what was read in, and what was written out. */
export function tokensOf(u: Usage): number {
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
}

/** One API call's cost in dollars, or null for a model not in the table. */
export function costOf(model: string | null | undefined, u: Usage): number | null {
  const id = (model ?? '').toLowerCase().split('[')[0]!
  // the longest prefix wins, so opus-5-5 is not priced as opus-5
  const hit = PRICES.filter(([p]) => id.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]
  if (!hit) return null
  const written = u.cache_creation_input_tokens ?? 0
  const prompt = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + written
  const long = hit[1].long
  const p: Rates = long && prompt > long.overTokens ? long : hit[1]
  const hour = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const fiveMin = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : written
  const perTok = (usd: number) => usd / 1_000_000
  return (u.input_tokens ?? 0) * perTok(p.input)
    + (u.output_tokens ?? 0) * perTok(p.output)
    + (u.cache_read_input_tokens ?? 0) * perTok(p.cacheRead)
    + fiveMin * perTok(p.input * 1.25)
    + hour * perTok(p.input * 2)
}
