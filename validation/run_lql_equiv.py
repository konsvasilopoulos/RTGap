"""Print external BED and EQD2 results using the upstream LQL-Equiv-web checkout."""
import json
from lqlequiv import Course, Prescription, Tissue, __version__, compute

# (benchmark row, fractions, dose per fraction, alpha/beta, RTGap elapsed days)
schedules = [
    (10, 35, 2, 10, 46), (11, 30, 2, 10, 39), (12, 25, 1.8, 10, 32),
    (13, 33, 2.12, 10, 44), (14, 20, 2.75, 10, 25),
    (15, 1, 24, 10, None), (16, 1, 34, 10, None), (17, 5, 7, 3, None),
    (18, 5, 11, 3, None), (19, 3, 18, 3, None), (20, 1, 24, 3, None),
]
rows = {}
for row, n, d, ab, elapsed in schedules:
    # The external calendar counts the first day as day 1. Match elapsed days
    # after kick-off with RTGap's day-0 origin.
    tissue = Tissue(index=0, name="benchmark", name_fr="", alpha_beta=ab, alpha=0,
                    Tk=29, Tp=0, dt=2 * ab, T_half=0,
                    dprol_override=0.9 if elapsed is not None else 0)
    result = compute(tissue, tissue, Prescription((Course(d, n),)))
    course = result.courses[0]
    assert not result.saturated and result.tumour_total_valid
    if elapsed is not None:
        assert course.overall_days_tumour == elapsed + 1
    rows[row] = {"bed": round(course.bed_tumour, 9), "eqd2": round(course.eqd_tumour, 9)}

print(json.dumps({"software": "LQL-Equiv-web", "version": __version__, "rows": rows},
                 indent=2))
