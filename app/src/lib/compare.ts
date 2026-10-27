// The compare list: up to 6 CCNs, kept per-browser (localStorage is a convenience, never load-bearing).
import { useSyncExternalStore } from 'react'

const KEY = 'snf.compare'
export const MAX_COMPARE = 6
let list: string[] = (() => { try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as string[]).slice(0, MAX_COMPARE) : [] } catch { return [] } })()
const subs = new Set<() => void>()
function set(next: string[]) { list = next; try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode etc. */ } subs.forEach(f => f()) }
export const compareStore = {
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn) } },
  get: () => list,
  toggle(ccn: string) { set(list.includes(ccn) ? list.filter(c => c !== ccn) : list.length >= MAX_COMPARE ? list : [...list, ccn]) },
  remove(ccn: string) { set(list.filter(c => c !== ccn)) },
  clear() { set([]) },
}
export function useCompare() { return useSyncExternalStore(compareStore.subscribe, compareStore.get, compareStore.get) }
