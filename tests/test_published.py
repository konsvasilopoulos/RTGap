"""Published time factors in the site library: complete, sourced and never the default."""
import pathlib, yaml

SITES = yaml.safe_load((pathlib.Path(__file__).parent.parent / "rtgap/data/sites.yaml").read_text("utf-8"))["sites"]


def test_entries_are_complete():
    n = 0
    for sid, site in SITES.items():
        for o in site.get("published_time_factors", []):
            n += 1
            assert o["source"] and o["scope"], sid
            assert o["kickoff_days"] >= 0, sid
            if "dprolif_eqd2_per_day" in o:
                assert 0 < o["dprolif_eqd2_per_day"] < 2, sid
            if "ci" in o:
                lo, hi = o["ci"]
                assert lo < o["dprolif_eqd2_per_day"] < hi, sid
            if "kickoff_ci" in o:
                lo, hi = o["kickoff_ci"]
                assert lo <= o["kickoff_days"] <= hi, sid
    assert n >= 8


def test_default_of_category_one_stays_the_rcr_generic_value():
    t = SITES["hn_scc"]["tumour"]
    assert t["k_bed_per_day"] == 0.9 and t["kickoff_days"] == 28 and t["alpha_beta"] == 10
