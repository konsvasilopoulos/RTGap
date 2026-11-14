"""Treatment history: several interruptions, fractions given outside the plan, an earlier plan
change, and dose errors corrected inside the gap workflow (Joiner)."""
import datetime as dt

import pytest

from rtgap.config import planner_from_dict
from rtgap.decide import decide
from rtgap.error import joiner_correction
from rtgap.gap import GapPlanner, Prescription, allocate_phases
from rtgap.tissues import Tissue
from rtgap.validation import ValidationError

MON = dt.date(2026, 10, 5)


def day(n):
    return MON + dt.timedelta(days=n)


def case(gap, **kw):
    cfg = dict(site="hn_scc", prescription=dict(start=MON.isoformat(), n_fractions=35, dose_per_fraction=2.0),
               gap=gap, constraints=kw.pop("constraints", {}))
    cfg.update(kw)
    return planner_from_dict(cfg)[0]


def test_allocate_phases():
    assert allocate_phases([0] * 3 + [1] * 2, 5) == [0, 0, 0, 1, 1]
    assert allocate_phases([0] * 3 + [1] * 2, 7) == [0, 0, 0, 1, 1, 1, 1]
    assert allocate_phases([0] * 6 + [1] * 4, 5) == [0, 0, 0, 1, 1]


def test_two_interruptions_are_counted_over_the_whole_course():
    p = case({"missed_dates": [day(9).isoformat(), day(10).isoformat(), day(30).isoformat(), day(31).isoformat()]})
    assert [(a, b, n) for a, b, n in p.interruptions] == [(day(9), day(10), 2), (day(30), day(31), 2)]
    assert p.remaining == 15
    dec = decide(p)
    base = next(o for o in dec.feasible + dec.rejected if o.family == "baseline")
    assert base.extension_days == 6              # 4 missed weekdays push the end by 6 calendar days
    assert any("2 interruptions" in t for t in dec.trace)


def test_extra_fractions_given_count_as_delivered():
    # interruption Wed-Thu week 2; compensated on Saturday and with a second fraction on Tuesday
    gap = {"missed_dates": [day(9).isoformat(), day(10).isoformat()], "extra_delivered": [day(12).isoformat(), day(15).isoformat()],
           "resume_date": day(16).isoformat()}
    p = case(gap)
    sat = [f for f in p.delivered if f.date == day(12)]
    tue = sorted(f.slot for f in p.delivered if f.date == day(15))
    assert len(sat) == 1 and sat[0].slot == 0 and tue == [0, 1]
    assert len(p.delivered) == 12 - 2 + 2 and p.remaining == 35 - 12
    base = next(o for o in p.options() if o.family == "baseline")
    assert base.extension_days == 0              # the earlier gap is already caught up


def test_plan_change_sets_current_dose_and_count():
    # after a 3-day gap the rest of the course was changed to 17 x 2.2 Gy from Thursday of week 4
    gap = {"missed_dates": [day(21).isoformat(), day(22).isoformat(), day(23).isoformat()],
           "plan_change": {"from": day(24).isoformat(), "n_fractions": 17, "dose_per_fraction": 2.2},
           "resume_date": day(31).isoformat()}
    p = case(gap)
    assert p.s0 == pytest.approx(1.1)
    after = [f for f in p.delivered if f.date >= day(24)]
    assert len(after) == 5 and all(f.dose == pytest.approx(2.2) for f in after)
    assert p.remaining == 17 - 5
    base = next(o for o in p.options() if o.family == "baseline")
    assert base.dose_per_fraction == pytest.approx(2.2) and base.scale == pytest.approx(1.1)
    dec = decide(p)
    assert all("change of dose per fraction" not in w for o in dec.feasible + dec.rejected
               if o.family == "baseline" for w in o.rejected)


def test_generalised_joiner_equals_textbook_formula():
    # 30 x 2 Gy planned; the first 10 fractions were given at 3 Gy (BCR eq. 9.3-9.4)
    rx = Prescription(MON, 30, 2.0)
    errs = [(f.date, 0, 3.0) for f in rx.planned_fractions()[:10]]
    p = GapPlanner(rx, Tissue("T", 10), [Tissue("Late", 3)], dose_errors=errs, resume_date=rx.planned_fractions()[10].date)
    L, Q = p.joiner_target()
    ref = joiner_correction(60, 2, 30, 3)
    assert L == pytest.approx(ref.compensating_total) and Q / L == pytest.approx(ref.compensating_dpf)


def test_single_overdose_is_corrected_with_joiner():
    p = case({"dose_errors": [{"date": day(11).isoformat(), "dose": 3.0}]})
    assert p.resume == day(12) and p.has_dose_error
    dec = decide(p)
    assert dec.status == "recommended" and dec.recommended.family == "error"
    o = dec.recommended
    assert o.extension_days <= 0 and o.n_weekend_fractions == 0 and o.n_bid_days == 0
    # every tissue close to the intended dose (only the rounding of n remains)
    assert abs(o.tumour.delta) < 0.3 and all(abs(r.delta) < 0.4 for r in o.oars)
    base = next(x for x in dec.feasible if x.family == "baseline")
    assert any("not corrected" in w for w in base.warnings)


def test_dose_error_with_dose_change_forbidden_is_a_clinical_decision():
    p = case({"dose_errors": [{"date": day(11).isoformat(), "dose": 1.0}]}, constraints={"allow_dose_change": False})
    dec = decide(p)
    assert dec.status == "clinical_decision"


def test_history_input_errors():
    with pytest.raises(ValidationError):
        case({"dose_errors": [{"date": day(5).isoformat(), "dose": 1.0}]})          # Saturday: nothing delivered
    with pytest.raises(ValidationError):
        case({"dose_errors": [{"date": day(4).isoformat(), "dose": 0.0}]})          # 0 Gy: that is a missed day
    with pytest.raises(ValidationError):
        case({"missed_dates": [day(9).isoformat()], "extra_delivered": [day(9).isoformat()]})


def test_history_example_file_and_report(tmp_path, capsys):
    from rtgap.cli import main
    from rtgap.report import text_report
    from rtgap.config import load_file
    p, _ = planner_from_dict(load_file("examples/hn_history.yaml"))
    assert len(p.interruptions) == 2 and p.has_dose_error and p.extra_dates
    dec = decide(p)
    assert dec.status == "recommended" and dec.recommended.family == "error"
    txt = text_report(p, dec)
    assert "History      : 2 interruptions" in txt and "dose errors: 2026-10-30 2.6 Gy" in txt
    assert main(["plan", "examples/hn_history.yaml", "--html", str(tmp_path / "r.html")]) == 0
    assert "History" in (tmp_path / "r.html").read_text(encoding="utf-8")
