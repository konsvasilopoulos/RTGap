"""Replay published MR-linac target doses and two explicitly reconstructed calendars.

Run from the repository root: python -m validation.replay_mrlinac
Rojas-López et al., Tables 1–2, doi:10.4103/jmp.jmp_165_25.
"""
from datetime import date, timedelta

from rtgap.config import planner_from_dict
from rtgap.decide import decide
from rtgap.schedule import Fraction
from rtgap.tissues import Tissue

# Planned n, d; delivered before interruption; new n, d; planned/actual
# elapsed days; tumour alpha/beta, K (BED/day), kick-off day.
CASES = [
    (31, 1.8, 4, 23, 2.07, 42, 56, 2.1, 0.5, 37),
    (20, 2.0, 8, 7, 3.28, 27, 36, 3.0, 0.9, 28),
    (44, 1.8, 34, 5, 3.12, 61, 77, 3.0, 0.52, 31),
]


def target_bed(doses, elapsed, tissue):
    # For one fraction per day, complete repair and one dose level only the
    # endpoints affect the time term. Intermediate dates are placeholders.
    first = date(2024, 1, 1)
    fractions = [Fraction(first + timedelta(days=i * elapsed // (len(doses) - 1)), dose=d)
                 for i, d in enumerate(doses)]
    return tissue.bed(fractions)


def replay_calendar(case_index, accelerated):
    n, d, delivered, _, _, _, _, ab, k, tk = CASES[case_index]
    start = date(2024, 7, 15 if case_index == 0 else 11)
    outage, resume = date(2024, 7, 22), date(2024, 8, 8)
    days = [start + timedelta(days=i) for i in range((outage - start).days)]
    given = [x for x in days if x.weekday() < 5]
    if case_index == 1:
        # Eight reported sessions before failure, only seven calendar weekdays.
        given.append(date(2024, 7, 13))
    given = sorted(given)[:delivered]
    assert len(given) == delivered
    cfg = dict(category=2, prescription=dict(start=start, n_fractions=n, dose_per_fraction=d),
               tumour=dict(alpha_beta=ab, k_bed_per_day=k, kickoff_days=tk),
               oars=[dict(name="Illustrative reference OAR", alpha_beta=(2.1, 2.0)[case_index],
                          dose_ratio=1, repair_half_time_h=None)],
               gap=dict(outage_start=outage, resume_date=resume, cause="machine",
                        delivered=[dict(date=x, dose=d) for x in given]),
               constraints=dict(allow_saturday=accelerated, allow_sunday=accelerated,
                                allow_bid=accelerated, max_dose_per_fraction=3.3 if case_index == 1 else None))
    planner, _ = planner_from_dict(cfg)
    decision = decide(planner)
    print(f"Patient {case_index + 1}, weekends/BID {accelerated}: {decision.status}")
    if decision.recommended:
        r = decision.recommended
        print(f"  {r.key}: {r.n_new} × {r.dose_per_fraction:.2f} Gy, end {r.end_date}")
    else:
        print("  No automatically selected schedule. Candidates:")
        for option in decision.candidates:
            print(f"  {option.key}: {option.n_new} × {option.dose_per_fraction:.2f} Gy")
    return decision


if __name__ == "__main__":
    for i, (n, d, given, new_n, new_d, planned, actual, ab, k, tk) in enumerate(CASES, 1):
        tissue = Tissue.tumour("Published target", ab, k_bed=k, kickoff_days=tk)
        original = target_bed([d] * n, planned, tissue)
        revised = target_bed([d] * given + [new_d] * new_n, actual, tissue)
        print(f"Patient {i}, target BED: {original:.2f} -> {revised:.2f} (delta {revised-original:+.2f})")
    # O’Shea et al., Galway patient B. Point dose, unchanged fractions.
    larynx = Tissue.tumour("Larynx", 10, k_bed=0.9, kickoff_days=28)
    delta = target_bed([2] * 35, 62, larynx) - target_bed([2] * 35, 50, larynx)
    print(f"Galway B, time-only change in EQD2: {2 * delta / larynx.bed_fraction(2):+.2f} Gy")
    for case in (0, 1):
        for accelerate in (False, True):
            replay_calendar(case, accelerate)
