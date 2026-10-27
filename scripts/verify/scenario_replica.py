"""Independent replica of the app's in-browser database, built from the same Arrow files app/src/lib/db.ts loads.
Usage: from replica import con  (an in-memory DuckDB with facility_master, snf_hospital_area, user_flows, ...)"""
import duckdb, pyarrow as pa, pyarrow.ipc as ipc, os
import pathlib
D = str(pathlib.Path(__file__).resolve().parents[2] / 'app' / 'public' / 'data')
FILES = ['facility_master', 'penalties', 'citations_gl', 'state_averages', 'inspection_cutpoints', 'ownership', 'hospital_master', 'hospital_service_area', 'snf_utilization', 'hospital_system', 'hospital_owner_org', 'hospital_family', 'hospital_family_member', 'snf_pecos', 'snf_services', 'hospital_drg_mix', 'hospital_chapter_mix', 'snf_chapter_mix', 'snf_patient_mix', 'zip_centroids']
con = duckdb.connect()
for f in FILES:
    # try file format then stream format
    try:
        with pa.memory_map(os.path.join(D, f + '.arrow')) as src:
            t = ipc.open_file(src).read_all()
    except Exception:
        with pa.memory_map(os.path.join(D, f + '.arrow')) as src:
            t = ipc.open_stream(src).read_all()
    con.register(f + '_arrow', t)
    con.execute(f'CREATE TABLE {f} AS SELECT * FROM {f}_arrow')
con.execute('ALTER TABLE facility_master RENAME TO facility_master_base')
con.execute("""CREATE TABLE facility_master AS SELECT b.*, s.certification_detail, CASE WHEN s.hospital_based THEN 'Y' WHEN s.hospital_based IS NULL THEN NULL ELSE 'N' END AS ltc_hospital_based,
    s.beds_ventilator, s.beds_dialysis, s.beds_alzheimers, s.beds_hospice, s.beds_head_trauma, s.beds_rehab, s.beds_aids, s.beds_huntingtons, s.beds_pediatric,
    s.census_total, s.census_medicare, s.census_medicaid, s.census_other, s.census_unreliable, s.census_medicare_share, s.census_medicaid_share, s.ccrc, s.multi_facility, s.ltc671_certification_date
    FROM facility_master_base b LEFT JOIN snf_services s USING (ccn)""")
con.execute('CREATE TABLE user_flows (hospital_ccn VARCHAR, hospital_name VARCHAR, snf_ccn VARCHAR, period_start DATE, period_end DATE, n_discharges INTEGER, source VARCHAR, method VARCHAR, loaded_at DATE)')
con.execute("""CREATE TABLE snf_hospital_area AS
    WITH s AS (SELECT f.ccn, f.zip_code AS zip, coalesce(u.medicare_stays_2024, 0) AS stays FROM facility_master f LEFT JOIN snf_utilization u USING (ccn)),
    z AS (SELECT zip, sum(stays) AS zip_stays, count(*) AS zip_snfs FROM s GROUP BY zip)
    SELECT a.hospital_ccn, s.ccn, a.zip, a.cases AS hospital_cases_from_zip, a.share_of_visible_cases AS zip_share, a.zip_rank, a.cumulative_share, s.stays AS snf_medicare_stays_2024, z.zip_snfs,
           a.share_of_visible_cases * (CASE WHEN z.zip_stays > 0 THEN s.stays / z.zip_stays ELSE 1.0 / z.zip_snfs END) AS modeled_weight
    FROM hospital_service_area a JOIN s ON s.zip = a.zip JOIN z ON z.zip = a.zip""")
