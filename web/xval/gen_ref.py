"""Generate reference results with the Python implementation for cross-validation of the JS engine."""
import json, random, sys, datetime as dt
sys.path.insert(0, ".")
import yaml
from rtgap.config import planner_from_dict, load_file
from rtgap.decide import decide
from rtgap.analysis import sensitivity, resume_scenarios, candidate_resume_dates
from rtgap.rules import load_library
from rtgap.validation import ValidationError

def opt(o):
    return dict(key=o.key, family=o.family, d=o.dose_per_fraction, n=o.n_new, end=o.end_date.isoformat(), ext=o.extension_days,
                T=o.overall_time, tumour=o.tumour.eqd2, levels=[r.eqd2 for r in o.levels], oars=[r.eqd2 for r in o.oars],
                nrej=len(o.rejected), nwarn=len(o.warnings), wk=o.weekly_peak, slots=[[f.date.isoformat(), f.slot, f.phase, round(f.dose, 6)] for f in o.new_fractions])

def run(cfg, proto):
    try:
        p, _ = planner_from_dict(cfg, proto)
    except ValidationError as e:
        return {"error": True}
    dec = decide(p)
    out = dict(status=dec.status, rec=dec.recommended.key if dec.recommended else None, cands=[o.key for o in dec.candidates],
               feasible=[opt(o) for o in dec.feasible], rejected=[opt(o) for o in dec.rejected],
               planned=[p.planned_levels, p.planned_oars], nwarn=len(p.input_warnings), ntrace=len(dec.trace))
    if p.remaining and cfg.get("_sens"):
        s = sensitivity(p, dec)
        if s: out["sens"] = dict(n=s.n, t=list(s.tumour_range), same=s.same_fraction, oar={k: list(v) for k, v in s.oar_pct_ranges.items()})
    if p.missed and cfg.get("_scen"):
        rows = resume_scenarios(p, p.missed[0], candidate_resume_dates(p, p.missed[0], 10))
        out["scen"] = [dict(r=r.resume.isoformat(), n=r.n_missed, ext=r.baseline_extension, d=r.baseline_tumour_delta, status=r.status,
                            rec=r.option.key if r.option else None) for r in rows]
    return out

cases = []
for f in ["hn_machine_breakdown", "rectum_5x5_book_ex5", "hn_sib_outage", "hn_sequential_boost"]:
    cfg = load_file(f"examples/{f}.yaml"); cfg.pop("scenarios", None)
    for proto in ({}, load_file("examples/protocol_example.yaml")):
        cases.append((dict(cfg, _sens=True, _scen=True), proto))
random.seed(7)
sites = list(load_library())
RX = [dict(n_fractions=35, dose_per_fraction=2.0), dict(n_fractions=30, dose_per_fraction=2.0), dict(n_fractions=20, dose_per_fraction=2.75),
      dict(n_fractions=15, dose_per_fraction=2.67), dict(n_fractions=25, dose_per_fraction=1.8), dict(n_fractions=10, dose_per_fraction=3.0),
      dict(n_fractions=5, dose_per_fraction=5.0), dict(n_fractions=33, dose_per_fraction=2.12),
      dict(phases=[dict(n_fractions=33, levels=dict(P1=2.12, P2=1.8, P3=1.64))]),
      dict(phases=[dict(n_fractions=25, levels=dict(A=2.0, B=2.0)), dict(n_fractions=8, levels=dict(A=2.0))], primary_level="A"),
      dict(phases=[dict(n_fractions=23, levels=dict(A=2.0, B=1.8)), dict(n_fractions=7, levels=dict(A=2.4))])]
for i in range(260):
    rx = dict(random.choice(RX))
    start = dt.date(2026, 1, 5) + dt.timedelta(days=random.randrange(0, 330))
    rx["start"] = start.isoformat()
    if random.random() < 0.6: rx["holidays"] = "GR"
    n = rx.get("n_fractions") or sum(p["n_fractions"] for p in rx["phases"])
    span = int(n * 1.4) + 3
    first = random.randrange(0, span)
    L = random.choice([1, 1, 2, 3, 3, 5, 8, 10])
    missed = [(start + dt.timedelta(days=first + j)).isoformat() for j in range(L)]
    if random.random() < 0.15: missed.append((start + dt.timedelta(days=random.randrange(0, span))).isoformat())
    c = {}
    for k in ("allow_saturday", "allow_sunday", "allow_bid", "allow_dose_change", "allow_extra_fractions"):
        if random.random() < 0.35: c[k] = False
    if random.random() < 0.5:
        c["max_late_increase_pct"] = random.choice([1, 2, 3, 5]); c["max_tumour_deficit_pct"] = random.choice([1, 2, 4])
    if random.random() < 0.15: c["max_weekly_increase_pct"] = random.choice([10, 25])
    if random.random() < 0.15: c["max_dose_per_fraction"] = random.choice([2.5, 3.0])
    if random.random() < 0.15: c["max_fractions_per_week"] = random.choice([5, 6])
    if random.random() < 0.15: c["dose_rounding"] = random.choice([0.05, 0.1])
    if random.random() < 0.15: c["allow_consecutive_bid"] = False
    if random.random() < 0.15:
        c["chemo_dates"] = [(start + dt.timedelta(days=7 * w)).isoformat() for w in range(7)]; c["chemo_daily"] = random.random() < 0.3
    cfg = dict(site=random.choice(sites), prescription=rx, gap=dict(missed_dates=missed), constraints=c,
               _sens=(i % 6 == 0), _scen=(i % 9 == 0))
    if random.random() < 0.3: cfg["gap"]["cause"] = random.choice(["machine", "toxicity", "holiday", "patient"])
    if random.random() < 0.3:
        cfg["oars"] = [dict(name="Late", alpha_beta=3), dict(name="Cord", alpha_beta=2, dose_ratio=random.choice([0.6, 0.7, [0.9, 0.2]]), max_eqd2=random.choice([45, 50, None]))]
    if random.random() < 0.15: cfg["tumour"] = dict(dprolif_eqd2_per_day=0.7, kickoff_days=21)
    if cfg.get("oars") and random.random() < 0.3: cfg["oars"][0]["repair_half_time_h"] = random.choice([None, 1.5, 4.0])
    if random.random() < 0.2:
        k = random.choice([2, 3, 4]); first_bt = start + dt.timedelta(days=random.choice([14, 21, 28, 35]) + random.choice([0, 1, 2]))
        cfg["brachy"] = dict(fractions=[dict(date=(first_bt + dt.timedelta(days=7 * q)).isoformat(), dose=random.choice([5.5, 7, 7.5])) for q in range(k)])
        if cfg.get("oars"): cfg["oars"][-1]["brachy_ratio"] = random.choice([0.6, 0.75])
    if random.random() < 0.1: cfg["gap"]["unavailable_dates"] = [(dt.date.fromisoformat(missed[-1]) + dt.timedelta(days=random.randrange(1, 12))).isoformat()]
    cases.append((cfg, {}))
ref = [dict(case=c, protocol=p, result=run(c, p)) for c, p in cases]
json.dump(ref, open("web/xval/ref.json", "w"), default=str)
lib = yaml.safe_load(open("rtgap/data/sites.yaml", encoding="utf-8"))["sites"]
json.dump(lib, open("web/sites.json", "w"), ensure_ascii=False, indent=0)
st = {}
for r in ref: st[r["result"].get("status", "error")] = st.get(r["result"].get("status", "error"), 0) + 1
print(len(ref), st)
