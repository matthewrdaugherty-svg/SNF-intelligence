"""Independent (pure-Python) recomputation of a placement scenario from the replica tables. No SQL beyond pulling raw rows."""
import math, sys
from collections import defaultdict
from scenario_replica import con   # same Arrow files the app loads

def hav(a, b):
    la1, lo1 = map(math.radians, a); la2, lo2 = map(math.radians, b)
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))

def run(h, minStars=4, excludeFlags=True, snfOnly=True, units=(), minOverlap=None, maxMiles=10, k=3, shift=1.0, verbose=True, optimal=False, objective='readmit', n=None):
    """optimal=True: shift=1, candidates ranked by the objective (nulls last), then rating desc, then QRP 004 asc, then miles; fill the best with room, spill to the next.
    Capacity (both modes): empty beds × 365 ÷ the facility's Medicare ALOS (national median when missing), in stays/yr, against n = annual SNF discharges
    (given, else hospital 2024 Medicare discharges × 0.187 per MedPAC)."""
    if optimal: shift = 1.0
    cols = ['ccn', 'overall_rating', 'special_focus_status', 'abuse_icon', 'provider_type', 'beds_ventilator', 'beds_dialysis', 'beds_alzheimers', 'beds_hospice', 'beds_head_trauma', 'beds_rehab', 'latitude', 'longitude', 'qm_521_adj', 'qrp_004_ppr_pd_rsrr', 'qrp_005_dtc_rs_rate', 'provider_name', 'number_of_certified_beds', 'average_number_of_residents_per_day']
    F = {r[0]: dict(zip(cols, r)) for r in con.execute(f"select {','.join(cols)} from facility_master").fetchall()}
    U = {r[0]: (r[1], r[2]) for r in con.execute("select ccn, medicare_payment_2024, medicare_stays_2024 from snf_utilization").fetchall()}
    DAYS = {r[0]: (r[1], r[2]) for r in con.execute("select ccn, medicare_days_2024, medicare_stays_2024 from snf_utilization").fetchall()}
    med_alos = con.execute("select quantile_cont(medicare_days_2024*1.0/medicare_stays_2024, 0.5) from snf_utilization where medicare_stays_2024 > 0").fetchone()[0]
    if n is None:
        r = con.execute("select medicare_discharges_2024 from hospital_master where hospital_ccn = ?", [h]).fetchone()
        n = round(r[0] * 0.187) if r and r[0] is not None else None
    def capacity_stays(c):
        f = F[c]; d, st = DAYS.get(c, (None, None))
        alos = (d / st) if (st and st > 0 and d is not None) else med_alos
        empty = max((f['number_of_certified_beds'] or 0) - (f['average_number_of_residents_per_day'] or 0), 0) if f['number_of_certified_beds'] is not None and f['average_number_of_residents_per_day'] is not None else 0
        return empty * 365.0 / alos
    def pay_of(c):
        p, st = U.get(c, (None, None)); return (p / st) if (st and st > 0 and p is not None) else None
    # baseline
    base = defaultdict(float)
    for ccn, w in con.execute("select ccn, modeled_weight from snf_hospital_area where hospital_ccn = ?", [h]).fetchall():
        base[ccn] += w
    tot = sum(base.values())
    base = {c: w / tot for c, w in base.items()} if tot > 0 else {}
    # overlap (hospital x snf) by MDC-chapter histogram intersection, with known>=0.6
    hs = dict(con.execute("select chapter, share from hospital_chapter_mix where hospital_ccn = ?", [h]).fetchall())
    ss = defaultdict(dict)
    for ccn, ch, sh in con.execute("select ccn, chapter, share from snf_chapter_mix").fetchall():
        ss[ccn][ch] = sh
    def overlap(ccn):
        s = ss.get(ccn, {}); known = sum(v for v in s.values() if v is not None)
        if known < 0.6: return None
        return sum(min(hs.get(ch, 0), v) for ch, v in s.items() if v is not None and ch in hs)
    unitcol = {'vent': 'beds_ventilator', 'dialysis': 'beds_dialysis', 'alz': 'beds_alzheimers', 'hospice': 'beds_hospice', 'trauma': 'beds_head_trauma', 'rehab': 'beds_rehab'}
    def viable(f):
        if f['overall_rating'] is None or f['overall_rating'] < minStars: return False
        if excludeFlags and (f['special_focus_status'] is not None or f['abuse_icon'] == 'Y'): return False
        if snfOnly and f['provider_type'] == 'Medicaid': return False
        for u in units:
            if not ((f[unitcol[u]] or 0) > 0): return False
        if minOverlap is not None:
            o = overlap(f['ccn'])
            if o is None or o < minOverlap: return False
        return True
    V = [f for f in F.values() if viable(f)]
    Vset = {f['ccn'] for f in V}
    # moves (largest sources first), with capacity
    after = dict(base); moves = []; unplaced = 0.0; full = 0.0
    cap = {}
    OBJ = {'readmit': (lambda f: f['qrp_004_ppr_pd_rsrr'], True), 'rehosp': (lambda f: f['qm_521_adj'], True), 'community': (lambda f: f['qrp_005_dtc_rs_rate'], False), 'cost': (lambda f: pay_of(f['ccn']), True), 'stars': (lambda f: f['overall_rating'], False)}
    ofn, lower = OBJ[objective]
    for ccn, w in sorted(base.items(), key=lambda x: -x[1]):
        if ccn in Vset: continue
        f = F[ccn]
        if f['latitude'] is None: unplaced += w * shift; continue
        cands = []
        for v in V:
            if v['latitude'] is None or v['ccn'] == ccn: continue
            d = hav((f['latitude'], f['longitude']), (v['latitude'], v['longitude']))
            if d <= maxMiles: cands.append((d, v['ccn']))
        if not cands: unplaced += w * shift; continue
        if optimal:
            def key(c):
                v = F[c[1]]; o = ofn(v)
                return (o is None, (o if lower else -o) if o is not None else 0, -(v['overall_rating'] or 0), v['qrp_004_ppr_pd_rsrr'] is None, v['qrp_004_ppr_pd_rsrr'] or 0, c[0])
            cands.sort(key=key)
        else:
            cands.sort()
        left = w * shift
        def give(c, amt):
            nonlocal left
            to = c[1]
            if to not in cap: cap[to] = (capacity_stays(to) / n) if n else float('inf')
            x = min(amt, cap[to])
            if x <= 0: return
            cap[to] -= x; left -= x; moves.append((ccn, to, c[0], x)); after[ccn] -= x; after[to] = after.get(to, 0) + x
        if not optimal:
            first = cands[:k]; each = left / len(first)
            for c in first: give(c, each)
        for c in cands:
            if left <= 1e-12: break
            give(c, left)
        if left > 1e-12: full += left
    after = {c: w for c, w in after.items() if w > 1e-12}
    def metrics(vol):
        def wavg(key):
            num = sum(w * key(F[c]) for c, w in vol.items() if key(F[c]) is not None)
            den = sum(w for c, w in vol.items() if key(F[c]) is not None)
            return (num / den if den else None, den / sum(vol.values()) if vol else None)
        pay = {}
        for c in vol:
            p, s = U.get(c, (None, None))
            pay[c] = (p / s) if (s and s > 0 and p is not None) else None
        pnum = sum(w * pay[c] for c, w in vol.items() if pay[c] is not None); pden = sum(w for c, w in vol.items() if pay[c] is not None)
        total = sum(vol.values())
        return dict(total=total, n=len(vol), r004=wavg(lambda f: f['qrp_004_ppr_pd_rsrr']), r521=wavg(lambda f: f['qm_521_adj']), r005=wavg(lambda f: f['qrp_005_dtc_rs_rate']), stars=wavg(lambda f: f['overall_rating']),
                    low=sum(w for c, w in vol.items() if F[c]['overall_rating'] is not None and F[c]['overall_rating'] <= 2) / total if total else None,
                    pay=(pnum / pden if pden else None, pden / total if total else None))
    b, a = metrics(base), metrics(after)
    moved = sum(m[3] for m in moves); miles = sum(m[2] * m[3] for m in moves) / moved if moved else None
    out = dict(before=b, after=a, moved=moved, unplaced=unplaced, full=full, n=n, miles=miles, nViable=len(V), nBaseline=len(base), nReceiving=len({m[1] for m in moves}), nLosing=len({m[0] for m in moves}), nonviable_share=sum(w for c, w in base.items() if c not in Vset))
    if verbose:
        for k_, v in out.items(): print(k_, v)
    return out, moves, base, after, F

if __name__ == '__main__':
    h = sys.argv[1] if len(sys.argv) > 1 else '210009'
    print('== nearest'); run(h)
    print('== optimal (readmit)'); run(h, optimal=True)
    print('== optimal (cost)'); run(h, optimal=True, objective='cost')
