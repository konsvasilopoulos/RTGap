import datetime as dt

import pytest

from rtgap import lq
from rtgap.config import planner_from_dict
from rtgap.decide import decide
from rtgap.gap import GapPlanner, Prescription
from rtgap.rules import CaseRules, Constraints, load_library
from rtgap.schedule import Fraction, has_consecutive_bid, overall_time
from rtgap.tissues import Tissue

MONDAY = dt.date(2026, 1, 5)


def day(n):
    return MONDAY + dt.timedelta(days=n)


def hn(missed, category=1, n=35, d=2.0, **c):
    rx = Prescription(MONDAY, n, d)
    return GapPlanner(rx, Tissue.tumour("T", 10, k_bed=0.9, kickoff_days=28), [Tissue("Late", 3)],
                      missed_dates=missed, constraints=Constraints(**c), category=category)


# ---------------------------------------------------------------- LQ basics
def test_eqd2_identity_at_2gy():
    for ab in (1.5, 3, 10):
        assert lq.eqd2(30, 2, ab) == pytest.approx(60)


def test_k_bed_dprolif_roundtrip():
    assert lq.dprolif_from_k_bed(lq.k_bed_from_dprolif(0.7, 10), 10) == pytest.approx(0.7)
    assert lq.dprolif_from_k_bed(0.9, 10) == pytest.approx(0.75)


def test_thames_h2_equals_theta():
    t = Tissue("late", 3.0, repair_half_time_h=1.5)
    theta = lq.repair_factor(6, 1.5)
    bid = [Fraction(MONDAY, 0, 2.0), Fraction(MONDAY, 1, 2.0)]
    assert t.bed(bid, 6) == pytest.approx(4 * (1 + 2 * (1 + theta) / 3))
    assert Tissue("late", 3.0, repair_half_time_h=1e-6).bed(bid, 6) == pytest.approx(lq.bed(2, 2, 3))


def test_overall_time_convention():
    assert overall_time(Prescription(MONDAY, 35, 2.0).planned_fractions()) == 46


def test_holidays_shift_plan():
    rx = Prescription(MONDAY, 5, 2.0, closed_dates=frozenset({day(2)}))
    dates = [f.date for f in rx.planned_fractions()]
    assert day(2) not in dates and dates[-1] == day(7)


# ---------------------------------------------------------------- generation
def test_all_methods_generated_regardless_of_local_limits():
    p = hn([day(14), day(15), day(16)], allow_saturday=False, allow_sunday=False, allow_bid=False)
    fams = {o.family for o in p.options()}
    assert {"baseline", "weekend", "bid", "same_end", "extended", "extra"} <= fams


def test_bid_avoids_consecutive_days():
    p = hn([day(14), day(15), day(16)])
    bid = next(o for o in p.options() if o.key == "bid")
    assert bid.extension_days == 0 and bid.n_bid_days == 3
    assert not has_consecutive_bid(bid.new_fractions)


def test_extra_fractions_restore_tumour():
    p = hn([day(n) for n in range(42, 47)])
    extra = next(o for o in p.options() if o.key == "extra")
    assert extra.tumour.eqd2 >= p.planned_tumour - 1e-9 and extra.n_new > p.remaining


# ---------------------------------------------------------------- decisions
def test_cat1_prefers_saturday():
    dec = decide(hn([day(14), day(15)]))
    assert dec.status == "recommended"
    assert dec.recommended.family == "weekend" and dec.recommended.n_sundays == 0
    assert dec.recommended.extension_days == 0


def test_cat1_falls_back_to_bid_without_weekends():
    dec = decide(hn([day(14), day(15)], allow_saturday=False, allow_sunday=False))
    assert dec.recommended.family == "bid"
    assert any("Saturday treatment not available" in w for o in dec.rejected for w in o.rejected)


def test_cat1_no_weekend_no_bid_needs_clinical_decision_by_default():
    dec = decide(hn([day(14), day(15), day(16)], allow_saturday=False, allow_sunday=False, allow_bid=False))
    assert dec.status == "clinical_decision" and dec.recommended is None
    assert any(o.strategy == "match_tumour" for o in dec.candidates)
    assert any(o.strategy == "match_late" for o in dec.candidates)


def test_cat1_dose_change_with_looser_late_tolerance():
    dec = decide(hn([day(14), day(15), day(16)], allow_saturday=False, allow_sunday=False, allow_bid=False,
                    max_tumour_deficit_pct=1, max_late_increase_pct=5))
    assert dec.status == "recommended"
    assert dec.recommended.family == "same_end" and dec.recommended.strategy == "match_tumour"
    assert dec.recommended.extension_days == 0


def test_cat3_short_gap_no_action():
    dec = decide(hn([day(2), day(3)], category=3, n=10, d=3.0))
    assert dec.status == "no_action" and dec.recommended.family == "baseline"


def test_cat2_within_allowance_without_weekends():
    dec = decide(hn([day(14), day(15), day(16)], category=2, allow_saturday=False,
                    allow_sunday=False, allow_bid=False))
    assert dec.status == "no_action" and dec.recommended.extension_days == 5  # 3 weekdays = 5 calendar days


def test_cat2_prefers_weekend_when_available():
    dec = decide(hn([day(14), day(15), day(16)], category=2))
    assert dec.recommended.family == "weekend"


def test_bid_rejected_above_2_2_gy():
    dec = decide(hn([day(14), day(15)], n=20, d=2.75, allow_saturday=False, allow_sunday=False))
    bid = next(o for o in dec.rejected if o.key == "bid")
    assert any("2.2 Gy" in w for w in bid.rejected)


def test_bid_rejected_on_weekly_chemo_day():
    p = hn([day(14), day(15)], allow_saturday=False, allow_sunday=False,
           chemo_dates=(day(21), day(23), day(28), day(35), day(42)))
    dec = decide(p)
    bid = next(o for o in dec.feasible + dec.rejected if o.key == "bid")
    if set(f.date for f in bid.new_fractions if f.slot == 1) & {day(21), day(23), day(28), day(35), day(42)}:
        assert any("chemotherapy" in w for w in bid.rejected)


def test_sabr_no_acceleration():
    rx = Prescription(MONDAY, 5, 11.0)
    rules = load_library()["sabr"].rules()
    p = GapPlanner(rx, Tissue.tumour("T", 10), [Tissue("Late", 3)], missed_dates=[day(2)], rules=rules)
    dec = decide(p)
    assert dec.recommended.family == "baseline"
    assert all(o.family == "baseline" for o in dec.feasible)


def test_cervix_overall_time_cap():
    lib = load_library()
    rx = Prescription(MONDAY, 28, 1.8)
    s = lib["cervix_scc"]
    missed = [day(n) for n in range(21, 42) if day(n).weekday() < 5]   # weeks 4-6 lost
    p = GapPlanner(rx, s.tumour_tissue(), s.oar_tissues(), missed_dates=missed, rules=s.rules())
    dec = decide(p)
    assert all(o.overall_time <= 56 for o in dec.feasible)
    long = [o for o in dec.rejected if o.overall_time > 56]
    assert long and all(any("56 d" in w for w in o.rejected) for o in long)


# ---------------------------------------------------------------- library / config
def test_library_loads_and_protocol_overrides():
    lib = load_library({"hn_scc": {"tumour": {"k_bed_per_day": 0.8}}, "my_site": {"category": 2}})
    assert lib["hn_scc"].tumour["k_bed_per_day"] == 0.8
    assert lib["hn_scc"].tumour["alpha_beta"] == 10
    assert lib["my_site"].rules().max_extension_days == 5
    assert lib["cervix_scc"].max_overall_time_days == 56
    assert lib["prostate"].tumour["alpha_beta"] == 1.6
    assert all(s.category in (1, 2, 3, None) for s in lib.values())


def test_category_defaults():
    assert (CaseRules(category=1).ideal_extension_days, CaseRules(category=1).max_extension_days) == (0, 2)
    assert CaseRules(category=2).max_extension_days == 5
    assert CaseRules(category=3).ideal_extension_days == 7


def test_case_dict_with_site_and_protocol():
    cfg = {"site": "hn_scc", "prescription": {"start": "2026-01-05", "n_fractions": 35, "dose_per_fraction": 2},
           "gap": {"missed_dates": ["2026-01-19", "2026-01-20"]}}
    protocol = {"constraints": {"allow_saturday": False, "allow_sunday": False}}
    p, _ = planner_from_dict(cfg, protocol)
    assert p.category == 1 and not p.c.allow_saturday
    assert decide(p).recommended.family == "bid"


def test_unknown_constraint_rejected():
    with pytest.raises(ValueError):
        Constraints.from_dict({"allow_saturdays": True})


# ---------------------------------------------------------------- acute reactions, cause, tolerances
def test_dose_change_never_automatic_without_tolerances():
    dec = decide(hn([day(14), day(15), day(16)], allow_saturday=False, allow_sunday=False, allow_bid=False))
    assert dec.status == "clinical_decision"
    assert any("No local tolerances" in s for s in dec.trace)


def test_weekly_peak_rises_with_weekend_and_bid():
    p = hn([day(14), day(15)])
    opts = {o.key: o for o in p.options()}
    assert opts["none"].weekly_increase_pct == pytest.approx(0, abs=1e-9)
    assert opts["sat"].weekly_increase_pct == pytest.approx(20, abs=1e-6)       # 6 instead of 5 fractions in 7 days
    assert opts["bid"].weekly_increase_pct > 0
    dec = decide(p)
    assert any("acute reactions" in w for w in dec.recommended.warnings)


def test_weekly_limit_excludes_acceleration():
    dec = decide(hn([day(14), day(15)], max_weekly_increase_pct=10))
    assert all(o.weekly_increase_pct <= 10 + 1e-9 for o in dec.feasible)
    assert any("peak 7-day dose" in w for o in dec.rejected for w in o.rejected)


def test_toxicity_gap_is_not_accelerated_automatically():
    p = hn([day(14), day(15), day(16)])
    p.rules.gap_cause = "toxicity"
    dec = decide(p)
    assert dec.status == "clinical_decision" and dec.recommended is None
    assert all("toxicity" in " ".join(o.warnings) for o in dec.feasible if o.family != "baseline")


def test_machine_gap_mentions_matched_machine():
    p = hn([day(14), day(15)])
    p.rules.gap_cause = "machine"
    assert any("matched machine" in s for s in decide(p).trace)
