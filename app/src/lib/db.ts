// In-browser DuckDB over the validated Arrow exports (Arrow is read natively; Parquet would need a runtime extension download). One instance per page load.
import * as duckdb from '@duckdb/duckdb-wasm'
import { tableFromIPC } from 'apache-arrow'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

export type Row = Record<string, unknown>

const FILES = ['facility_master', 'penalties', 'citations_gl', 'state_averages', 'inspection_cutpoints', 'ownership', 'hospital_master', 'hospital_service_area', 'snf_utilization', 'hospital_system', 'hospital_owner_org', 'hospital_family', 'hospital_family_member', 'snf_pecos'] as const

let dbPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null
let progressListeners: ((msg: string) => void)[] = []
export function onProgress(fn: (msg: string) => void) { progressListeners.push(fn); return () => { progressListeners = progressListeners.filter(f => f !== fn) } }
const report = (m: string) => progressListeners.forEach(f => f(m))

async function init(): Promise<duckdb.AsyncDuckDBConnection> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  })
  report('Starting database')
  const worker = new Worker(bundle.mainWorker!, { type: 'module' })
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  const base = `${import.meta.env.BASE_URL}data/`
  const conn = await db.connect()
  for (const f of FILES) {
    report(`Loading ${f.replace(/_/g, ' ')}`)
    const res = await fetch(`${base}${f}.arrow`)
    if (!res.ok) throw new Error(`Could not load ${f}.arrow (${res.status})`)
    const table = tableFromIPC(new Uint8Array(await res.arrayBuffer()))
    if (table.numRows === 0) throw new Error(`${f}.arrow is empty`)   // insertArrowTable never returns on an empty table
    await conn.insertArrowTable(table, { name: f, create: true })
  }
  // Discharge flows the user uploads live here for the session. Fixed schema = the plug-in contract (see Flows page and docs/DECISION_LOG.md D-013).
  await conn.query(`CREATE TABLE user_flows (hospital_ccn VARCHAR, hospital_name VARCHAR, snf_ccn VARCHAR, period_start DATE, period_end DATE, n_discharges INTEGER, source VARCHAR, method VARCHAR, loaded_at DATE)`)
  await conn.query(`CREATE TABLE user_hospitals (hospital_ccn VARCHAR, hospital_name VARCHAR, lat DOUBLE, lng DOUBLE)`)
  // MODELED layer (decision D-013): which SNFs serve a hospital's service area. Observed inputs: the hospital's visible
  // patient-ZIP volumes (CMS Hospital Service Area file) and each SNF's Medicare stays (PAC PUF). Model: a hospital's volume
  // from a ZIP is split among the SNFs located in that ZIP in proportion to their Medicare stays (equal split if none report volume).
  report('Building service-area model')
  await conn.query(`CREATE TABLE snf_hospital_area AS
    WITH s AS (SELECT f.ccn, f.zip_code AS zip, coalesce(u.medicare_stays_2024, 0) AS stays FROM facility_master f LEFT JOIN snf_utilization u USING (ccn)),
    z AS (SELECT zip, sum(stays) AS zip_stays, count(*) AS zip_snfs FROM s GROUP BY zip)
    SELECT a.hospital_ccn, s.ccn, a.zip, a.cases AS hospital_cases_from_zip, a.share_of_visible_cases AS zip_share, a.zip_rank, a.cumulative_share, s.stays AS snf_medicare_stays_2024, z.zip_snfs,
           a.share_of_visible_cases * (CASE WHEN z.zip_stays > 0 THEN s.stays / z.zip_stays ELSE 1.0 / z.zip_snfs END) AS modeled_weight
    FROM hospital_service_area a JOIN s ON s.zip = a.zip JOIN z ON z.zip = a.zip`)
  report('Ready')
  return conn
}

export function getDb() { if (!dbPromise) dbPromise = init(); return dbPromise }

/** Run a query and return plain JS rows. BigInt -> number, Arrow dates -> ISO strings. */
export async function q<T extends Row = Row>(sql: string): Promise<T[]> {
  if (sql.includes(';')) throw new Error('Refusing to run a multi-statement query')   // every input is whitelisted or sqlStr-escaped; this is the backstop
  const conn = await getDb()
  const table = await conn.query(sql)
  const names = table.schema.fields.map(f => f.name)
  const types = table.schema.fields.map(f => String(f.type))
  const out: T[] = []
  for (const batch of table.batches) {
    for (let i = 0; i < batch.numRows; i++) {
      const r: Row = {}
      for (let c = 0; c < names.length; c++) {
        let v = batch.getChildAt(c)?.get(i)
        if (typeof v === 'bigint') v = Number(v)
        else if (v instanceof Date) v = v.toISOString().slice(0, 10)
        else if (v != null && /^Date/.test(types[c]) && typeof v === 'number') v = new Date(v).toISOString().slice(0, 10)
        r[names[c]] = v
      }
      out.push(r as T)
    }
  }
  return out
}

export const sqlStr = (s: string) => `'${String(s).replace(/'/g, "''")}'`
