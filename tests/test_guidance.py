"""RCR edition switch: 2019 (4th edition, default) and the 5th edition draft."""
import datetime as dt

import pytest

from rtgap.config import planner_from_dict
from rtgap.decide import decide
from rtgap.validation import ValidationError

MON = dt.date(2026, 10, 5)


def day(n):
    return (MON + dt.timedelta(days=n)).isoformat()


def plan(site, n, d, missed, guidance=None, **c):
    cfg = dict(site=site, prescription=dict(start=MON.isoformat(), n_fractions=n, dose_per_fraction=d),
               gap=dict(missed_dates=missed), constraints=c)
    if guidance:
        cfg["guidance"] = guidance
    p, _ = planner_from_dict(cfg)
    return p, decide(p)


def test_default_is_2019_and_traced():
    p, dec = plan("hn_scc", 35, 2.0, [day(30)])
    assert p.rules.guidance == "rcr2019" and dec.trace[0].startswith("Guidance: RCR 2019")
    p, dec = plan("hn_scc", 35, 2.0, [day(30)], "rcr5_draft")
    assert "draft" in dec.trace[0]
    with pytest.raises(ValidationError):
        plan("hn_scc", 35, 2.0, [day(30)], "rcr6")


def test_one_week_breast_gets_no_dose_compensation_in_the_draft():
    missed = [day(2), day(3), day(4), day(7), day(8)]      # Wed-Fri, Mon-Tue: +7 d
    no_wkend = dict(allow_saturday=False, allow_sunday=False)
    p, dec = plan("breast", 5, 5.2, missed, **no_wkend)
    assert dec.status == "clinical_decision"                # 2019: beyond 5 d, a change of d is weighed
    p, dec = plan("breast", 5, 5.2, missed, "rcr5_draft", **no_wkend)
    assert p.rules.no_dose_compensation and p.rules.target_overall_time_days == 20
    assert dec.status == "no_action" and dec.recommended.family == "baseline"
    assert all(any("no extra dose" in w for w in o.rejected) for o in dec.rejected if o.family in ("same_end", "extended", "extra"))


def test_three_week_breast_overall_time_cap_in_the_draft():
    missed = [day(k) for k in (7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23)]   # weeks 2-4 almost gone
    p, dec = plan("breast", 15, 2.67, missed, "rcr5_draft")
    assert p.rules.max_overall_time_days == 34
    base = next(o for o in dec.feasible + dec.rejected if o.family == "baseline")
    assert base.overall_time > 34 and any("overall time" in w for w in base.rejected)
    p, dec = plan("breast", 15, 2.67, missed)
    base = next(o for o in dec.feasible + dec.rejected if o.family == "baseline")
    assert not any("overall time" in w for w in base.rejected)


def test_bid_on_chemotherapy_day_by_edition():
    missed = [day(30), day(31), day(32)]
    chemo = dict(allow_saturday=False, allow_sunday=False, chemo_dates=[day(35), day(36), day(37), day(38), day(39)], chemo_daily=True)
    _, dec19 = plan("hn_scc", 35, 1.4, missed, **chemo)
    _, dec5 = plan("hn_scc", 35, 1.4, missed, "rcr5_draft", **chemo)
    bid19 = next(o for o in dec19.feasible + dec19.rejected if o.key == "bid")
    bid5 = next(o for o in dec5.feasible + dec5.rejected if o.key == "bid")
    assert any("RCR 2019" in w for w in bid19.rejected)           # any concomitant chemotherapy
    assert not any("chemotherapy" in w for w in bid5.rejected)    # draft: daily chemo and d <= 1.5 Gy is allowed
    chemo["chemo_daily"] = False
    _, dec5 = plan("hn_scc", 35, 1.4, missed, "rcr5_draft", **chemo)
    bid5 = next(o for o in dec5.feasible + dec5.rejected if o.key == "bid")
    assert any("5th ed." in w for w in bid5.rejected)             # non-daily chemotherapy


def test_medulloblastoma_target_is_a_note():
    p, dec = plan("medulloblastoma", 30, 1.8, [day(k) for k in (28, 29, 30, 31, 32, 35)], "rcr5_draft", allow_saturday=False, allow_sunday=False, allow_bid=False)
    assert p.rules.target_overall_time_days == 44
    base = next(o for o in dec.feasible + dec.rejected if o.family == "baseline")
    assert any("aim" in w or "target" in w for w in base.warnings)


def test_sabr_resumes_on_non_consecutive_days():
    p, dec = plan("sabr", 5, 7.25, [day(2)])                    # daily course, Wednesday missed
    o = dec.recommended
    days = [f.date for f in p.delivered] + [f.date for f in o.new_fractions]
    assert all((b - a).days >= 2 for a, b in zip(days[1:], days[2:]))
    assert (o.new_fractions[0].date - p.delivered[-1].date).days >= 2
