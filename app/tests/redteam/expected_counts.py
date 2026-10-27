"""Independent expected counts for scenarios.json (hand-written SQL per scenario, not the app's whereClause)."""
import duckdb, json, math
c = duckdb.connect('/home/claude/snf-intel/db/snf.duckdb', read_only=True)
def hav(lat, lng):
    return f"2*3958.8*asin(sqrt(pow(sin(radians(latitude-{lat})/2),2)+cos(radians({lat}))*cos(radians(latitude))*pow(sin(radians(longitude-({lng}))/2),2)))"
def like(s): return f"(upper(provider_name) like '%{s}%' or upper(city_town) like '%{s}%' or upper(coalesce(chain_name,'')) like '%{s}%' or ccn like '{s}%')"
W = {
 'none': 'true', 'state_MD': "state='MD'", 'states_MD_VA': "state in ('MD','VA')", 'stars_1_2': 'overall_rating in (1,2)',
 'own_nonprofit': "ownership_type like 'Non profit%'", 'own_fp_gov': "(ownership_type like 'For profit%' or ownership_type like 'Government%')",
 'sff': "special_focus_status in ('SFF','SFF Candidate')", 'abuse': "abuse_icon='Y'", 'hospital': "provider_resides_in_hospital='Y'", 'vbp': "vbp_in_program='Y'",
 'beds_100_150': 'number_of_certified_beds between 100 and 150', 'beds_min_200': 'number_of_certified_beds>=200', 'beds_max_0': 'number_of_certified_beds<=0',
 'q_genesis': like('GENESIS'), 'q_baltimore': like('BALTIMORE'), 'q_ccn_prefix_21': like('21'),
 'q_apostrophe': like("ST. ELIZABETH''S"), 'q_injection': like("X''; DROP TABLE FACILITY_MASTER; --"),
 'q_percent_wildcard': "(position('%' in provider_name)>0 or position('%' in city_town)>0 or position('%' in coalesce(chain_name,''))>0)",
 'q_underscore_wildcard': "(position('_' in provider_name)>0 or position('_' in city_town)>0 or position('_' in coalesce(chain_name,''))>0)",
 'county_baltimore': "upper(county_parish) like '%BALTIMORE%'",
 'radius_baltimore_15': f"{hav(39.2904,-76.6122)}<=15", 'radius_la_10': f"{hav(34.0522,-118.2437)}<=10", 'radius_rural_sd_40': f"{hav(44.5219,-99.4389)}<=40",
 'combo_ca': "state='CA' and overall_rating in (4,5) and ownership_type like 'Non profit%' and number_of_certified_beds between 50 and 120",
 'combo_tx_flags': "state='TX' and special_focus_status is not null and abuse_icon='Y'",
 'combo_radius': f"{hav(39.2904,-76.6122)}<=25 and overall_rating=5 and ownership_type like 'For profit%' and {like('HEALTH')}",
 'combo_all_flags_vbp_hosp': "provider_resides_in_hospital='Y' and vbp_in_program='Y' and overall_rating in (4,5)",
 'combo_county_state': "state='MD' and upper(county_parish) like '%PRINCE%'",
 'stars_out_of_range': 'true',
}
got = json.load(open('/home/claude/snf-intel/app/tests/redteam/out/explore_counts.json'))
rows = []
for k, w in W.items():
    e = c.sql(f'select count(*) from facility_master where {w}').fetchall()[0][0]
    a = got[k]['count']; a = int(a.replace(',', '')) if a else None
    rows.append((k, e, a, 'OK' if e == a else 'DIFF'))
for k in got:
    if k not in W: rows.append((k, 'error expected?', got[k]['error'][:90] if got[k]['error'] else got[k]['count'], 'NOTE'))
for r in rows: print(*r, sep=' | ')
# Python haversine vs DuckDB/app distance for 3 facilities
def ph(lat1, lon1, lat2, lon2):
    R = 3958.8; p1, p2 = math.radians(lat1), math.radians(lat2); dp = p2 - p1; dl = math.radians(lon2 - lon1)
    return 2 * R * math.asin(math.sqrt(math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))
print('\nhaversine (center Baltimore 39.2904,-76.6122):')
for ccn, lat, lng, d in c.sql(f"select ccn, latitude, longitude, {hav(39.2904,-76.6122)} d from facility_master where ccn in ('215085','215353','215340')").fetchall():
    print(ccn, round(ph(39.2904, -76.6122, lat, lng), 4), round(d, 4))
