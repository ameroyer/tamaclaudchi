// The settings a person can change in /config (plugin.json's userConfig),
// read once each time the module loads: a change there reloads it.
import type { PluginOptions } from 'claude-code'

import { GiB } from './format'

export type Alerts = 'toast' | 'toast and notification' | 'off'

/** Where a hatched or resurrected pet runs: a background session (claude --bg), or a tmux session of its own. */
export type HatchIn = 'background' | 'tmux'

export type Settings = {
  /** The pane opens by itself on a wide terminal when a session starts. */
  autoOpen: boolean
  /** How a pet that needs you is announced. */
  alerts: Alerts
  /** Also announce a pet that has finished its turn. */
  alertOnDone: boolean
  pollMs: number
  /** How far back the graveyard (and the spend page) looks. */
  windowMs: number
  /** A running pet idle this long looks sleepy; 0 never. */
  sleepyMs: number
  /** A running pet's context this full (percent) is announced, and its card offers a compact; 0 never. */
  contextAlertPct: number
  /** How many subagents a pet's page shows, the running ones first. */
  agentsShown: number
  /** Where a new or resurrected pet runs. */
  hatchIn: HatchIn
  /** Claude's disk use turns orange, then red, past these (KiB). */
  diskWarnKb: number
  diskAlarmKb: number
}

const DEFAULTS: Settings = {
  autoOpen: true,
  alerts: 'toast and notification',
  alertOnDone: false,
  pollMs: 4000,
  windowMs: 5 * 86_400_000,
  sleepyMs: 12 * 3_600_000,
  contextAlertPct: 90,
  agentsShown: 6,
  hatchIn: 'background',
  diskWarnKb: 5 * GiB,
  diskAlarmKb: 10 * GiB,
}

/** What the module runs with: the defaults until `applyOptions` reads /config. */
export const settings: Settings = { ...DEFAULTS }

// a number, or one written as text in settings.json
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function applyOptions(o: PluginOptions = {}) {
  const alerts = o.alerts === 'toast' || o.alerts === 'off' || o.alerts === 'toast and notification' ? o.alerts : DEFAULTS.alerts
  Object.assign(settings, {
    autoOpen: typeof o.autoOpen === 'boolean' ? o.autoOpen : DEFAULTS.autoOpen,
    alerts,
    alertOnDone: typeof o.alertOnDone === 'boolean' ? o.alertOnDone : DEFAULTS.alertOnDone,
    pollMs: num(o.pollSeconds, 2, 60, DEFAULTS.pollMs / 1000) * 1000,
    windowMs: num(o.graveyardDays, 1, 30, DEFAULTS.windowMs / 86_400_000) * 86_400_000,
    sleepyMs: num(o.sleepyAfterHours, 0, 24 * 7, DEFAULTS.sleepyMs / 3_600_000) * 3_600_000,
    contextAlertPct: num(o.contextAlertPercent, 0, 100, DEFAULTS.contextAlertPct),
    agentsShown: Math.round(num(o.subagentsShown, 1, 30, DEFAULTS.agentsShown)),
    hatchIn: o.hatchIn === 'tmux' || o.hatchIn === 'background' ? o.hatchIn : DEFAULTS.hatchIn,
    diskWarnKb: num(o.diskWarnGb, 1, 10_000, DEFAULTS.diskWarnKb / GiB) * GiB,
    diskAlarmKb: num(o.diskAlarmGb, 1, 10_000, DEFAULTS.diskAlarmKb / GiB) * GiB,
  } satisfies Settings)
}

/** The window in whole days, as the spend page counts them. */
export const windowDays = () => Math.max(1, Math.round(settings.windowMs / 86_400_000))

/** `in the last 5 days`, as the graveyard and spend pages say. */
export const since = () => {
  const days = windowDays()
  return days === 1 ? 'in the last day' : `in the last ${days} days`
}
