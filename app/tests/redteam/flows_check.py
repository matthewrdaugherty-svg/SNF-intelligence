"""Recompute the Flows page numbers in Python (pure Python sums + haversine; DuckDB used only to read facility values)."""
import duckdb, csv, json, math, io
c = duckdb.connect('/home/claude/snf-intel/db/snf.duckdb', read_only=True)
R = json.load(open('/home/claude/snf-intel/app/tests/redteam/out/flows.json'))
cols = ['ccn', 'overall_rating', 'qm_521_adj', 'qrp_004_ppr_pd_rsrr', 'qrp_005_dtc_rs_rate', 'latitude', 'longitude', 'special_focus_status', 'abuse_icon', 'number_of_certified_beds']
F = {r[0]: dict(zip(cols, r)) for r in c.sql(f"select {','.join(cols)} from facility_master").fetchall()}
def hv(a, b, c2, d):
    R_ = 3958.8; p1, p2 = math.radians(a), math.radians(c2)
    return 2 * R_ * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2))
def pct0(x, t): return f"{round(100 * x / t + 1e-12):.0f}%" if t else ''
def check(name, flows, hosp, lat, lng, radius, dump):
    d = {}
    for snf, n in flows:
        d[snf] = d.get(snf, 0) + n
    tot = sum(d.values())
    hi = sum(n for s, n in d.items() if s in F and F[s]['overall_rating'] in (4, 5))
    mid = sum(n for s, n in d.items() if s in F and F[s]['overall_rating'] == 3)
    lo = sum(n for s, n in d.items() if s in F and F[s]['overall_rating'] in (1, 2))
    unm = sum(n for s, n in d.items() if s not in F)
    unr = sum(n for s, n in d.items() if s in F and F[s]['overall_rating'] is None)
    def w(k):
        num = sum(n * F[s][k] for s, n in d.items() if s in F and F[s][k] is not None); den = sum(n for s, n in d.items() if s in F and F[s][k] is not None)
        return num / den if den else None
    import math as _m
    parts = [hi, mid, lo, unr + unm]
    raw = [100 * p / tot for p in parts]; fl = [_m.floor(r) for r in raw]; rem = 100 - sum(fl)
    for i in sorted(range(4), key=lambda i: -(raw[i] - fl[i])):
        if rem <= 0: break
        fl[i] += 1; rem -= 1
    lr = [f"{x}%" for x in fl]
    exp_cards = [[str(tot), f"{len(d)} facilities"], [lr[0], f"{hi} discharges"], [lr[1], f"{mid} discharges"], [lr[2], f"{lo} discharges"], [lr[3], f"{unm} to CCNs not in the CMS file"]]
    act_cards = [[x[1], x[2]] for x in dump['cards']]
    out = [f"## {name} / hospital {hosp}", f"cards expected {exp_cards}", f"cards shown    {act_cards}", f"cards match: {exp_cards == act_cards}"]
    ws = {'overall stars': (w('overall_rating'), 2, ''), 'short-stay rehospitalization': (w('qm_521_adj'), 1, '%'), '30-day preventable readmission after SNF discharge': (w('qrp_004_ppr_pd_rsrr'), 1, '%'), 'discharge to community': (w('qrp_005_dtc_rs_rate'), 1, '%')}
    for lbl, (v, dp, u) in ws.items():
        e = f"{lbl} {v:.{dp}f}{u}" if v is not None else None
        out.append(f"weighted {lbl}: expected {e!r} {'OK' if e and e in dump['weighted'] else 'MISSING/DIFF'} (exact {v})")
    # destination distances
    if lat is not None:
        dest = dump['tables'][0][1:]
        for row in dest:
            pass
        # alternatives
        alts = sorted([(hv(lat, lng, f['latitude'], f['longitude']), s) for s, f in F.items() if f['overall_rating'] in (4, 5) and f['special_focus_status'] is None and f['abuse_icon'] != 'Y' and hv(lat, lng, f['latitude'], f['longitude']) <= radius])
        shown = dump['tables'][1][1:]
        shown = [r for r in shown if len(r) > 1]
        beds = sum(F[s]['number_of_certified_beds'] or 0 for _, s in alts)
        v521 = [F[s]['qm_521_adj'] for _, s in alts if F[s]['qm_521_adj'] is not None]
        out.append(f"alternatives within {radius} mi: expected {len(alts)} facilities / {beds:,} beds / avg521 {sum(v521)/len(v521):.1f}% ; shown rows {len(shown)} ; text: {dump['altText'][:110]}")
        out.append(f"  distances match (1dp): {[f'{x:.1f}' for x, _ in alts] == [r[1] for r in shown]}")
        used = {s for s in d}
        out.append(f"  'already a destination' flags match: {[('yes' if s in used else '') for _, s in alts] == [r[-1] for r in shown]}")
    return out
lines = []
a = list(csv.DictReader(open('flows/a_wellformed.csv')))
for hosp, dk, rad in [('210009', 'a_jhh_15', 15), ('210009', 'a_jhh_5', 5), ('050600', 'a_lac', 5), ('210009', 'a_after_reload', 15)]:
    rows = [r for r in a if r['hospital_ccn'] == hosp]
    lines += check(dk, [(r['snf_ccn'], int(r['n_discharges'])) for r in rows], hosp, float(rows[0]['hospital_lat']), float(rows[0]['hospital_lng']), rad, R[dk])
# b: what a careful parser SHOULD accept: blank count rejected
b_flows = [('215024', 10), ('215024', 15), ('215005', 0), ('15A011', 6), ('999999', 8), ('21Z999', 2), ('215044', 7)]
lines += check('b_edge (blank-count row excluded, as it should be)', b_flows, '210009', 39.2963, -76.5929, 15, R['b_edge.csv'])
lines += check('b_edge (blank-count row counted as 0, as the app does)', b_flows + [('215013', 0)], '210009', 39.2963, -76.5929, 15, R['b_edge.csv'])
print('\n'.join(lines))
