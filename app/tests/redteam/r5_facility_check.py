import duckdb, json, sys
from decimal import Decimal, ROUND_HALF_UP
c=duckdb.connect('/home/claude/snf-intel/db/snf.duckdb',read_only=True)
d=json.load(open(sys.argv[1]))
def r(x,dp): return format(Decimal(x).quantize(Decimal(1).scaleb(-dp),rounding=ROUND_HALF_UP),f',.{dp}f')
def tc(s): # app titleCase is checked by eye; compare case-insensitively
    return s
cols=[x[0] for x in c.execute("describe state_averages").fetchall()]
def fl(x):
    try: return float(x)
    except: return x
SA={x[0]:{k:fl(v) for k,v in zip(cols,x)} for x in c.execute("select * from state_averages").fetchall()}
checks=0; bad=[]
def eq(ccn,what,exp,got,ci=False):
    global checks; checks+=1
    if (str(exp).lower()!=str(got).lower()) if ci else (str(exp)!=str(got)): bad.append((ccn,what,exp,got))
for ccn,v in d.items():
    f=dict(zip([x[0] for x in c.execute("describe facility_master").fetchall()], c.execute("select * from facility_master where ccn=?",[ccn]).fetchone()))
    st=f['state']; s=SA[st]
    snap=v['snapshot']
    stars=f['overall_rating']; tier=lambda n: 'poor' if n<=2 else 'average' if n==3 else 'good'
    own=f['ownership_type'].split(' - ')[0].lower()
    lead=(f"is a {int(stars)}-star ({tier(stars)})" if stars is not None else "is an unrated")+f", {int(f['number_of_certified_beds']):,}-bed {own} nursing home in "
    eq(ccn,'snap lead',True,lead.lower() in snap.lower())
    v521,s521=f['qm_521_adj'],s['percentage_of_short_stay_residents_who_were_rehospitalized_after_a_nursing_home_admission']
    if v521 is not None:
        dd=Decimal(v521-s521).quantize(Decimal('0.1'),rounding=ROUND_HALF_UP); w='the same as' if dd==0 else 'better than' if dd<0 else 'worse than'
        eq(ccn,'snap 521',f"{r(v521,1)}% of its short-stay residents were rehospitalized, {w} the {st} average of {r(s521,1)}%.", f"{r(v521,1)}% of its short-stay residents were rehospitalized, {w} the {st} average of {r(s521,1)}%." if f"{r(v521,1)}% of its short-stay residents were rehospitalized, {w} the {st} average of {r(s521,1)}%." in snap else snap)
    v004=f['qrp_004_ppr_pd_rsrr']
    if v004 is not None: eq(ccn,'snap 004',True,f"{r(v004,1)}% of Medicare stays had a potentially preventable readmission within 30 days (nation 10.7%)" in snap)
    harm,fines=f['hc_n_severity_G_or_worse'],f['pen_total_fines_usd']
    eq(ccn,'snap harm',True,f"recorded {int(harm)} harm-or-jeopardy deficienc{'y' if harm==1 else 'ies'} and ${r(fines,0)} in fines." in snap)
    stf,sst=f['reported_total_nurse_staffing_hours_per_resident_per_day'],s['reported_total_nurse_staffing_hours_per_resident_per_day']
    if stf is not None:
        dd=Decimal(stf-sst).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP); w='the same as' if dd==0 else 'better than' if dd>0 else 'worse than'
        eq(ccn,'snap staff',True,f"Nurses provide {r(stf,2)} hours per resident-day, {w} the state average of {r(sst,2)}." in snap)
    # star cards
    for card,(k,sk) in zip(v['starCards'],[('overall_rating','overall_rating'),('health_inspection_rating','health_inspection_rating'),('qm_rating','qm_rating'),('staffing_rating','staffing_rating')]):
        val=f[k]; eq(ccn,f'star {k}',(f"{int(val)}\n{tier(val)}" if val is not None else "–\nnot rated"+(f"\nfn {f[k+'_footnote']}" if f.get(k+'_footnote') else '')),card['body'])
        eq(ccn,f'star avg {k}',f"state average {r(s[sk],1)}",card['avg'])
    # stat cards
    cards=v['statCards']
    eq(ccn,'card 521 value',f"{r(v521,1)}%" if v521 is not None else '–',cards[0]['value'])
    if v521 is not None:
        d1=Decimal(abs(v521-s521)).quantize(Decimal('0.1'),rounding=ROUND_HALF_UP); w='about the same as state' if d1==0 else f"{d1} pts {'better' if v521<s521 else 'worse'} than state"
        eq(ccn,'card 521 note',f"{st} average {r(s521,1)}% · nation {r(SA['NATION']['percentage_of_short_stay_residents_who_were_rehospitalized_after_a_nursing_home_admission'],1)}% · {w}",cards[0]['note'])
        rel=abs(s521-v521)/abs(s521); tone='mid' if rel<0.05 else 'good' if v521<s521 else 'bad'
        eq(ccn,'card 521 tone',{'mid':'rgb(220, 104, 3)','good':'var(--color-q5)','bad':'var(--color-q2)'}[tone],cards[0]['tone'])
    eq(ccn,'card 004 value',f"{r(v004,1)}%",cards[1]['value'])
    rel=abs(10.72-v004)/10.72; tone='mid' if rel<0.05 else 'good' if v004<10.72 else 'bad'
    eq(ccn,'card 004 tone',{'mid':'rgb(220, 104, 3)','good':'var(--color-q5)','bad':'var(--color-q2)'}[tone],cards[1]['tone'])
    eq(ccn,'card harm',str(int(harm)),cards[2]['value'])
    eq(ccn,'card fines',f"${r(fines,0)}",cards[3]['value'])
    sf=s['fine_amount_in_dollars']; nf=SA['NATION']['fine_amount_in_dollars']; dfn=Decimal(abs(fines-sf)).quantize(Decimal(1),rounding=ROUND_HALF_UP)
    eq(ccn,'card fines note',f"{st} average ${r(sf,0)} · nation ${r(nf,0)} · "+(f"about the same as state" if dfn==0 else f"${dfn:,} {'better' if fines<sf else 'worse'} than state"),cards[3]['note'])
    # PECOS
    p=c.execute("select * from snf_pecos where ccn=?",[ccn]).fetchone()
    if p is None: eq(ccn,'pecos absent',None,v['pecos'])
    else:
        P=dict(zip([x[0] for x in c.execute("describe snf_pecos").fetchall()],p))
        exp=f"Medicare enrollment (PECOS, 2026-09-29): enrolled as {P['legal_entity']}"+(f" doing business as {P['dba']}" if P['dba'] and P['dba'].upper()!=P['legal_entity'].upper() else '')+(f"; CMS affiliation entity {P['affiliation_entity_name']}" if P['affiliation_entity_name'] else '')+('; non-profit' if P['proprietary_nonprofit']=='N' else '; proprietary' if P['proprietary_nonprofit']=='P' else '')
        n=P['n_chow_since_2016']
        exp+= (f"; {n} change{'' if n==1 else 's'} of ownership since 2016, most recently {P['last_chow_date']}"+(f" (buyer {P['last_buyer']})" if P['last_buyer'] else '')) if n>0 else '; no change of ownership recorded since 2016'
        exp+= ('; an owner self-identifies as a private-equity company' if P['any_private_equity_owner'] else '')+('; an owner self-identifies as a REIT' if P['any_reit_owner'] else '')+'.'
        eq(ccn,'pecos text',exp,v['pecos'],ci=True)
print('facility checks',checks,'mismatches',len(bad))
for b in bad: print(b)
