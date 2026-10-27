"""Independent (pure-Python) recomputation of a placement scenario from the replica tables. No SQL beyond pulling raw rows."""
import math, sys
from collections import defaultdict
from scenario_replica import con   # same Arrow files the app loads

def hav(a, b):
    la1, lo1 = map(math.radians, a); la2, lo2 = map(math.radians, b)
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))

def run(h, minStars=4, excludeFlags=True, snfOnly=True, units=(), minOverlap=None, maxMiles=10, k=3, shift=1.0, verbose=True, optimal=False):
    """optimal=True: shift=1, k=1, candidates ranked by best fit (rating desc, QRP 004 asc nulls last, overlap desc nulls last, miles asc) — the app's BEST_FIT_ORDER."""
    if optimal: shift, k = 1.0, 1
    cols = ['ccn', 'overall_rating', 'special_focus_status', 'abuse_icon', 'provider_type', 'beds_ventilator', 'beds_dialysis', 'beds_alzheimers', 'beds_hospice', 'beds_head_trauma', 'beds_rehab', 'latitude', 'longitude', 'qm_521_adj', 'qrp_004_ppr_pd_rsrr', 'qrp_005_dtc_rs_rate', 'provider_name']
    F = {r[0]: dict(zip(cols, r)) for r in con.execute(f"select {','.join(cols)} from facility_master").fetchall()}
    U = {r[0]: (r[1], r[2]) for r in con.execute("select ccn, medicare_payment_2024, medicare_stays_2024 from snf_utilization").fetchall()}
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
    # moves
    after = dict(base); moves = []; unplaced = 0.0
    for ccn, w in base.items():
        if ccn in Vset: continue
        f = F[ccn]
        if f['latitude'] is None: unplaced += w * shift; continue
        cands = []
        for v in V:
            if v['latitude'] is None: continue
            d = hav((f['latitude'], f['longitude']), (v['latitude'], v['longitude']))
            if d <= maxMiles: cands.append((d, v['ccn']))
        if optimal:
            def key(c):
                v = F[c[1]]; o = overlap(c[1])
                return (-(v['overall_rating'] or 0), v['qrp_004_ppr_pd_rsrr'] is None, v['qrp_004_ppr_pd_rsrr'] or 0, o is None, -(o or 0), c[0])
            cands.sort(key=key)
        else:
            cands.sort()
        cands = cands[:k]
        if not cands: unplaced += w * shift; continue
        per = w * shift / len(cands)
        for d, to in cands:
            moves.append((ccn, to, d, per)); after[ccn] -= per; after[to] = after.get(to, 0) + per
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
    out = dict(before=b, after=a, moved=moved, unplaced=unplaced, miles=miles, nViable=len(V), nBaseline=len(base), nReceiving=len({m[1] for m in moves}), nLosing=len({m[0] for m in moves}), nonviable_share=sum(w for c, w in base.items() if c not in Vset))
    if verbose:
        for k_, v in out.items(): print(k_, v)
    return out, moves, base, after, F

if __name__ == '__main__':
    print('== optimal'); run('210009', optimal=True)
    run(sys.argv[1] if len(sys.argv) > 1 else '210009')
