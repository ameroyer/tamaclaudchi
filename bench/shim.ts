// What the plugin imports from 'claude-code' at run time, for the benchmark:
// atoms kept in a plain map on the fake engine (run.ts).
type Ref = { plugin: string; key: string }
type Atom = { ref: Ref; initial: unknown }
type WithState = { __state: Map<string, unknown> }

export const atom = (ref: Ref, initial: unknown): Atom => ({ ref, initial })

export async function read($: WithState, a: Atom) {
  return $.__state.has(a.ref.key) ? $.__state.get(a.ref.key) : a.initial
}

export async function update($: WithState, a: Atom, fn: (v: unknown) => unknown) {
  $.__state.set(a.ref.key, fn(await read($, a)))
}
