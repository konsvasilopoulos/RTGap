"""LQ-L option: linear above the transition dose d_T = factor × α/β (Astrahan 2008)."""
import datetime as dt

import pytest

from rtgap import lq
from rtgap.config import planner_from_dict
from rtgap.decide import decide
from rtgap.schedule import Fraction
from rtgap.tissues import Tissue
from rtgap.validation import ValidationError

MON = dt.date(2026, 10, 5)


def test_quad_term_is_continuous_with_continuous_slope():
    assert lq.quad_term(3.0, 6.0) == 9.0 and lq.quad_term(3.0) == 9.0
    assert lq.quad_term(6.0, 6.0) == pytest.approx(36.0)
    assert lq.quad_term(6.0 + 1e-6, 6.0) == pytest.approx(36.0, abs=1e-4)
    slope = (lq.quad_term(6.001, 6.0) - lq.quad_term(6.0, 6.0)) / 0.001
    assert slope == pytest.approx(12.0, abs=1e-6)            # d(d²)/dd at d_T


def test_bed_of_a_large_fraction():
    t = Tissue("Late", 3.0, lql_factor=2.0)                    # d_T = 6 Gy
    assert t.bed_fraction(2.0) == pytest.approx(2 * (1 + 2 / 3))
    # 10 Gy: 6(1 + 6/3) + (1 + 12/3)(10 - 6) = 18 + 20 = 38 ; plain LQ gives 43.33
    assert t.bed_fraction(10.0) == pytest.approx(38.0)
    fx = [Fraction(MON + dt.timedelta(days=i), 0, 10.0) for i in range(3)]
    assert t.bed_without_time(fx) == pytest.approx(114.0)
    assert Tissue("Late", 3.0).bed_without_time(fx) == pytest.approx(130.0)


def case(model=None, **kw):
    cfg = dict(site="prostate", prescription=dict(start=MON.isoformat(), n_fractions=7, dose_per_fraction=6.1),
               gap=dict(missed_dates=[(MON + dt.timedelta(days=2)).isoformat(), (MON + dt.timedelta(days=3)).isoformat()]),
               constraints=dict(allow_saturday=False, allow_sunday=False, allow_bid=False))
    if model:
        cfg["model"] = model
    cfg.update(kw)
    return planner_from_dict(cfg)[0]


def test_lq_is_unchanged_below_the_transition_dose():
    cfg = dict(site="hn_scc", prescription=dict(start=MON.isoformat(), n_fractions=35, dose_per_fraction=2.0),
               gap=dict(missed_dates=[(MON + dt.timedelta(days=30)).isoformat()]))
    a = decide(planner_from_dict(dict(cfg))[0]); b = decide(planner_from_dict(dict(cfg, model="lql"))[0])
    assert a.status == b.status
    for x, y in zip(a.feasible, b.feasible):
        assert x.key == y.key and x.tumour.eqd2 == pytest.approx(y.tumour.eqd2, abs=1e-9)
    assert b.trace[0].startswith("Model: LQ-L")


def test_solved_dose_reaches_the_target_with_lql():
    p = case("lql", lql_dt_factor=1.0)                         # d_T = α/β: the planned 6.1 Gy is above it for every tissue
    assert p.tumour.lql_factor == 1.0 and all(o.lql_factor == 1.0 for o in p.oars)
    opts = [o for o in p.options() if o.strategy == "match_tumour" and o.exact_dose]
    assert opts
    for o in opts:
        exact = p.evaluate("x", "x", "x", [f for f in o.new_fractions], o.exact_dose, "keep_d")
        assert exact.tumour.delta == pytest.approx(0.0, abs=1e-6)


def test_lql_gives_less_weight_to_large_fractions():
    lq_late = case().planned_oars[0]
    lql_late = case("lql", lql_dt_factor=1.0).planned_oars[0]
    assert lql_late < lq_late


def test_unknown_model_is_an_input_error():
    with pytest.raises(ValidationError):
        case("lqc")


@pytest.mark.parametrize("ab,factor", [(0.9, 2), (1.6, 1), (1, 2), (15, 2)])
def test_reference_fraction_uses_same_model_for_dose_and_time(ab, factor):
    cfg = dict(model="lql", lql_dt_factor=factor,
               prescription=dict(start=MON, n_fractions=3, dose_per_fraction=2),
               tumour=dict(alpha_beta=ab, k_bed_per_day=0.5, kickoff_days=1))
    planner, _ = planner_from_dict(cfg)
    tumour = planner.tumour
    fx = planner.planned
    one = tumour.bed_fraction(2)
    assert tumour.eqd2(fx[:1]) == pytest.approx(2)
    assert tumour.k_bed == pytest.approx(0.5)
    assert tumour.bed(fx) == pytest.approx(3 * one - 0.5)
    assert tumour.eqd2(fx) == pytest.approx(6 - 0.5 / (one / 2))
