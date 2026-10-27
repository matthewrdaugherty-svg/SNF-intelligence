import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Feature, Point as GPoint } from 'geojson'
import { q } from '../lib/db'
import { fromParams, toParams, whereClause, distExpr, type Filters } from '../lib/filters'
import FilterPanel from '../components/FilterPanel'
import { QualityStrip, Empty } from '../components/ui'
import { titleCase } from '../lib/format'

// MapLibre 6 loads its worker from a sibling file the bundler doesn't copy; point it at the bundled copy.
maplibregl.setWorkerUrl(maplibreWorkerUrl)
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const FALLBACK_STYLE: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9edec' } }] }
async function loadStyle(): Promise<{ style: maplibregl.StyleSpecification | string; fallback: boolean }> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000)
    const r = await fetch(STYLE, { signal: ctl.signal }); clearTimeout(t)
    if (!r.ok) throw new Error(String(r.status))
    return { style: (await r.json()) as maplibregl.StyleSpecification, fallback: false }
  } catch { return { style: FALLBACK_STYLE, fallback: true } }
}
const RAMP = ['#d6e3df', '#a9cbc3', '#6faea2', '#3c8c7e', '#1f6659']

function circlePolygon(lat: number, lng: number, miles: number): Feature {
  const km = miles * 1.609344, pts: [number, number][] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    const dLat = (km / 111.32) * Math.cos(a), dLng = (km / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(a)
    pts.push([lng + dLng, lat + dLat])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }
}

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const f = useMemo(() => fromParams(params), [params])
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [pinMode, setPinMode] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [noBasemap, setNoBasemap] = useState(false)
  const pinModeRef = useRef(pinMode); pinModeRef.current = pinMode
  const fRef = useRef(f); fRef.current = f
  const hasDist = f.lat != null && f.lng != null

  const onFilters = (nf: Filters) => setParams(toParams(nf, params), { replace: true })

  useEffect(() => {
    let live = true
    const sel = ['ccn', 'provider_name', 'city_town', 'state', 'latitude', 'longitude', 'overall_rating', 'health_inspection_rating', 'qm_rating', 'staffing_rating', 'special_focus_status', 'abuse_icon', 'number_of_certified_beds', 'qm_521_adj']
    if (hasDist) sel.push(`${distExpr(f.lat!, f.lng!)} AS distance_mi`)
    q(`SELECT ${sel.join(', ')} FROM facility_master ${whereClause(f)} ORDER BY ${hasDist ? 'distance_mi' : 'provider_name'} ASC NULLS LAST`).then(r => { if (live) setRows(r) })
    return () => { live = false }
  }, [f, hasDist])

  // map init once
  useEffect(() => {
    if (!mapEl.current || map.current) return
    let created: maplibregl.Map | null = null
    let disposed = false
    loadStyle().then(({ style, fallback }) => {
    if (disposed || !mapEl.current) return
    setNoBasemap(fallback)
    const m = new maplibregl.Map({ container: mapEl.current, style, center: [-96, 38.5], zoom: 3.6, attributionControl: false })
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: fallback ? 'Basemap unavailable' : '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors' }), 'bottom-right')
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.current = m; created = m
    m.on('load', () => {
      m.addSource('fac', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#15221e', 'fill-opacity': 0.05 } })
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#15221e', 'line-width': 1.2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'fac', type: 'circle', source: 'fac', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 9, 6, 13, 9],
        'circle-color': ['match', ['get', 'stars'], 1, RAMP[0], 2, RAMP[1], 3, RAMP[2], 4, RAMP[3], 5, RAMP[4], '#ffffff'],
        'circle-stroke-color': ['case', ['boolean', ['get', 'flag'], false], '#b4532a', '#15221e'],
        'circle-stroke-width': ['case', ['boolean', ['get', 'flag'], false], 1.8, 0.6],
        'circle-opacity': 0.92,
      } })
      m.on('mouseenter', 'fac', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'fac', () => { m.getCanvas().style.cursor = pinModeRef.current ? 'crosshair' : '' })
      m.on('click', 'fac', (e: maplibregl.MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties as Record<string, unknown> | undefined
        if (!p) return
        setSelected(String(p.ccn))
        new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat((e.features![0].geometry as GPoint).coordinates as [number, number])
          .setHTML(`<div style="font-size:13px;font-weight:600;color:#15221e">${titleCase(String(p.name))}</div><div style="font-size:12px;color:#4a5753">${titleCase(String(p.city))}, ${p.state} · ${p.stars ? p.stars + '★ overall' : 'not rated'}</div><a href="/facility/${p.ccn}" style="font-size:12px;color:#15221e;text-decoration:underline">Open profile</a>`)
          .addTo(m)
      })
      m.on('click', (e: maplibregl.MapMouseEvent) => {
        if (!pinModeRef.current) return
        const feats = m.queryRenderedFeatures(e.point, { layers: ['fac'] })
        if (feats.length) return
        const cur = fRef.current
        setParams(toParams({ ...cur, lat: e.lngLat.lat, lng: e.lngLat.lng, miles: cur.miles ?? 15, place: 'Dropped pin' }, new URLSearchParams(window.location.search)), { replace: true })
        setPinMode(false)
      })
      setMapReady(true)
    })
    })
    return () => { disposed = true; created?.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // push data
  useEffect(() => {
    const m = map.current; if (!m || !mapReady || !rows) return
    const feats: Feature[] = rows.filter(r => r.latitude != null && r.longitude != null).map(r => ({
      type: 'Feature', properties: { ccn: r.ccn, name: r.provider_name, city: r.city_town, state: r.state, stars: r.overall_rating == null ? null : Number(r.overall_rating), flag: !!r.special_focus_status || r.abuse_icon === 'Y' },
      geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude)] },
    }))
    ;(m.getSource('fac') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
    if (hasDist) {
      ;(m.getSource('radius') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [circlePolygon(f.lat!, f.lng!, f.miles ?? 15)] })
      const km = (f.miles ?? 15) * 1.609344, dLat = km / 111.32, dLng = km / (111.32 * Math.cos(f.lat! * Math.PI / 180))
      m.fitBounds([[f.lng! - dLng, f.lat! - dLat], [f.lng! + dLng, f.lat! + dLat]], { padding: 40, duration: 500 })
    } else {
      ;(m.getSource('radius') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] })
      if (feats.length && feats.length < 14000) {
        const b = new maplibregl.LngLatBounds()
        feats.forEach(ft => b.extend((ft.geometry as GPoint).coordinates as [number, number]))
        m.fitBounds(b, { padding: 40, duration: 500, maxZoom: 11 })
      }
    }
  }, [rows, mapReady, hasDist, f.lat, f.lng, f.miles])
  useEffect(() => { const m = map.current; if (m) m.getCanvas().style.cursor = pinMode ? 'crosshair' : '' }, [pinMode])

  const list = rows ?? []
  return (
    <div className="flex h-[calc(100dvh-52px)]">
      <FilterPanel f={f} onChange={onFilters} resultCount={rows?.length ?? null} />
      <section className="flex-1 min-w-0 relative">
        <div ref={mapEl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />  {/* inline: maplibre's unlayered CSS overrides Tailwind utilities */}
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
          <button className={`press btn text-sm ${pinMode ? 'btn-primary' : 'btn-surface here'}`} aria-pressed={pinMode} onClick={() => setPinMode(p => !p)}>{pinMode ? 'Click the map to set the center' : hasDist ? 'Move pin' : 'Drop a pin for a radius'}</button>
          {hasDist && <div className="bg-surface here rounded-[6px] px-3 py-1.5 text-sm text-ink-2">{f.miles} mi around {f.place || 'pin'}</div>}
          {noBasemap && <div className="bg-surface here rounded-[6px] px-3 py-1.5 text-xs text-ink-2">The street basemap could not be reached; facilities are still shown.</div>}
        </div>
        <div className="absolute bottom-3 left-3 bg-surface here rounded-[6px] px-3 py-2 text-[11px] text-ink-2 flex items-center gap-2 z-10">
          <span>Overall stars</span>{RAMP.map((c, i) => <span key={i} className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: c, border: '0.6px solid #15221e' }} />{i + 1}</span>)}
          <span className="inline-flex items-center gap-1 ml-2"><span className="inline-block w-3 h-3 rounded-full bg-white" style={{ border: '0.6px solid #15221e' }} />not rated</span>
          <span className="inline-flex items-center gap-1 ml-2"><span className="inline-block w-3 h-3 rounded-full bg-white" style={{ border: '1.8px solid #b4532a' }} />special focus or abuse icon</span>
        </div>
      </section>
      <aside className="w-80 shrink-0 border-l border-hairline bg-surface overflow-y-auto" aria-label="Facilities on the map">
        <div className="px-4 py-3 text-sm text-ink-2 border-b border-hairline">{rows ? <><span className="text-ink font-medium tabular-nums" data-testid="result-count">{rows.length.toLocaleString()}</span> facilities{hasDist ? ', nearest first' : ''}</> : 'Loading…'}</div>
        {rows && rows.length === 0 && <Empty title="Nothing here.">Widen the radius or clear a filter.</Empty>}
        {list.slice(0, 400).map(r => {
          const ccn = String(r.ccn)
          return (
            <Link key={ccn} to={`/facility/${ccn}`} className={`block px-4 py-2 border-b border-hairline/60 hover:bg-paper ${selected === ccn ? 'bg-paper here relative z-10' : ''}`}
              onMouseEnter={() => { const m = map.current; if (m && r.latitude != null) { /* no-op highlight to keep the UI quiet */ } }}>
              <div className="text-sm text-ink truncate">{titleCase(String(r.provider_name))}</div>
              <div className="flex items-center justify-between mt-0.5">
                <div className="text-[11px] text-ink-3 truncate">{titleCase(String(r.city_town))}{r.distance_mi != null ? ` · ${Number(r.distance_mi).toFixed(1)} mi` : ''}{r.qm_521_adj != null ? ` · rehosp ${Number(r.qm_521_adj).toFixed(1)}%` : ''}</div>
                <QualityStrip row={r} />
              </div>
            </Link>
          )
        })}
        {list.length > 400 && <div className="px-4 py-3 text-xs text-ink-3">Showing the first 400. Narrow the filters or set a radius to see the rest in the list.</div>}
      </aside>
    </div>
  )
}
