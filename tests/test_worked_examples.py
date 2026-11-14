"""Validation against published worked examples.

* Joiner & van der Kogel (eds.), Basic Clinical Radiobiology, ch. 9
  (Bentzen & Joiner), Examples 4, 5 and 6.
* RCR, The timely delivery of radical radiotherapy: guidelines for the
  management of unscheduled treatment interruptions, 4th ed. (2019),
  Appendix B, Examples 3 and 4.
"""
import datetime as dt

import pytest

from rtgap import lq
from rtgap.error import joiner_correction
from rtgap.gap import Constraints, GapPlanner, Prescription
from rtgap.schedule import Fraction, daterange
from rtgap.tissues import Tissue

MONDAY = dt.date(2026, 1, 5)  # any Monday


def day(n: int) -> dt.date:
    return MONDAY + dt.timedelta(days=n)


# --------------------------------------------------------------------------- #
# Basic Clinical Radiobiology, ch. 9
def test_book_example4_time_correction():
    """66 Gy in 38 days ≡ 70.9 Gy in 45 days for HNSCC (D_prolif 0.7 Gy/day)."""
    eqd2_38 = lq.eqd2_time_corrected(33, 2, 10, 38, 0.7, kickoff=21)
    eqd2_45 = lq.eqd2_time_corrected(33, 2, 10, 45, 0.7, kickoff=21)
    assert eqd2_38 - eqd2_45 == pytest.approx(4.9, abs=1e-9)
    assert 66 + (eqd2_38 - eqd2_45) == pytest.approx(70.9, abs=0.05)


def test_book_example5_colorectal_5x5():
    """5 x 5 Gy Mon–Fri, Wednesday missed, two larger fractions Thu+Fri."""
    rx = Prescription(MONDAY, 5, 5.0)
    tumour = Tissue.tumour("Rectal ca", 10.0)
    bowel = Tissue("Bowel (late)", 4.0)
    fibrosis = Tissue("Fibrosis", 1.7)
    p = GapPlanner(rx, tumour, [bowel, fibrosis], missed_dates=[day(2)])
    assert p.planned_tumour == pytest.approx(31.25)          # 2x5 + 18.75 Gy
    slots = p.pattern_same_end()
    assert [s.date for s in slots] == [day(3), day(4)]
    d = p.solve_dose(slots, tumour, p.planned_tumour)
    assert d == pytest.approx(6.7, abs=0.05)                  # book: 6.7 Gy
    opt = p.evaluate("t", "t", "t", slots, 6.7, "custom")
    assert opt.oars[0].planned_eqd2 == pytest.approx(37.5)
    assert opt.oars[0].eqd2 == pytest.approx(38.9, abs=0.05)  # book: 38.9 Gy
    assert opt.oars[1].planned_eqd2 == pytest.approx(45.0, abs=0.3)
    assert opt.oars[1].eqd2 == pytest.approx(48.5, abs=0.1)   # book: 45 → 48.5 Gy
    # the automatic option set contains this solution
    keys = {o.key: o for o in p.options()}
    assert keys["same_end_tumour"].dose_per_fraction == pytest.approx(6.73, abs=0.01)


def test_book_example6_joiner_error():
    """35 x 2 Gy planned, first two fractions given as 4 Gy."""
    r = joiner_correction(70, 2, 8, 4)
    assert r.compensating_total == pytest.approx(62)
    assert r.compensating_dpf == pytest.approx(1.74, abs=0.005)
    assert r.n_exact == pytest.approx(35.6, abs=0.05)
    assert r.n_fractions == 36
    assert r.practical_dpf == pytest.approx(1.72)


def test_joiner_is_isoeffective_for_any_alpha_beta():
    r = joiner_correction(70, 2, 8, 4)
    for ab in (1, 3, 10, 20):
        planned = lq.bed(35, 2, ab)
        got = lq.bed(2, 4, ab) + lq.bed(r.n_exact, r.compensating_dpf, ab)
        assert got == pytest.approx(planned, rel=1e-9)


# --------------------------------------------------------------------------- #
# RCR 2019, Appendix B: 70 Gy / 35 fx / 46 days, K = 0.9 Gy10/day, Tdelay = 28 d
def rcr_setup(missed_weeks):
    rx = Prescription(MONDAY, 35, 2.0)
    tumour = Tissue.tumour("Tumour", 10.0, k_bed=0.9, kickoff_days=28)
    late = Tissue("Late (α/β=3)", 3.0)
    missed = [d for w in missed_weeks for d in daterange(day(7 * (w - 1)), day(7 * (w - 1) + 4))]
    return GapPlanner(rx, tumour, [late], missed_dates=missed, category=1), tumour, late


def test_rcr_reference_schedule():
    p, tumour, late = rcr_setup([])
    assert (p.planned_end - MONDAY).days == 46
    assert tumour.bed(p.planned) == pytest.approx(67.8, abs=0.05)
    assert late.bed(p.planned) == pytest.approx(116.7, abs=0.05)


def test_rcr_example3_lose_week7():
    p, tumour, late = rcr_setup([7])
    assert late.bed(p.delivered) == pytest.approx(100.0)
    # uncompensated 8th week: BED10 61.5
    base = p.pattern_standard(5)
    assert tumour.bed(p._course(base, 2.0)) == pytest.approx(61.5, abs=0.05)
    # weekend compensation finishing day 51 needs d = 2.62 Gy
    slots = p.pattern_accelerated(5, sat=True, sun=True, bid=False)
    assert (slots[-1].date - MONDAY).days == 51
    d = p.solve_dose(slots, tumour, p.planned_tumour)
    assert d == pytest.approx(2.62, abs=0.005)
    course = p._course(slots, 2.62)
    assert late.bed(course) / late.bed(p.planned) - 1 == pytest.approx(0.067, abs=0.002)
    assert late.eqd2(course) == pytest.approx(74.7, abs=0.05)
    # compromise 2.3 Gy: tumour BED 3.5 % low, late BED 3.1 % high
    course = p._course(slots, 2.3)
    assert 1 - tumour.bed(course) / tumour.bed(p.planned) == pytest.approx(0.035, abs=0.002)
    assert late.bed(course) / late.bed(p.planned) - 1 == pytest.approx(0.031, abs=0.002)


def test_rcr_example4_lose_weeks_6_and_7():
    p, tumour, late = rcr_setup([6, 7])
    assert len(p.delivered) == 25
    # (a) five fractions in week 8, iso-late: d = 3.22, tumour 13.2 % short
    wk8 = [Fraction(day(n)) for n in range(49, 54)]
    d = p.solve_dose(wk8, late, p.planned_oars[0])
    assert d == pytest.approx(3.22, abs=0.005)
    short = 1 - tumour.bed(p._course(wk8, d)) / tumour.bed(p.planned)
    assert short == pytest.approx(0.132, abs=0.002)
    # (b) seven fractions Sat–Fri, iso-late: d = 2.57, tumour BED 60.1
    sat_fri = [Fraction(day(n)) for n in range(47, 54)]
    d = p.solve_dose(sat_fri, late, p.planned_oars[0])
    assert d == pytest.approx(2.57, abs=0.005)
    assert tumour.bed(p._course(sat_fri, d)) == pytest.approx(60.1, abs=0.05)
    # (c) eleven fractions over 7 days (BID on 4), iso-late: d = 1.87, BED 61.9
    bid = sat_fri + [Fraction(day(n), 1) for n in (47, 49, 51, 53)]
    d = p.solve_dose(bid, late, p.planned_oars[0])
    assert d == pytest.approx(1.87, abs=0.005)
    assert tumour.bed(p._course(bid, d)) == pytest.approx(61.9, abs=0.05)
    # (d) extension to day 60, 10 fractions, match tumour: d = 2.85, BED3 138.9
    ext = p.pattern_standard(10)
    assert (ext[-1].date - MONDAY).days == 60
    d = p.solve_dose(ext, tumour, p.planned_tumour)
    assert d == pytest.approx(2.85, abs=0.005)
    assert late.bed(p._course(ext, d)) == pytest.approx(138.9, abs=0.1)
