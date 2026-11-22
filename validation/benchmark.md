# Benchmark against independent software

## RadComp (LQ, no time factor)
RadComp, web app at radcomp.streamlit.app (L. F. Paredes Ocampo), standard LQ mode.
Run on 2026-11-14 by entering total dose, number of fractions and α/β; values read from the page.

| # | Schedule | α/β (Gy) | rtgap BED | RadComp BED | rtgap EQD2 | RadComp EQD2 | Difference |
|---|---|---|---|---|---|---|---|
| 1 | 35 × 2 Gy | 3 | 116.67 | 116.67 | 70.00 | 70.00 | 0 |
| 2 | 20 × 2.75 Gy | 3 | 105.42 | 105.42 | 63.25 | 63.25 | 0 |
| 3 | 15 × 2.67 Gy | 3.5 | 70.60 | 70.60 | 44.93 | 44.93 | 0 |
| 4 | 20 × 3 Gy | 1.6 | 172.50 | 172.50 | 76.67 | 76.67 | 0 |
| 5 | 5 × 5 Gy | 10 | 37.50 | 37.50 | 31.25 | 31.25 | 0 |
| 6 | 5 × 5 Gy | 4 | 56.25 | 56.25 | 37.50 | 37.50 | 0 |
| 7 | 10 × 3 Gy | 10 | 39.00 | 39.00 | 32.50 | 32.50 | 0 |
| 8 | 40 × 2 Gy | 3 | 133.33 | 133.33 | 80.00 | 80.00 | 0 |
| 9 | 35 × 2 Gy | 10 | 84.00 | 84.00 | 70.00 | 70.00 | 0 |

All nine agree to the two decimals shown.

## LQL-Equiv-web v3.0.0, 22 November 2026

We ran the authors’ Python package in its default equation mode on the following single-course schedules, with a 2 Gy reference fraction and one fraction per treatment day. Raw external outputs are in [lql_equiv.json](lql_equiv.json). The RTGap validation page computes the paired values using the browser engine. Tolerance is an absolute difference ≤0.005 Gy on unrounded comparable quantities.

### Tumour repopulation

For rows 10–14, compare tumour **BED**. Use α/β = 10 Gy and K = 0.9 Gy BED/day. RTGap uses elapsed days from day zero with kick-off at 28. LQL-Equiv includes the first day, so its kick-off input is 29. This gives identical time after kick-off. RTGap EQD2 is corrected BED divided by 1.2. The external EQD2 solves for a reference course that itself incurs a proliferation penalty. We record both values and exclude their difference from the BED agreement test.

| # | Schedule | Elapsed days | RTGap BED | LQL-Equiv BED | RTGap EQD2 | LQL-Equiv EQD2 |
|---|---|---:|---:|---:|---:|---:|
| 10 | 35 × 2 Gy | 46 | 67.8 | 67.8 | 56.5 | 70 |
| 11 | 30 × 2 Gy | 39 | 62.1 | 62.1 | 51.75 | 60 |
| 12 | 25 × 1.8 Gy | 32 | 49.5 | 49.5 | 41.25 | 41.25 |
| 13 | 33 × 2.12 Gy | 44 | 70.39152 | 70.39152 | 58.6596 | 75.85536 |
| 14 | 20 × 2.75 Gy | 25 | 70.125 | 70.125 | 58.4375 | 75.5 |

### Large fractions

For rows 15–20, compare **BED and EQD2** with zero proliferation, transition dose twice α/β and linear-tail slope γ/α = 5. Each pair agreed within tolerance.

| # | Schedule | α/β (Gy) | Transition (Gy) | BED (both, Gy) | EQD2 (both, Gy) |
|---|---|---:|---:|---:|---:|
| 15 | 1 × 24 Gy | 10 | 20 | 80 | 66.6667 |
| 16 | 1 × 34 Gy | 10 | 20 | 130 | 108.3333 |
| 17 | 5 × 7 Gy | 3 | 6 | 115 | 69 |
| 18 | 5 × 11 Gy | 3 | 6 | 215 | 129 |
| 19 | 3 × 18 Gy | 3 | 6 | 234 | 140.4 |
| 20 | 1 × 24 Gy | 3 | 6 | 108 | 64.8 |

### Reproduce the external run

From the RTGap repository with Python 3.10 or newer:

```sh
git clone https://github.com/cyrilvoyant/LQL-Equiv-web.git /tmp/lql-equiv-web
git -C /tmp/lql-equiv-web checkout 877be0f428a1e6e88a8358878d4ee363d555c085
PYTHONPATH=/tmp/lql-equiv-web/src python validation/run_lql_equiv.py > /tmp/lql-results.json
diff validation/lql_equiv.json /tmp/lql-results.json
```

[Upstream implementation used](https://github.com/cyrilvoyant/LQL-Equiv-web/tree/877be0f428a1e6e88a8358878d4ee363d555c085).
