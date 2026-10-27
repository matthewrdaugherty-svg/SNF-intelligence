"""Independent check: every value the Facility page rendered (out/facility_<ccn>.json) vs db/snf.duckdb.
Formatting is re-implemented here from the spec (en-US, half-up on the exact double), not imported from the app."""
import duckdb, json, re, sys
from decimal import Decimal, ROUND_HALF_UP
DB = '/home/claude/snf-intel/db/snf.duckdb'
SRC = '/home/claude/snf-intel/app/src/lib/measures.ts'
OUT = '/home/claude/snf-intel/app/tests/redteam/out'
c = duckdb.connect(DB, read_only=True)
picked = json.load(open(f'{OUT}/picked.json'))
src = open(SRC).read().split('export const ALL_MEASURES')[0]
M = []
for line in src.splitlines():
    m = re.search(r"\{ key: '([^']+)'", line)
    if not m: continue
    d = {'key': m.group(1)}
    for f in ['label', 'unit', 'direction', 'fn', 'state', 'national', 'compPerf', 'volume']:
        mm = re.search(rf"\b{f}: '([^']*)'", line); d[f] = mm.group(1) if mm else None
    mm = re.search(r"decimals: (\d+)", line); d['decimals'] = int(mm.group(1)) if mm else None
    M.append(d)
DEF = {'fraction_pct': 1, 'pct': 1, 'per1000': 2, 'hours': 2, 'count': 0, 'ratio': 2, 'fraction': 4, 'stars': 0, 'rank': 0, 'score': 1, 'usd': 0}
def num(v, d):
    q = Decimal(repr(float(v))).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    s = f"{abs(q):,.{d}f}"; return ('-' if q < 0 else '') + s
def AVG(v, m):
    return f'{v:.1f}' if m['unit'] in ('stars', 'count') else fmt(v, m['unit'], m['decimals'])
def fmt(v, unit, d=None):
    if v is None: return ''
    d = DEF.get(unit, 0) if d is None else d
    if unit == 'pct': return num(v, d) + '%'
    if unit == 'fraction_pct': return num(float(v) * 100, d) + '%'
    if unit == 'usd': return '$' + num(v, 0) if v >= 0 else '-$' + num(-v, 0)
    if unit == 'stars': return num(v, 0) + '★'
    if unit == 'rank': return '#' + num(v, 0)
    if unit == 'count': return num(v, 0)
    return num(v, d)
state_avg = {r[0]: dict(zip([x[0] for x in c.sql('describe state_averages').fetchall()], r)) for r in c.sql('select * from state_averages').fetchall()}
nat = {r[0]: float(r[1]) for r in c.sql("select measure_code, score from qrp_national").fetchall() if re.match(r'^-?[\d.]+$', r[1] or '')}
vbpcols = [x[0] for x in c.sql('describe vbp_aggregate').fetchall()]
for k, v in zip(vbpcols, c.sql('select * from vbp_aggregate').fetchall()[0]):
    try: nat[k] = float(v)
    except: pass
fnmap = json.load(open('/home/claude/snf-intel/app/public/data/footnotes.json'))
def f2(x):
    try: return None if x in (None, '') else float(x)
    except: return None
issues, checked = [], 0
def bad(ccn, what, exp, act, sev='MISMATCH'): issues.append((sev, ccn, what, exp, act))
for ccn, label in picked.items():
    page = json.load(open(f'{OUT}/facility_{ccn}.json'))
    cols = [x[0] for x in c.sql('describe facility_master').fetchall()]
    row = dict(zip(cols, c.sql(f"select * from facility_master where ccn='{ccn}'").fetchall()[0]))
    st = row['state']
    if page['errors']: bad(ccn, 'page errors', '[]', page['errors'])
    # header
    checked += 1
    if str(row['zip_code']) not in page['subs'][0]: bad(ccn, 'ZIP in header', row['zip_code'], page['subs'][0])
    beds = row['number_of_certified_beds']
    exp_beds = f"{int(beds)} certified beds" if beds is not None else 'beds not reported'
    checked += 1
    if exp_beds not in page['subs'][1]: bad(ccn, 'beds', exp_beds, page['subs'][1])
    if row['average_number_of_residents_per_day'] is not None:
        checked += 1; e = num(row['average_number_of_residents_per_day'], 1) + ' residents per day'
        if e not in page['subs'][1]: bad(ccn, 'residents/day', e, page['subs'][1])
    if row['chain_name']:
        checked += 1; e = f"({int(row['number_of_facilities_in_chain'])} facilities)"
        if e not in page['subs'][1]: bad(ccn, 'chain size', e, page['subs'][1])
    checked += 1
    cl = row['county_parish']; exp_cl = (cl.title() + ' Parish') if st == 'LA' else cl.title() if cl.lower().endswith(' city') else cl.title() + ' County'
    if exp_cl.lower() not in page['subs'][0].lower(): bad(ccn, 'county label', exp_cl, page['subs'][0])
    # flags
    exp_flags = ([row['special_focus_status']] if row['special_focus_status'] else []) + (['Abuse icon'] if row['abuse_icon'] == 'Y' else [])
    checked += 1
    for fl in exp_flags:
        if fl not in page['flags']: bad(ccn, 'flag', fl, page['flags'])
    # top cards
    for card, key in zip(page['cards'], ['overall_rating', 'health_inspection_rating', 'qm_rating', 'staffing_rating']):
        checked += 1
        v = row[key]; body = card['body']
        first = body.split('\n')[0].strip()
        exp = str(int(v)) if v is not None else '–'
        if not first.startswith(exp): bad(ccn, f'card {key}', exp, body)
        fnv = row.get(key + '_footnote')
        if fnv and f'fn {fnv}' not in body: bad(ccn, f'card {key} footnote', f'fn {fnv}', body)
        sa = f2(state_avg[st].get(key))
        if sa is not None and f"state avg {num(sa,1)}" not in body: bad(ccn, f'card {key} state avg', num(sa, 1), body)
    # measures
    for m in M:
        k = m['key']
        if k in ('overall_rating', 'health_inspection_rating', 'qm_rating'): continue
        if k not in page['measures']:
            if k.startswith(('vbp_', 'x_vbp')) and row['vbp_in_program'] != 'Y':
                checked += 1
                if 'Not in the SNF Value-Based Purchasing program' not in (page.get('vbpText') or ''): bad(ccn, 'VBP not-in-program note', 'present', page.get('vbpText'))
                continue
            bad(ccn, f'measure row missing {k}', 'present', 'absent'); continue
        cells = page['measures'][k]['cells']; valcell = cells[1]; cmpcell = cells[-1] if len(cells) >= 4 else ''
        v = row.get(k); v = None if v is None else float(v)
        fnv = row.get(m['fn']) if m['fn'] else None
        checked += 1
        if m['unit'] == 'stars':
            exp = str(int(v)) if v is not None else '–'
            if not valcell.startswith(exp): bad(ccn, k, exp, valcell)
        elif v is not None:
            exp = fmt(v, m['unit'], m['decimals'])
            if not valcell.startswith(exp): bad(ccn, k, exp, valcell)
        else:
            if re.search(r'\d', valcell.replace(f'fn {fnv}', '') if fnv else valcell) and not (fnv and not re.match(r'^\d', str(fnv))):
                bad(ccn, f'{k} blank shows a number', '(blank + footnote)', valcell)
            if fnv:
                expfn = f'fn {fnv}' if re.match(r'^\d', str(fnv)) else str(fnv)
                if expfn not in valcell: bad(ccn, f'{k} footnote', expfn, valcell)
            else:
                bad(ccn, f'{k} blank with NO footnote/explanation', 'a reason for the blank', repr(valcell), 'UX')
        if v is not None and fnv and f'fn {fnv}' not in valcell and str(fnv) not in valcell:
            bad(ccn, f'{k} footnote on a present value not shown', fnv, valcell)
        # state / nation
        sa = f2(state_avg[st].get(m['state'])) if m['state'] else None
        na = nat.get(m['national']) if m['national'] else (f2(state_avg['NATION'].get(m['state'])) if m['state'] else None)
        if m['unit'] == 'stars':
            if sa is not None:
                checked += 1
                if f'State avg {sa:.1f}' not in cmpcell: bad(ccn, f'{k} state avg (stars)', f'State avg {sa:.1f}', cmpcell, 'CONSISTENCY')
            continue
        if sa is not None:
            checked += 1; e = f"State avg {AVG(sa, m)}"
            if e not in cmpcell: bad(ccn, f'{k} state', e, cmpcell)
        if na is not None:
            checked += 1; e = f"Nation {AVG(na, m)}"
            if e not in cmpcell: bad(ccn, f'{k} nation', e, cmpcell)
        # delta
        if sa is not None and v is not None and m['direction'] != 'none':
            checked += 1
            d = v - sa
            better = d < 0 if m['direction'] == 'lower' else d > 0
            dec = 1 if m['unit'] == 'count' else 0 if m['unit'] == 'usd' else (m['decimals'] if m['decimals'] is not None else (1 if m['unit'] in ('pct', 'fraction_pct') else 2))
            shown = float(f"{abs(d) * (100 if m['unit'] == 'fraction_pct' else 1):.{dec}f}")
            if shown == 0: exp = 'about the same as state'
            else:
                ab = f"{shown:.{dec}f} pts" if m['unit'] in ('pct', 'fraction_pct') else fmt(shown, 'usd') if m['unit'] == 'usd' else f"{shown:.1f}" if m['unit'] == 'count' else fmt(shown, m['unit'], dec)
                exp = f"{ab} {'better' if better else 'worse'} than state"
            if exp not in cmpcell: bad(ccn, f'{k} delta', exp, cmpcell)
            shown = re.search(r'([\d.,$%]+)( pts)? (better|worse) than state', cmpcell)
            if shown and re.fullmatch(r'[$]?0(\.0+)?%?', shown.group(1)):
                bad(ccn, f'{k} delta rounds to zero but says {shown.group(2)}', f'diff {d:+.4f} → should read "about the same"', shown.group(0), 'DISPLAY')
            if m['unit'] == 'pct' and shown: pass
        if m['compPerf'] and row.get(m['compPerf']):
            checked += 1
            if str(row[m['compPerf']]) not in cmpcell: bad(ccn, f'{k} comp perf', row[m['compPerf']], cmpcell)
        if m['volume'] and row.get(m['volume']) is not None:
            checked += 1; e = f"{int(row[m['volume']]):,} eligible stays"
            if e not in cmpcell: bad(ccn, f'{k} volume', e, cmpcell)
    # penalties
    pens = c.sql(f"select penalty_date, penalty_type, fine_amount, payment_denial_start_date, payment_denial_length_in_days from penalties where ccn='{ccn}' order by penalty_date desc").fetchall()
    checked += 1
    if page['penHeader'] != f"Penalties · {len(pens)}": bad(ccn, 'penalty count', len(pens), page['penHeader'])
    if len(pens) != row['pen_n_fines'] + row['pen_n_payment_denials']: bad(ccn, 'penalties list vs pen_n_* aggregate', row['pen_n_fines'] + row['pen_n_payment_denials'], len(pens), 'CROSSCHECK')
    exp_rows = sorted([[str(p[0]), p[1], fmt(p[2], 'usd') if p[1] == 'Fine' else f"{int(p[4])} days from {p[3]}"] for p in pens])
    checked += len(pens)
    if sorted(page['penRows']) != exp_rows: bad(ccn, 'penalty rows', exp_rows, page['penRows'])
    tot = sum(p[2] or 0 for p in pens if p[1] == 'Fine')
    if abs(tot - (row['pen_total_fines_usd'] or 0)) > 0.5: bad(ccn, 'sum(penalties.fine_amount) vs pen_total_fines_usd', tot, row['pen_total_fines_usd'], 'CROSSCHECK')
    # citations G-L
    cits = c.sql(f"select survey_date, scope_severity_code, deficiency_tag_number, complaint_deficiency, deficiency_description from health_citations where ccn='{ccn}' and scope_severity_code in ('G','H','I','J','K','L')").fetchall()
    checked += 1
    if page['citHeader'] != f"Deficiencies at severity G or worse · {len(cits)}": bad(ccn, 'G-L citation count', len(cits), page['citHeader'])
    if len(cits) != row['hc_n_severity_G_or_worse']: bad(ccn, 'G-L list vs hc_n_severity_G_or_worse', row['hc_n_severity_G_or_worse'], len(cits), 'CROSSCHECK')
    exp_c = sorted([(str(x[0]), f'Severity {x[1]}', f'Tag {x[2]}', x[4]) for x in cits])
    act_c = sorted([(r['meta'][0], r['meta'][1], r['meta'][2], r['desc']) for r in page['citRows']])
    checked += len(cits)
    if [(a,b,c_,' '.join(d_.split())) for a,b,c_,d_ in exp_c] != act_c: bad(ccn, 'G-L citation rows', exp_c[:3], act_c[:3])
    if len(cits) != (row['hc_n_actual_harm_GHI'] or 0) + (row['hc_n_immediate_jeopardy_JKL'] or 0): bad(ccn, 'G-L list vs GHI+JKL counts', (row['hc_n_actual_harm_GHI'], row['hc_n_immediate_jeopardy_JKL']), len(cits), 'CROSSCHECK')
    # ownership (app shows only ownership-interest / operational-control / partnership roles)
    own = c.sql(f"""select role_played_by_owner_or_manager_in_facility, owner_name, ownership_percentage_raw, association_date from ownership where ccn='{ccn}'
        and (role_played_by_owner_or_manager_in_facility like '%OWNERSHIP INTEREST%' or role_played_by_owner_or_manager_in_facility like '%OPERATIONAL/MANAGERIAL CONTROL%' or role_played_by_owner_or_manager_in_facility like '%PARTNERSHIP%')""").fetchall()
    allown = c.sql(f"select role_played_by_owner_or_manager_in_facility, count(*) from ownership where ccn='{ccn}' group by 1").fetchall()
    shown_people = sum(len(g['people']) for g in page['ownGroups'])
    checked += 1
    if shown_people != len(own): bad(ccn, 'ownership people shown', len(own), shown_people)
    for o in own:
        checked += 1
        pct = o[2] if o[2] and not re.search('NOT APPLICABLE|NO PERCENTAGE', o[2]) else None
        hit = [p for g in page['ownGroups'] for p in g['people'] if (pct is None or pct in p) and (o[3] is None or str(o[3]) in p)]
        if not hit: bad(ccn, 'ownership entry', o, '(not found)')
    hidden = [(r, n) for r, n in allown if not re.search('OWNERSHIP INTEREST|OPERATIONAL/MANAGERIAL CONTROL|PARTNERSHIP', r)]
    if hidden and 'officers, directors, managing employees and lenders' not in page['ownIntro']: bad(ccn, 'ownership roles omitted without saying so', hidden, page['ownIntro'], 'SCOPE')
print(f'checked {checked} values across {len(picked)} facilities; {len(issues)} findings')
from collections import Counter
print(Counter(i[0] for i in issues))
for i in issues: print(' | '.join(map(str, i)))
