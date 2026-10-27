// Display names for hospital systems (PECOS ownership families). CMS publishes legal entity names
// ("ADVENTIST HEALTH SYSTEM SUNBELT HEALTHCARE CORPORATION"); people know brands ("AdventHealth").
// Two layers, both reversible: a mechanical clean-up (title case, corporate suffixes dropped) and a short
// hand-curated list of brand names for entities whose legal name does not say who they are. The curated
// list is documented on the Methods page; the legal name is always one toggle (or hover) away. D-034.
import { useSyncExternalStore } from 'react'
import { titleCase } from './format'

/** Legal label in PECOS (exact, upper case) → brand name. Only entries whose brand is public and unambiguous;
 *  where the family's own aliases carry the brand (Ardent, Surgery Partners, Quorum, Summit, Henry Ford) that is the evidence. */
export const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  'ADVENTIST HEALTH SYSTEM SUNBELT HEALTHCARE CORPORATION': 'AdventHealth',
  'AHP HEALTH PARTNERS, INC': 'Ardent Health',
  'CHS COMMUNITY HEALTH SYSTEMS INC': 'Community Health Systems',
  'IHC HEALTH SERVICES INC': 'Intermountain Health',
  'OCEANS MIDCO, INC.': 'Oceans Healthcare',
  'SP HOLDCO I INC': 'Surgery Partners',
  'KNIGHT HEALTH II LLC': 'ScionHealth',
  'QUINCY HEALTH LLC': 'Quorum Health',
  'SPERRY HOLDCO LLC': 'Summit BHC',
  'HENRY FORD HEALTH PARENT': 'Henry Ford Health',
  'THE CHARLOTTE-MECKLENBURG HOSPITAL AUTHORITY': 'Atrium Health',
  'WEST VIRGINIA UNITED HEALTH SYSTEM, INC': 'WVU Medicine',
  'SANFORD': 'Sanford Health',
  'USP DOMESTIC HOLDINGS INC': 'USPI (USP Domestic Holdings)',
  'USPI GROUP HOLDINGS INC': 'USPI (USPI Group Holdings)',
  'USPI HOLDINGS INC': 'USPI (USPI Holdings)',
  'USPI HOLDING COMPANY INC': 'USPI (USPI Holding Company)',
  'UNITED SURGICAL PARTNERS INTERNATIONAL INC': 'USPI (United Surgical Partners International)',
  'UNITED SURGICAL PARTNERS HOLDINGS INC': 'USPI (United Surgical Partners Holdings)',
}

const SUFFIX = /[\s,]+(INC\.?|LLC\.?|L\.?L\.?C\.?|CORPORATION|CORP\.?|COMPANY|CO\.?|LP|L\.P\.|LLLP|INCORPORATED)\s*$/i
/** Mechanical clean-up: title case and corporate suffixes dropped ("TRINITY HEALTH CORPORATION" → "Trinity Health"). */
export function cleanName(label: string) {
  let s = label.trim()
  for (let i = 0; i < 2; i++) s = s.replace(SUFFIX, '')
  return titleCase(s)
}
/** The friendly form: curated brand if listed, else the mechanical clean-up. */
export const friendlyName = (label: string) => SYSTEM_DISPLAY_NAMES[label.trim().toUpperCase()] ?? cleanName(label)

// ---- the toggle (per browser; friendly by default) ----
export type NameMode = 'friendly' | 'legal'
const KEY = 'snf.systemNames'
const listeners = new Set<() => void>()
let mode: NameMode = (() => { try { return localStorage.getItem(KEY) === 'legal' ? 'legal' : 'friendly' } catch { return 'friendly' } })()
export const nameMode = {
  get: () => mode,
  set: (m: NameMode) => { mode = m; try { localStorage.setItem(KEY, m) } catch { /* private window: the choice lives for this page only */ } listeners.forEach(l => l()) },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
}
export const useNameMode = () => useSyncExternalStore(nameMode.subscribe, nameMode.get, nameMode.get)
/** Hook: how to show a system label under the current setting, with the other form for the tooltip. */
export function useSystemName() {
  const m = useNameMode()
  return (label: string) => {
    const friendly = friendlyName(label), legal = titleCase(label)
    return m === 'legal' ? { text: legal, title: friendly !== legal ? `Display name: ${friendly}` : undefined } : { text: friendly, title: friendly !== legal ? `Legal name (PECOS): ${legal}` : undefined }
  }
}
