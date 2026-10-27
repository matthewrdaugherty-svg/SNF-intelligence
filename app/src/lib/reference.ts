// Reference data shipped as JSON next to the Parquet files (small, loaded once).
import { q } from './db'

export interface Meta { data_vintage: string; release: string; n_facilities: number; window_12m_start: string; built: string; validation: string; hospital_layer?: { pecos_release?: string; hwr_note?: string } }
export interface Footnote { meaning: string; applies_to: string }
export interface Lineage { 'Facility_Master header': string; 'db column': string; source_file: string; original_header: string; how_derived: string }
export interface CatalogRow { source: string; measure_code: string; description: string; resident_type: string | null; used_in_5star: string | null; period: string; master_column: string | null }

const base = () => `${import.meta.env.BASE_URL}data/`
async function json<T>(name: string): Promise<T> { const r = await fetch(base() + name); if (!r.ok) throw new Error(`Could not load ${name}`); return r.json() }

export interface Reference {
  meta: Meta
  footnotes: Record<string, Footnote>
  lineage: Lineage[]
  catalog: CatalogRow[]
  limitations: string[]
  readme: string[]
  reconciliation: { Check: string; Result: string }[]
  national: Record<string, number>          // QRP national + VBP aggregate + state_averages NATION row
  stateAvg: Record<string, Record<string, number | null>>  // by state code
}
let refPromise: Promise<Reference> | null = null
export function getReference(): Promise<Reference> {
  if (refPromise) return refPromise
  refPromise = (async () => {
    const [meta, footnotes, lineage, catalog, limitations, readme, reconciliation, qrpNat, vbpAgg] = await Promise.all([
      json<Meta>('meta.json'), json<Record<string, Footnote>>('footnotes.json'), json<Lineage[]>('lineage.json'), json<CatalogRow[]>('measure_catalog.json'),
      json<string[]>('limitations.json'), json<string[]>('readme.json'), json<{ Check: string; Result: string }[]>('reconciliation.json'),
      json<{ measure_code: string; score: string }[]>('qrp_national.json'), json<Record<string, unknown>[]>('vbp_aggregate.json'),
    ])
    const national: Record<string, number> = {}
    for (const r of qrpNat) { const n = Number(r.score); if (!Number.isNaN(n)) national[r.measure_code] = n }
    for (const [k, v] of Object.entries(vbpAgg[0] ?? {})) { const n = Number(v); if (!Number.isNaN(n)) national[k] = n }
    const rows = await q('SELECT * FROM state_averages')
    const stateAvg: Reference['stateAvg'] = {}
    for (const r of rows) {
      const code = String(r.state_or_nation)
      const rec: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(r)) { if (k === 'state_or_nation' || k === 'processing_date') continue; const n = v == null || v === '' ? null : Number(v); rec[k] = n == null || Number.isNaN(n) ? null : n }
      stateAvg[code] = rec
    }
    return { meta, footnotes, lineage, catalog, limitations, readme, reconciliation, national, stateAvg }
  })()
  return refPromise
}
