// Cohort constraints: a list of (field, operator, value) ANDed together, serialized into the URL so a cohort is a link.
import { sqlStr } from './db'
import { TABLE_COLS, type TableCol, type Unit } from './measures'

export type Op = 'ge' | 'le' | 'eq' | 'between' | 'blank' | 'notblank' | 'contains' | 'in' | 'yes' | 'no'
export interface Constraint { field: string; op: Op; a?: string; b?: string }

/** Fields a cohort can test: the Explore table columns plus a few identity fields and the modeled hospital layer. */
export interface CohortField { key: string; label: string; unit: Unit; group: string; kind: 'number' | 'text' | 'flag' | 'stars' | 'hospital' }
const extra: CohortField[] = [
  { key: 'overall_rating', label: 'Overall star rating', unit: 'stars', group: 'Ratings', kind: 'stars' },
  { key: 'health_inspection_rating', label: 'Health inspection stars', unit: 'stars', group: 'Ratings', kind: 'stars' },
  { key: 'qm_rating', label: 'Quality measure stars', unit: 'stars', group: 'Ratings', kind: 'stars' },
  { key: 'staffing_rating', label: 'Staffing stars', unit: 'stars', group: 'Ratings', kind: 'stars' },
  { key: 'provider_name', label: 'Facility name', unit: 'text', group: 'Facility', kind: 'text' },
  { key: 'hospital_area', label: "In a hospital's service area (hospital CCN)", unit: 'text', group: 'Facility', kind: 'hospital' },
]
const fromCols: CohortField[] = TABLE_COLS.map((c: TableCol) => ({ key: c.key, label: c.label, unit: c.unit, group: c.group,
  kind: c.unit === 'text' ? (['abuse_icon', 'high_performing_icon', 'vbp_in_program', 'provider_resides_in_hospital', 'ltc_hospital_based'].includes(c.key) ? 'flag' : 'text') : 'number' }))
export const COHORT_FIELDS: CohortField[] = [...extra, ...fromCols]
export const fieldByKey = (k: string) => COHORT_FIELDS.find(f => f.key === k)

export const OPS: Record<CohortField['kind'], { op: Op; label: string }[]> = {
  number: [{ op: 'ge', label: 'at least' }, { op: 'le', label: 'at most' }, { op: 'between', label: 'between' }, { op: 'eq', label: 'equals' }, { op: 'blank', label: 'is blank (suppressed)' }, { op: 'notblank', label: 'has a value' }],
  stars: [{ op: 'in', label: 'is any of' }, { op: 'ge', label: 'at least' }, { op: 'le', label: 'at most' }, { op: 'blank', label: 'not rated' }],
  text: [{ op: 'contains', label: 'contains' }, { op: 'eq', label: 'equals' }, { op: 'blank', label: 'is blank' }, { op: 'notblank', label: 'is not blank' }],
  flag: [{ op: 'yes', label: 'is yes' }, { op: 'no', label: 'is no' }],
  hospital: [{ op: 'in', label: 'is any of (CCNs, comma-separated)' }],
}

/** Strict number: digits with optional sign and decimals. Typed-in '%', '$' and thousands commas are tolerated; hex, exponents, NaN and Infinity are not. */
const num = (s?: string) => { const t = (s ?? '').trim().replace(/[%$,\s]/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null }
export const MAX_CONSTRAINTS = 20, MAX_LIST = 200
/** Why a constraint cannot run, in plain words — or null when it is complete and valid. The page shows this instead of silently ignoring the constraint. */
export function problem(c: Constraint): string | null {
  const f = fieldByKey(c.field); if (!f) return 'Unknown measure.'
  if (f.kind === 'flag' || ['blank', 'notblank'].includes(c.op)) return null
  if (f.kind === 'hospital') { const parts = (c.a ?? '').split(',').map(s => s.trim()).filter(Boolean); if (!parts.length) return 'Enter one or more 6-character hospital CCNs, separated by commas.'; if (parts.length > MAX_LIST) return `At most ${MAX_LIST} CCNs.`; const bad = parts.find(s => !/^[0-9A-Za-z]{6}$/.test(s)); return bad ? `“${bad}” is not a 6-character CCN.` : null }
  if (f.kind === 'text') return (c.a ?? '').trim() ? null : 'Enter some text.'
  if (c.op === 'in') { const parts = (c.a ?? '').split(',').map(s => s.trim()).filter(Boolean); if (!parts.length) return 'Enter star values like 1,2.'; const bad = parts.find(s => !/^[1-5]$/.test(s)); return bad ? `“${bad}” is not a whole star value from 1 to 5.` : null }
  if (num(c.a) == null) return `“${c.a ?? ''}” is not a number.`
  if (c.op === 'between' && num(c.b) == null) return `“${c.b ?? ''}” is not a number.`
  if ((f.kind === 'stars') && !/^[1-5]$/.test((c.a ?? '').trim())) return 'Stars are whole numbers from 1 to 5.'
  return null
}
const likeEsc = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m)
/** Text values: no ';' or control characters (the query layer refuses multi-statement SQL), at most 80 characters. */
const clean = (s?: string) => (s ?? '').replace(/[;\u0000-\u001f]/g, '').slice(0, 80)

/** SQL for one constraint, or null if it is incomplete (ignored). Every value is numeric-checked or sqlStr-escaped. */
export function condSql(c: Constraint): string | null {
  const f = fieldByKey(c.field); if (!f) return null
  const col = f.key
  if (f.kind === 'hospital') {
    const ccns = (c.a ?? '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[0-9A-Z]{6}$/.test(s)).slice(0, MAX_LIST)
    return ccns.length ? `ccn IN (SELECT ccn FROM snf_hospital_area WHERE hospital_ccn IN (${ccns.map(sqlStr).join(',')}))` : null
  }
  if (f.kind === 'flag') return `${col} ${c.op === 'yes' ? '=' : '<>'} 'Y'`
  if (f.kind === 'text') {
    if (c.op === 'blank') return `(${col} IS NULL OR ${col} = '')`
    if (c.op === 'notblank') return `(${col} IS NOT NULL AND ${col} <> '')`
    const v = clean(c.a).trim(); if (!v) return null
    return c.op === 'contains' ? `upper(${col}) LIKE ${sqlStr('%' + likeEsc(v.toUpperCase()) + '%')} ESCAPE '\\'` : `upper(${col}) = ${sqlStr(v.toUpperCase())}`
  }
  // number / stars
  if (c.op === 'blank') return `${col} IS NULL`
  if (c.op === 'notblank') return `${col} IS NOT NULL`
  if (c.op === 'in') { const vals = (c.a ?? '').split(',').map(s => s.trim()).filter(s => /^[1-5]$/.test(s)); return vals.length ? `${col} IN (${vals.join(',')})` : null }
  const a = num(c.a), b = num(c.b)
  if (c.op === 'ge') return a == null ? null : `${col} >= ${a}`
  if (c.op === 'le') return a == null ? null : `${col} <= ${a}`
  if (c.op === 'eq') return a == null ? null : `${col} = ${a}`
  if (c.op === 'between') return a == null || b == null ? null : `${col} BETWEEN ${Math.min(a, b)} AND ${Math.max(a, b)}`
  return null
}
export const whereSql = (conds: Constraint[]) => { const parts = conds.map(condSql).filter((s): s is string => !!s); return parts.length ? parts.join(' AND ') : 'TRUE' }
/** True when the URL carried more constraints than the page keeps (the extra ones are dropped and the page says so). */
export const overflowed = (items: string[]) => items.length > MAX_CONSTRAINTS

// URL form: one `c` parameter per constraint, `field.op.value` (between: `field.between.a_b`). Field keys and ops never contain '.', so the
// first two dots split the parts and a value may contain dots. Values are percent-encoded by URLSearchParams, nothing else.
export function serialize(conds: Constraint[]): string[] {
  return conds.map(c => { const v = c.op === 'between' ? `${c.a ?? ''}_${c.b ?? ''}` : (c.a ?? ''); return [c.field, c.op, v].join('.') })
}
export function parse(items: string[]): Constraint[] {
  return items.map(part => {
    const i = part.indexOf('.'), j = i < 0 ? -1 : part.indexOf('.', i + 1)
    if (i < 0 || j < 0) return null
    const field = part.slice(0, i), op = part.slice(i + 1, j) as Op, v = part.slice(j + 1)
    const c: Constraint = op === 'between' ? { field, op, a: v.split('_')[0], b: v.split('_')[1] ?? '' } : { field, op, a: v }
    return c
  }).filter((c): c is Constraint => !!c && !!fieldByKey(c.field) && OPS[fieldByKey(c.field)!.kind].some(o => o.op === c.op)).slice(0, MAX_CONSTRAINTS)
}
export function describe(c: Constraint): string {
  const f = fieldByKey(c.field); if (!f) return ''
  const op = (OPS[f.kind].find(o => o.op === c.op)?.label ?? c.op).replace(/ \(.*\)$/, '')
  const val = c.op === 'between' ? `${c.a ?? '?'} and ${c.b ?? '?'}` : ['blank', 'notblank', 'yes', 'no'].includes(c.op) ? '' : (c.a ?? '?')
  return `${f.label} ${op} ${val}`.trim()
}

export const GROUPS_BY: { key: string; label: string; expr: string }[] = [
  { key: 'state', label: 'State', expr: 'state' },
  { key: 'county', label: 'County (with state)', expr: "county_parish || ', ' || state" },
  { key: 'ownership', label: 'Ownership type', expr: 'ownership_type' },
  { key: 'chain', label: 'Chain', expr: "coalesce(chain_name, '(independent)')" },
  { key: 'stars', label: 'Overall star rating', expr: "coalesce(CAST(CAST(overall_rating AS INTEGER) AS VARCHAR) || '★', 'not rated')" },
  { key: 'sff', label: 'Special focus status', expr: "coalesce(special_focus_status, 'none')" },
  { key: 'beds', label: 'Size (certified beds)', expr: "CASE WHEN number_of_certified_beds < 60 THEN 'under 60' WHEN number_of_certified_beds < 120 THEN '60–119' WHEN number_of_certified_beds < 180 THEN '120–179' WHEN number_of_certified_beds IS NULL THEN 'unknown' ELSE '180+' END" },
  { key: 'urban', label: 'Urban / rural', expr: "CASE urban WHEN 'Y' THEN 'urban' WHEN 'N' THEN 'rural' ELSE 'unknown' END" },
]
