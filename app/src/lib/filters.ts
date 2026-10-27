// Filter state lives in the URL so any view can be shared as a link. This module converts
// URL params <-> a typed object <-> a SQL WHERE clause over facility_master.
import { sqlStr } from './db'

export interface Filters {
  q: string                 // name / city / chain search
  states: string[]
  county: string
  stars: number[]           // overall rating values to include
  ownership: ('for_profit' | 'non_profit' | 'government')[]
  sff: boolean              // special focus facility or candidate
  abuse: boolean            // abuse icon
  hospital: boolean         // resides in a hospital
  vbp: boolean              // in VBP
  bedsMin: number | null
  bedsMax: number | null
  lat: number | null; lng: number | null; miles: number | null  // catchment radius
  place: string             // label for the radius center
}
export const EMPTY: Filters = { q: '', states: [], county: '', stars: [], ownership: [], sff: false, abuse: false, hospital: false, vbp: false, bedsMin: null, bedsMax: null, lat: null, lng: null, miles: null, place: '' }

export function fromParams(p: URLSearchParams): Filters {
  const num = (k: string) => { const v = p.get(k); return v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v) }
  return {
    q: p.get('q') ?? '',
    states: (p.get('st') ?? '').split(',').filter(Boolean),
    county: p.get('county') ?? '',
    stars: (p.get('stars') ?? '').split(',').filter(Boolean).map(Number).filter(n => n >= 1 && n <= 5),
    ownership: (p.get('own') ?? '').split(',').filter(Boolean) as Filters['ownership'],
    sff: p.get('sff') === '1', abuse: p.get('abuse') === '1', hospital: p.get('hosp') === '1', vbp: p.get('vbp') === '1',
    bedsMin: num('bmin'), bedsMax: num('bmax'),
    lat: num('lat'), lng: num('lng'), miles: num('mi'), place: p.get('place') ?? '',
  }
}
export function toParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base)
  const set = (k: string, v: string | null) => { if (v) p.set(k, v); else p.delete(k) }
  set('q', f.q.trim()); set('st', f.states.join(',')); set('county', f.county.trim()); set('stars', f.stars.join(',')); set('own', f.ownership.join(','))
  set('sff', f.sff ? '1' : null); set('abuse', f.abuse ? '1' : null); set('hosp', f.hospital ? '1' : null); set('vbp', f.vbp ? '1' : null)
  set('bmin', f.bedsMin != null ? String(f.bedsMin) : null); set('bmax', f.bedsMax != null ? String(f.bedsMax) : null)
  set('lat', f.lat != null ? f.lat.toFixed(5) : null); set('lng', f.lng != null ? f.lng.toFixed(5) : null); set('mi', f.miles != null ? String(f.miles) : null); set('place', f.place)
  return p
}
export function isActive(f: Filters) { return toParams(f).toString().length > 0 }
export function countActive(f: Filters) {
  return [f.q, f.states.length, f.county, f.stars.length, f.ownership.length, f.sff, f.abuse, f.hospital, f.vbp, f.bedsMin != null || f.bedsMax != null, f.lat != null && f.miles != null].filter(Boolean).length
}

/** Distance in miles as a SQL expression (haversine on facility lat/long). */
export const distExpr = (lat: number, lng: number) =>
  `2 * 3958.8 * asin(sqrt(pow(sin(radians(latitude - (${lat})) / 2), 2) + cos(radians(${lat})) * cos(radians(latitude)) * pow(sin(radians(longitude - (${lng})) / 2), 2)))`

export function whereClause(f: Filters): string {
  const w: string[] = []
  if (f.q.trim()) { const s = sqlStr('%' + f.q.trim().toUpperCase() + '%'); w.push(`(upper(provider_name) LIKE ${s} OR upper(city_town) LIKE ${s} OR upper(coalesce(chain_name,'')) LIKE ${s} OR ccn LIKE ${sqlStr(f.q.trim().toUpperCase() + '%')})`) }
  if (f.states.length) w.push(`state IN (${f.states.map(sqlStr).join(',')})`)
  if (f.county.trim()) w.push(`upper(county_parish) LIKE ${sqlStr('%' + f.county.trim().toUpperCase() + '%')}`)
  if (f.stars.length) w.push(`overall_rating IN (${f.stars.join(',')})`)
  if (f.ownership.length) {
    const parts: string[] = []
    if (f.ownership.includes('for_profit')) parts.push(`ownership_type LIKE 'For profit%'`)
    if (f.ownership.includes('non_profit')) parts.push(`ownership_type LIKE 'Non profit%'`)
    if (f.ownership.includes('government')) parts.push(`ownership_type LIKE 'Government%'`)
    w.push(`(${parts.join(' OR ')})`)
  }
  if (f.sff) w.push(`special_focus_status IS NOT NULL`)
  if (f.abuse) w.push(`abuse_icon = 'Y'`)
  if (f.hospital) w.push(`provider_resides_in_hospital = 'Y'`)
  if (f.vbp) w.push(`vbp_in_program = 'Y'`)
  if (f.bedsMin != null) w.push(`number_of_certified_beds >= ${f.bedsMin}`)
  if (f.bedsMax != null) w.push(`number_of_certified_beds <= ${f.bedsMax}`)
  if (f.lat != null && f.lng != null && f.miles != null) w.push(`${distExpr(f.lat, f.lng)} <= ${f.miles}`)
  return w.length ? 'WHERE ' + w.join(' AND ') : ''
}

export const STATES = ['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','GU','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY']
