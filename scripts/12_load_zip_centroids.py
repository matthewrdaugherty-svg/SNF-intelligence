"""ZIP (ZCTA) centroids from the U.S. Census Bureau 2024 Gazetteer file (www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip).
ZCTAs are the Census approximation of USPS ZIP codes; a few ZIPs (PO-box-only, new ZIPs) have no ZCTA. Lossless load; used for distance from a
hospital's patient ZIPs to each SNF (service-area model v2) and for drawing service areas on the map.
Usage: python3 scripts/12_load_zip_centroids.py
"""
import duckdb, json
ROOT="/home/claude/snf-intel"; RAW=f"{ROOT}/raw/census/2024_Gaz_zcta_national.txt"; DB=f"{ROOT}/db/snf.duckdb"
con=duckdb.connect(DB)
con.execute("DROP TABLE IF EXISTS zip_centroids")
con.execute(f"""CREATE TABLE zip_centroids AS SELECT trim(GEOID) AS zip, CAST(INTPTLAT AS DOUBLE) AS lat, CAST(trim(INTPTLONG) AS DOUBLE) AS lng, CAST(ALAND_SQMI AS DOUBLE) AS land_sqmi
  FROM read_csv('{RAW}', delim='\\t', header=true, all_varchar=true)""")
n=con.execute("SELECT count(*), count(DISTINCT zip), count(lat), min(lat), max(lat), min(lng), max(lng) FROM zip_centroids").fetchone()
assert n[0]==33791 and n[0]==n[1]==n[2], n   # file line count minus header; every row has coordinates
print(f"== Census 2024 ZCTA Gazetteer: {n[0]:,} ZCTAs with centroids (lat {n[3]:.2f}..{n[4]:.2f}, lng {n[5]:.2f}..{n[6]:.2f})")
rec={}
rec["hospital_service_area_zips_with_centroid"]=con.execute("SELECT count(DISTINCT zip) FILTER (WHERE zip IN (SELECT zip FROM zip_centroids)), count(DISTINCT zip) FROM hospital_service_area").fetchone()
rec["hospital_service_area_cases_with_centroid"]=con.execute("SELECT sum(cases) FILTER (WHERE zip IN (SELECT zip FROM zip_centroids)), sum(cases) FROM hospital_service_area").fetchone()
rec["facility_zips_with_centroid"]=con.execute("SELECT count(*) FILTER (WHERE zip_code IN (SELECT zip FROM zip_centroids)), count(*) FROM facility_master").fetchone()
for k,v in rec.items(): print(f"  {k}: {v[0]:,} of {v[1]:,}")
json.dump({k:[float(x) for x in v] for k,v in rec.items()}, open(f"{ROOT}/db/reconciliation_zip.json","w"), indent=1)
con.close(); print("done")
