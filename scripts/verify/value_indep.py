#!/usr/bin/env python3
"""Independent replica of the Value model (app/src/lib/value.ts), written in pandas with no SQL shared with the app.

It reads the same exported tables the browser reads (app/public/data/*.arrow), recomputes the payer, hospital and SNF
baselines and the three cases for a handful of fixed selections, and writes app/tests/value_expected.json.
The Playwright tests then assert that the page shows these numbers. If the app's SQL or arithmetic drifts, the test fails.
"""
import json, pathlib, re, sys
import numpy as np, pandas as pd, pyarrow.ipc as ipc

ROOT = pathlib.Path(__file__).resolve().parents[2]
D = ROOT / "app" / "public" / "data"
T = lambda n: ipc.open_file(D / f"{n}.arrow").read_all().to_pandas()
county, state, parents = T("uw_county"), T("uw_state"), T("ma_parent_county")
snf_geo, hosp_geo, snf_cost, hosp_cost = T("snf_geo"), T("hospital_geo"), T("snf_cost"), T("hospital_cost")
fac = T("facility_master")[["ccn", "provider_name", "chain_name", "overall_rating", "qm_521_adj", "qrp_004_ppr_pd_rsrr"]]
util = T("snf_utilization")[["ccn", "medicare_stays_2024"]]
hm = T("hospital_master")[["hospital_ccn", "hospital_name"]]

def in_geo(df, geo):
    if geo == "US": return df
    if geo.startswith("ST-"): return df[df["state"] == geo[3:]]
    return df[df["cbsa"] == geo]

def wavg(w, x):
    ok = x.notna()
    den = w[ok].sum()
    return float((w[ok] * x[ok]).sum() / den) if den else None

# ---------------------------------------------------------------- plan revenue (what CMS pays), row by row
def revenue(geo, text):
    c = in_geo(county, geo)[["fips", "ma_rate_0", "ma_rate_35", "ma_rate_5", "ma_bid_ratio"]]
    x = parents[parents["segment"] == "MA"].merge(c, on="fips")
    if text:
        pat = re.compile(".*".join(re.escape(w) for w in re.sub(r"[^a-z0-9&.,\- ]", " ", text.lower()).split()))
        x = x[x["parent_org"].str.lower().map(lambda v: bool(pat.search(v)))]
    x = x.assign(rate=np.select([x["bonus"] == 5, x["bonus"] == 3.5], [x["ma_rate_5"], x["ma_rate_35"]], default=x["ma_rate_0"]))
    x = x[x["rate"].notna()]
    if not len(x): return None
    e, E = x["enrollment"].astype(float), float(x["enrollment"].sum())
    rb, rho = x["rebate_pct"] / 100.0, x["ma_bid_ratio"]
    out = {"members": E, "bench": float((e * x["rate"]).sum() / E), "bench5": float((e * x["ma_rate_5"]).sum() / E), "share5": float(e[x["bonus"] == 5].sum() / E),
           "stars": float((e * x["stars"]).sum() / e[x["stars"].notna()].sum()) if x["stars"].notna().any() else None,
           "sBr": float((e * x["rate"] * rb).sum() / E)}
    if rho.notna().all():
        out["base1"] = float((e * x["rate"] * rho).sum() / E)                       # bid at CMS's county ratio, risk 1.0
        out["rebate1"] = float((e * x["rate"] * (1 - rho) * rb).sum() / E)          # rebate share x (benchmark - bid)
        out["payment1"] = out["base1"] + out["rebate1"]; out["bidRatio"] = out["base1"] / out["bench"]
    ep = float(np.nansum(x["enr_pay"]))
    if ep > 0:
        out["risk24"] = float(np.nansum(x["risk_x"]) / ep); out["base24"] = float(np.nansum(x["base_x"]) / ep); out["rebate24"] = float(np.nansum(x["rebate_x"]) / ep)
        ab, gap = float(np.nansum(x["ab_x"])), float(np.nansum(x["gap_x"]))
        out["impliedBid"] = ab / (ab + gap) if ab + gap > 0 else None
    em = float(np.nansum(x["enr_mlr"]))
    if em > 0:
        out["mlr23"] = float(np.nansum(x["mlr_num_x"]) / np.nansum(x["mlr_den_x"])); out["mlrDen"] = float(np.nansum(x["mlr_den_x"]) / em)
        out["mlrRevenue"] = float(np.nansum(x["mlr_rev_x"]) / em); out["mlrAbClaims"] = float(np.nansum(x["mlr_ab_x"]) / em)
    return out

# ---------------------------------------------------------------- payer
PAYER_PRESETS = {"min": dict(readmPts=.5, snfToHome=3, snfLos=3, irfToSnf=0, ltchToSnf=0, ipDays=0, perDiemShare=0),
                 "base": dict(readmPts=1, snfToHome=5, snfLos=7, irfToSnf=5, ltchToSnf=5, ipDays=0, perDiemShare=0),
                 "stretch": dict(readmPts=2, snfToHome=10, snfLos=13, irfToSnf=10, ltchToSnf=10, ipDays=5, perDiemShare=20)}

def payer(geo, text, basis="ma"):
    c = in_geo(county, geo).merge(state[["state", "r_ip_stays", "r_ip_days", "r_snf_stays", "r_snf_days", "r_irf_stays", "r_ltch_stays"]], on="state", how="left")
    if text:
        pat = re.compile(".*".join(re.escape(w) for w in re.sub(r"[^a-z0-9&.,\- ]", " ", text.lower()).split()))
        pm = parents[(parents["segment"] == "MA") & parents["parent_org"].str.lower().map(lambda s: bool(pat.search(s)))]
        pm = pm[pm["fips"].isin(c["fips"])]
        m = c["fips"].map(pm.groupby("fips")["enrollment"].sum()).fillna(0.0)
        matched = sorted(pm["parent_org"].unique())
    else:
        m = c["enr_ma"].fillna(0.0); matched = []
    members = float(m.sum())
    ffs = {k: wavg(m, c[col]) for k, col in dict(ipStays="ffs_ip_stays", ipDays="ffs_ip_days", snfStays="ffs_snf_stays", snfDays="ffs_snf_days", irfStays="ffs_irf_stays", ltchStays="ffs_ltch_stays", hh="ffs_hh_episodes").items()}
    ma = {k: wavg(m, c[col] * c[r]) for k, (col, r) in dict(ipStays=("ffs_ip_stays", "r_ip_stays"), ipDays=("ffs_ip_days", "r_ip_days"), snfStays=("ffs_snf_stays", "r_snf_stays"), snfDays=("ffs_snf_days", "r_snf_days"),
                                                           irfStays=("ffs_irf_stays", "r_irf_stays"), ltchStays=("ffs_ltch_stays", "r_ltch_stays")).items()}
    def price(pay, rate):
        ok = c[pay].notna() & c[rate].notna()
        units = (c.loc[ok, "gv_ffs_benes"] * c.loc[ok, rate] / 1000.0).sum()
        return float(c.loc[ok, pay].sum() / units) if units else None
    p = dict(ipPerStay=price("ffs_ip_pymt", "ffs_ip_stays"), ipPerDay=price("ffs_ip_pymt", "ffs_ip_days"), snfPerDay=price("ffs_snf_pymt", "ffs_snf_days"), hh=price("ffs_hh_pymt", "ffs_hh_episodes"),
             irf=price("ffs_irf_pymt", "ffs_irf_stays"), ltch=price("ffs_ltch_pymt", "ffs_ltch_stays"))
    bench0 = wavg(m, c["ma_rate_0"])
    u = ffs if basis == "ffs" else ma
    out = {"members": members, "matched": matched, "ffs": ffs, "ma": ma, "price": p, "benchmark0": bench0, "rev": revenue(geo, text), "cases": {}}
    for name, a in PAYER_PRESETS.items():
        snf_stay = u["snfDays"] / u["snfStays"] * p["snfPerDay"]
        per1000 = {
            "readm": u["ipStays"] * a["readmPts"] / 100 * p["ipPerStay"],
            "home": u["snfStays"] * a["snfToHome"] / 100 * max(snf_stay - p["hh"], 0),
            "los": u["snfDays"] * (1 - a["snfToHome"] / 100) * a["snfLos"] / 100 * p["snfPerDay"],
            "irf": 0 if p["irf"] is None else (u["irfStays"] or 0) * a["irfToSnf"] / 100 * max(p["irf"] - snf_stay, 0),
            "ltch": 0 if p["ltch"] is None else (u["ltchStays"] or 0) * a["ltchToSnf"] / 100 * max(p["ltch"] - snf_stay, 0),
            "ipdays": u["ipDays"] * a["ipDays"] / 100 * a["perDiemShare"] / 100 * p["ipPerDay"],
            "um": 0.0,
        }
        pmpm = {k: v / 12000 for k, v in per1000.items()}
        out["cases"][name] = {"pmpm": pmpm, "totalPmpm": sum(pmpm.values()), "totalPerYear": sum(per1000.values()) * members / 1000}
    return out

# ---------------------------------------------------------------- hospital
HOSP_PRESETS = {"min": dict(daysSaved=.25, backfill=0, penaltyRecovered=0, vbpRecovered=0, readmPts=.5, hoursSaved=.5),
                "base": dict(daysSaved=.5, backfill=25, penaltyRecovered=25, vbpRecovered=5, readmPts=1, hoursSaved=1),
                "stretch": dict(daysSaved=1, backfill=50, penaltyRecovered=50, vbpRecovered=10, readmPts=2, hoursSaved=2)}

def hospital(geo, ccns=None):
    g = hosp_geo.merge(hm, on="hospital_ccn").merge(county[["fips", "state", "cbsa", "gv_ma_benes", "gv_ffs_benes", "ffs_ip_stays", "ffs_snf_stays"]].rename(columns={"cbsa": "c_cbsa"}), on="fips")
    g = g[g["hospital_ccn"].isin(ccns)] if ccns else in_geo(g.assign(cbsa=g["c_cbsa"]), geo)
    h = g.merge(hosp_cost.drop(columns=["state"]), left_on="hospital_ccn", right_on="ccn", how="left").merge(state[["state", "r_ip_stays", "r_snf_stays"]], on="state", how="left")
    n_all = len(h)
    ip_share = h["inpatient_total_charges"] / h["total_charges"].where(h["total_charges"] != 0)
    ip_cost = pd.Series(np.where(h["cost_to_charge_ratio"].notna(), h["inpatient_total_charges"] * h["cost_to_charge_ratio"], h["operating_expense"] * ip_share), index=h.index)
    per_day = ip_cost / h["days_total"]
    usable = ((h["discharges_total"] > 0) & (h["days_total"] > 0) & (h["bed_days_available"] > 0) & (h["days_total"] <= 1.05 * h["bed_days_available"]) & (h["net_patient_revenue"] > 0)
              & (h["inpatient_total_charges"] > 0) & (h["total_charges"] > 0) & (per_day >= 300) & (per_day <= 20000))
    h = h[usable].copy(); ip_share, ip_cost = ip_share[usable], ip_cost[usable]
    both = county["ffs_snf_stays"].notna() & county["ffs_ip_stays"].notna()
    nat = (county.loc[both, "gv_ffs_benes"] * county.loc[both, "ffs_snf_stays"]).sum() / (county.loc[both, "gv_ffs_benes"] * county.loc[both, "ffs_ip_stays"]).sum()
    MEDPAC = 0.187
    ann = 365.0 / h["period_days"]
    S = lambda x: float(np.nansum(x))
    d_total, d_ffs, days, bed_days = S(h["discharges_total"] * ann), S(h["discharges_medicare"] * ann), S(h["days_total"] * ann), S(h["bed_days_available"] * ann)
    ma_ratio = h["gv_ma_benes"] / h["gv_ffs_benes"].where(h["gv_ffs_benes"] != 0)     # 2024 enrollment: the cost reports' year
    d_ma = S(h["discharges_medicare"] * ann * ma_ratio * h["r_ip_stays"])
    p_ffs = S(h["discharges_medicare"] * ann * MEDPAC * (h["ffs_snf_stays"] / h["ffs_ip_stays"]) / nat)
    p_ma = S(h["discharges_medicare"] * ann * ma_ratio * h["r_ip_stays"] * MEDPAC * (h["ffs_snf_stays"] * h["r_snf_stays"]) / (h["ffs_ip_stays"] * h["r_ip_stays"]) / nat)
    cost_day = S(ip_cost * ann) / days
    rev_day = S(h["net_patient_revenue"] * ip_share * ann) / days
    drg = S(h["drg_payments_raw"] * ann)
    pay_stay = drg / S(np.where(h["drg_payments_raw"].notna(), h["discharges_medicare"] * ann, np.nan))
    hrrp = S(h["drg_payments_raw"] * ann * (1 - h["hrrp_factor"]))
    drg_vbp = S((h["drg_payments_raw"] * ann)[h["vbp_factor"].notna()])
    out = {"n": int(n_all), "nUnusable": int(n_all - len(h)), "dischargesTotal": d_total, "dischargesFfs": d_ffs, "maDischarges": d_ma, "placements": p_ffs + p_ma, "costPerDay": cost_day, "revPerDay": rev_day, "drg": drg, "hrrpPenalty": hrrp,
           "nPenalized": int((h["hrrp_factor"] < 1).sum()), "occupancy": days / bed_days, "cases": {}}
    for name, a in HOSP_PRESETS.items():
        v, bf, placements = 0.30, a["backfill"] / 100, p_ffs + p_ma
        per_day = (1 - bf) * v * cost_day + bf * max(rev_day - v * cost_day, 0)
        lev = {"days": placements * a["daysSaved"] * per_day, "hrrp": hrrp * a["penaltyRecovered"] / 100, "vbp": drg_vbp * 0.02 * a["vbpRecovered"] / 100, "readm": 0.0, "labor": placements * a["hoursSaved"] * 55}
        out["cases"][name] = {"levers": lev, "total": sum(lev.values()), "valuePerDay": per_day}
    return out

# ---------------------------------------------------------------- SNF
SNF_PRESETS = {"min": dict(fill=10, medicareShare=30, hoursSaved=.5), "base": dict(fill=25, medicareShare=40, hoursSaved=1), "stretch": dict(fill=50, medicareShare=50, hoursSaved=1.5)}

def snf(geo, ccns=None, high_only=False):
    g = snf_geo.merge(fac, on="ccn").merge(county[["fips", "state"]].rename(columns={"state": "c_state"}), on="fips")
    g = g[g["ccn"].isin(ccns)] if ccns else in_geo(g.assign(state=g["c_state"]), geo)
    if high_only: g = g[g["overall_rating"] >= 4]
    s = g.merge(snf_cost.drop(columns=["state", "medicare_cbsa"]), on="ccn", how="left")
    n_all = len(s)
    usable = ((s["days_total"] > 0) & (s["bed_days_available"] > 0) & (s["days_total"] >= 0.10 * s["bed_days_available"]) & (s["days_total"] <= 1.02 * s["bed_days_available"]) & (s["net_patient_revenue"] > 0)
              & (s["operating_expense"] >= 0.5 * s["net_patient_revenue"]) & (s["operating_expense"] <= 2 * s["net_patient_revenue"])
              & (s["days_medicare"] > 0) & (s["days_medicare"] < s["days_total"]) & (s["inpatient_pps_amount"] > 0) & (s["inpatient_pps_amount"] < s["net_patient_revenue"]))
    s = s[usable].copy()
    if not len(s): return {"n": int(n_all), "nUnusable": int(n_all), "cases": None}
    ann = 365.0 / s["period_days"]; has = s["days_total"].notna()
    S = lambda x: float(np.nansum(x))
    days, bed_days, mcr_days = S(s["days_total"] * ann), S(s["bed_days_available"] * ann), S(s["days_medicare"] * ann)
    revenue, opex, pps = S((s["net_patient_revenue"] * ann)[has]), S((s["operating_expense"] * ann)[has]), S(s["inpatient_pps_amount"] * ann)
    admissions, beds = S(s["discharges_total"] * ann), S(s["beds"][has])
    empty = max(bed_days - days, 0); opex_day = opex / days
    mcr = pps / mcr_days; non = (revenue - pps) / (days - mcr_days)
    out = {"n": int(n_all), "nUnusable": int(n_all - len(s)), "occupancy": days / bed_days, "revPerDay": revenue / days, "opexPerDay": opex_day, "medicareRevPerDay": mcr, "nonMedicareRevPerDay": non, "beds": beds, "cases": {}}
    for name, a in SNF_PRESETS.items():
        added = empty * a["fill"] / 100; add_m = added * a["medicareShare"] / 100
        lev = {"fill": add_m * mcr + (added - add_m) * non - added * opex_day * 0.5, "intake": admissions * a["hoursSaved"] * 40}
        out["cases"][name] = {"levers": lev, "total": sum(lev.values()), "addedDays": added}
    out["medicaidDaysCarried"] = (mcr - opex_day) / (opex_day - non) if mcr > opex_day and opex_day > non else None
    return out

if __name__ == "__main__":
    # one SNF in the Baltimore metro area with a full cost report, chosen deterministically (lowest CCN)
    one_snf, bad_snf = "215022", "215037"   # 215037's report shows operating expense 2.3x patient revenue and must be refused
    res = {
        "payer_baltimore_united": payer("12580", "united"),
        "payer_baltimore_united_unmanaged": payer("12580", "united", "ffs"),
        "payer_us_all": payer("US", ""),
        "payer_us_all_unmanaged": payer("US", "", "ffs"),
        "payer_md_humana": payer("ST-MD", "humana"),
        "hospital_390133": hospital("US", ["390133"]),
        "hospital_baltimore": hospital("12580"),
        "snf_one": {"ccn": one_snf, **snf("US", [one_snf])},
        "snf_baltimore": snf("12580"),
        "snf_baltimore_high": snf("12580", high_only=True),
        "snf_refused": {"ccn": bad_snf, **snf("US", [bad_snf])},
    }
    out = ROOT / "app" / "tests" / "value_expected.json"
    json.dump(res, open(out, "w"), indent=1, default=float)
    assert res["snf_refused"]["cases"] is None and res["snf_one"]["cases"] is not None
    for k, v in res.items():
        c = v["cases"]
        if c is None: print(f"{k:36s} refused (no usable cost report)"); continue
        print(f"{k:36s}", {n: round(c[n].get("totalPmpm", c[n].get("total")), 2) for n in c})
    print("wrote", out)
