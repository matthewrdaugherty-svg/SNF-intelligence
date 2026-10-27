import type { Unit } from './measures'

const nf = (d: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function fmt(v: unknown, unit: Unit, decimals?: number): string {
  if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) return ''
  if (unit === 'text' || unit === 'date') return String(v)
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  switch (unit) {
    case 'pct': return nf(decimals ?? 1).format(n) + '%'
    case 'per1000': return nf(decimals ?? 2).format(n)
    case 'hours': return nf(decimals ?? 2).format(n)
    case 'count': return nf(0).format(n)
    case 'usd': return usd.format(n)
    case 'ratio': return nf(decimals ?? 2).format(n)
    case 'fraction': return nf(decimals ?? 4).format(n)
    case 'stars': return nf(0).format(n) + '★'
    case 'rank': return '#' + nf(0).format(n)
    case 'score': return nf(decimals ?? 1).format(n)
  }
}
export const fmtInt = (n: number) => nf(0).format(n)
export const fmtPct = (n: number, d = 1) => nf(d).format(n) + '%'
export const fmtUsd = (n: number) => usd.format(n)
export function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[^a-z'’])([a-z])/g, (_, pre, c) => pre + c.toUpperCase()).replace(/\bLlc\b/g, 'LLC').replace(/\bInc\b/g, 'Inc').replace(/\bOf\b/g, 'of').replace(/\bAnd\b/g, 'and').replace(/\bThe\b/g, 'the').replace(/^the\b/, 'The')
}
export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8, toR = (d: number) => d * Math.PI / 180
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
