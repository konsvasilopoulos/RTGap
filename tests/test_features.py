"""Dose levels / phases, holidays, validation, robustness, scenarios, audit trail."""
import datetime as dt
import json
import re

import pytest

from rtgap import lq
from rtgap.analysis import candidate_resume_dates, resume_scenarios, sensitivity
from rtgap.cli import main
from rtgap.config import planner_from_dict
from rtgap.decide import decide
from rtgap.gap import GapPlanner, Phase, Prescription
from rtgap.holidays import greek_holidays, orthodox_easter
from rtgap.report import html_report, input_checksum
from rtgap.tissues import Tissue
from rtgap.validation import ValidationError

MONDAY = dt.date(2026, 1, 5)


def day(n):
    return MONDAY + dt.timedelta(days=n)


def tumour():
    return Tissue.tumour("T", 10, k_bed=0.9, kickoff_days=28)


# ------------------------------------------------------------ levels / phases
def test_sib_levels_planned_eqd2():
    rx = Prescription(MONDAY, phases=[Phase(35, {"PTV70": 2.0, "PTV63": 1.8, "PTV56": 1.6})])
    assert rx.primary_level == "PTV70" and rx.total_dose_level("PTV56") == pytest.approx(56)
    p = GapPlanner(rx, tumour(), [Tissue("Late", 3)])
    names = [t.name for t in p.tumours]
    assert names == ["PTV70", "PTV63", "PTV56"]
    # PTV63: 35 x 1.8 Gy, alpha/beta 10, minus the same repopulation as PTV70
    rep = lq.dprolif_from_k_bed(0.9, 10) * (46 - 28)
    assert p.planned_levels[1] == pytest.approx(lq.eqd2(35, 1.8, 10) - rep)


def test_sib_scaling_scales_every_level():
    rx = Prescription(MONDAY, phases=[Phase(35, {"PTV70": 2.0, "PTV56": 1.6})])
    p = GapPlanner(rx, tumour(), [Tissue("Late", 3)], missed_dates=[day(14), day(15), day(16)])
    o = next(o for o in p.options() if o.key == "same_end_tumour")
    ph = o.phase_doses[0]
    assert ph["PTV56"] / ph["PTV70"] == pytest.approx(0.8, abs=1e-3)
    assert o.tumour.delta == pytest.approx(0, abs=0.1)
    assert o.levels[0].delta < 0          # lower level gains less from the larger fractions


def test_sequential_phases_assignment_and_own_overall_time():
    rx = Prescription(MONDAY, phases=[Phase(25, {"PTV70": 2.0, "PTV50": 2.0}), Phase(10, {"PTV70": 2.0})])
    missed = [day(35), day(36)]                     # boost fx 1-2 (Mon/Tue of week 6)
    p = GapPlanner(rx, tumour(), [Tissue("Late", 3)], missed_dates=missed)
    assert all(f.phase == 0 for f in p.delivered)
    assert p.remaining_phases == [1] * 10
    base = next(o for o in p.options() if o.family == "baseline")
    # PTV50 finished with phase 1: the prolongation of the boost does not affect it
    assert base.levels[0].delta == pytest.approx(0, abs=1e-9)
    assert base.tumour.delta < 0


def test_phase_shift_after_gap_in_phase1():
    # gap at the end of phase 1: the fractions after the gap still finish phase 1 first
    rx = Prescription(MONDAY, phases=[Phase(25, {"A": 2.0}), Phase(10, {"A": 2.4})])
    p = GapPlanner(rx, tumour(), [Tissue("Late", 3)], missed_dates=[day(28), day(29)])
    assert len(p.delivered) == 20
    assert p.remaining_phases == [0] * 5 + [1] * 10


def test_fewer_fractions_shared_across_phases():
    rx = Prescription(MONDAY, phases=[Phase(30, {"A": 2.0}), Phase(5, {"A": 2.0, "B": 0.0001})])
    p = GapPlanner(rx, tumour(), [Tissue("Late", 3)], missed_dates=[day(21), day(22)])
    slots = p.pattern_same_end()
    assigned = p._assign(slots)
    from collections import Counter
    c = Counter(f.phase for f in assigned)
    assert c[1] >= 4 and sum(c.values()) == len(slots)


# ------------------------------------------------------------ holidays
def test_orthodox_easter_known_dates():
    assert orthodox_easter(2024) == dt.date(2024, 5, 5)
    assert orthodox_easter(2025) == dt.date(2025, 4, 20)
    assert orthodox_easter(2026) == dt.date(2026, 4, 12)
    assert orthodox_easter(2027) == dt.date(2027, 5, 2)


def test_greek_holidays_2026():
    h = greek_holidays(2026)
    for d in ["2026-02-23", "2026-03-25", "2026-04-10", "2026-04-13", "2026-06-01", "2026-10-28"]:
        assert dt.date.fromisoformat(d) in h


def test_holidays_in_case_file_shift_plan():
    cfg = {"prescription": {"start": "2026-10-19", "n_fractions": 10, "dose_per_fraction": 2, "holidays": "GR"},
           "gap": {"missed_dates": []}}
    p, _ = planner_from_dict(cfg)
    assert dt.date(2026, 10, 28) not in {f.date for f in p.planned}


# ------------------------------------------------------------ validation
BASE = {"prescription": {"start": "2026-01-05", "n_fractions": 35, "dose_per_fraction": 2}}


def test_validation_warns_weekend_missed_and_unknown_key():
    cfg = dict(BASE, gap={"missed_dates": ["2026-01-10", "2026-01-12"]}, sitee="x")
    p, _ = planner_from_dict(cfg)
    assert any("not a planned treatment day" in w for w in p.input_warnings)
    assert any("Unknown case key 'sitee'" in w for w in p.input_warnings)


def test_validation_errors():
    with pytest.raises(ValidationError):
        planner_from_dict(dict(BASE, gap={"missed_dates": ["2025-12-30"]}))
    with pytest.raises(ValidationError):
        planner_from_dict(dict(BASE, gap={"missed_dates": ["2026-01-12", "2026-01-13"], "resume_date": "2026-01-12"}))


def test_outage_start_computes_missed():
    cfg = dict(BASE, gap={"outage_start": "2026-01-14", "resume_date": "2026-01-19"})
    p, _ = planner_from_dict(cfg)
    assert p.missed == [dt.date(2026, 1, 14), dt.date(2026, 1, 15), dt.date(2026, 1, 16)]


# ------------------------------------------------------------ robustness / scenarios
def test_sensitivity_grid_and_ranges():
    p = GapPlanner(Prescription(MONDAY, 35, 2.0), tumour(), [Tissue("Late", 3)],
                   missed_dates=[day(14), day(15), day(16)], category=1)
    p.c.allow_saturday = p.c.allow_sunday = p.c.allow_bid = False
    p.c.max_late_increase_pct = 5
    p.c.max_tumour_deficit_pct = 1
    dec = decide(p)
    s = sensitivity(p, dec)
    assert s.n == 81
    assert s.tumour_range[0] <= dec.recommended.tumour.delta <= s.tumour_range[1]
    assert 0 < s.same_fraction <= 1


def test_sensitivity_without_time_factor_is_smaller():
    p = GapPlanner(Prescription(MONDAY, 20, 3.0), Tissue.tumour("T", 1.6), [Tissue("Late", 3)],
                   missed_dates=[day(14)], category=2)
    assert sensitivity(p, decide(p)).n == 9


def test_resume_scenarios_monotone():
    p = GapPlanner(Prescription(MONDAY, 35, 2.0), tumour(), [Tissue("Late", 3)], missed_dates=[day(21)], category=1)
    dates = candidate_resume_dates(p, day(21), 10)
    rows = resume_scenarios(p, day(21), dates)
    assert [r.n_missed for r in rows] == sorted(r.n_missed for r in rows)
    assert rows[0].n_missed == 1


# ------------------------------------------------------------ audit trail
def test_report_embeds_input_and_extract_roundtrip(tmp_path, capsys):
    case = tmp_path / "case.json"
    cfg = dict(BASE, title="t", site="hn_scc", gap={"missed_dates": ["2026-01-19", "2026-01-20"]})
    case.write_text(json.dumps(cfg))
    html_path, js = tmp_path / "r.html", tmp_path / "r.json"
    assert main(["plan", str(case), "--html", str(html_path), "--json", str(js), "--no-sensitivity"]) == 0
    text = html_path.read_text()
    checksum = input_checksum({"case": cfg, "protocol": {}})
    assert checksum in text
    assert json.loads(js.read_text())["input_sha256"] == checksum
    out = tmp_path / "back.json"
    assert main(["extract", str(html_path), "-o", str(out)]) == 0
    assert json.loads(out.read_text())["case"] == cfg
    # the extracted file re-runs to the same decision
    assert main(["plan", str(out), "--no-sensitivity"]) == 0
    assert "DECISION [recommended]" in capsys.readouterr().out


def test_checksum_changes_with_input():
    assert input_checksum({"a": 1}) != input_checksum({"a": 2})
    assert input_checksum({"a": 1, "b": 2}) == input_checksum({"b": 2, "a": 1})


# ------------------------------------------------------------ incomplete repair default, brachytherapy
def test_site_oars_have_default_repair_half_time_and_bid_costs_late_dose():
    cfg = {"site": "hn_scc", "prescription": {"start": "2026-01-05", "n_fractions": 35, "dose_per_fraction": 2},
           "gap": {"missed_dates": ["2026-01-19", "2026-01-20", "2026-01-21"]}}
    p, _ = planner_from_dict(cfg)
    assert p.oars[0].repair_half_time_h == pytest.approx(4.4)
    opts = {o.key: o for o in p.options()}
    theta = lq.repair_factor(6, 4.4)
    extra_bed = 3 * (2 * 2 * 2 * theta / 3)            # three BID days: cross term 2·d·d·θ/(α/β)
    assert opts["bid"].oars[0].delta == pytest.approx(lq.eqd2_from_bed(extra_bed, 3), abs=1e-6)
    assert opts["sat"].oars[0].delta == pytest.approx(0, abs=1e-9)
    cfg["oars"] = [{"name": "Late", "alpha_beta": 3, "repair_half_time_h": None}]
    p2, _ = planner_from_dict(cfg)
    assert {o.key: o for o in p2.options()}["bid"].oars[0].delta == pytest.approx(0, abs=1e-9)


def test_brachytherapy_adds_dose_and_counts_in_overall_time():
    cfg = {"site": "cervix_scc_brachy", "prescription": {"start": "2026-01-05", "n_fractions": 25, "dose_per_fraction": 1.8},
           "oars": [{"name": "Rectum", "alpha_beta": 3, "brachy_ratio": 0.7}],
           "brachy": {"fractions": [{"date": "2026-02-02", "dose": 7}, {"date": "2026-02-09", "dose": 7},
                                    {"date": "2026-02-16", "dose": 7}, {"date": "2026-02-23", "dose": 7}]},
           "gap": {"missed_dates": ["2026-01-19", "2026-01-20"]}}
    p, _ = planner_from_dict(cfg)
    assert dt.date(2026, 2, 2) not in {f.date for f in p.planned}          # no EBRT on a brachytherapy day
    T = (dt.date(2026, 2, 23) - dt.date(2026, 1, 5)).days
    rep = lq.dprolif_from_k_bed(0.9, 10) * (T - 28)
    assert p.planned_tumour == pytest.approx(lq.eqd2(25, 1.8, 10) + lq.eqd2(4, 7, 10) - rep)
    assert p.planned_oars[0] == pytest.approx(lq.eqd2(25, 1.8, 3) + lq.eqd2(4, 4.9, 3))
    dec = decide(p)
    base = next(o for o in dec.feasible + dec.rejected if o.family == "baseline")
    assert base.overall_time == T                       # brachytherapy ends after EBRT: overall time unchanged
    assert base.tumour.delta == pytest.approx(0, abs=1e-9)
    assert base.extension_days > 0                      # but external beam itself finishes later
    s = sensitivity(p, dec)
    assert s is not None and s.n == 81


def test_local_control_rule_and_recoverable_fraction():
    from rtgap.analysis import local_control_loss, recoverable_fraction
    p = GapPlanner(Prescription(MONDAY, 35, 2.0), tumour(), [Tissue("Late", 3)],
                   missed_dates=[day(14), day(15), day(16)], category=1)
    dec = decide(p)
    base = next(o for o in dec.feasible if o.family == "baseline")
    lo, hi = local_control_loss(p, base)
    assert base.extension_days == 5 and (lo, hi) == pytest.approx((5.0, 7.0))     # 5 days x 1.0-1.4 %
    assert local_control_loss(p, dec.recommended) == pytest.approx((0.0, 0.0))
    assert recoverable_fraction(p, dec, 0.5) == pytest.approx(1.0)
    p.c.allow_saturday = p.c.allow_sunday = p.c.allow_bid = False
    dec = decide(p)
    assert recoverable_fraction(p, dec, 0.5) < recoverable_fraction(p, dec, 5.0) <= 1.0
