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

All nine agree to the two decimals shown. RadComp has no repopulation term, so the
time-corrected schedules below still need another program.

## Pending: with repopulation (for LQL-Equiv or similar)
α/β = 10 Gy, K = 0.9 Gy BED/day (D_prolif 0.75 Gy EQD2/day), T_k = 28 d.
T = last minus first fraction day (RCR convention).

| # | Schedule | T (d) | rtgap BED | rtgap EQD2 | Other software | Difference |
|---|---|---|---|---|---|---|
| 10 | 35 × 2 Gy | 46 | 67.80 | 56.50 |  |  |
| 11 | 30 × 2 Gy | 39 | 62.10 | 51.75 |  |  |
| 12 | 25 × 1.8 Gy | 32 | 49.50 | 41.25 |  |  |
| 13 | 33 × 2.12 Gy | 44 | 70.39 | 58.66 |  |  |
| 14 | 20 × 2.75 Gy | 25 | 70.12 | 58.44 |  |  |

The repopulation term is also checked against the published worked examples of the RCR
(2019, Appendix B) and Basic Clinical Radiobiology (ch. 9) in the test suite and the built-in self-test.

## Pending: large fractions with LQ-L (for LQL-Equiv)
LQ-L (Astrahan 2008), transition dose d_T = 2 × α/β, no time factor. The rtgap values are shown,
calculated live, on the validation page of the web app (validation.html).

| # | Schedule | α/β (Gy) | d_T (Gy) |
|---|---|---|---|
| 15 | 1 × 24 Gy | 10 | 20 |
| 16 | 1 × 34 Gy | 10 | 20 |
| 17 | 5 × 7 Gy | 3 | 6 |
| 18 | 5 × 11 Gy | 3 | 6 |
| 19 | 3 × 18 Gy | 3 | 6 |
| 20 | 1 × 24 Gy | 3 | 6 |

Values read from LQL-Equiv go into `validation/lql_equiv.json` (EQD2 in Gy, keyed by row number);
the validation page then shows the comparison.
