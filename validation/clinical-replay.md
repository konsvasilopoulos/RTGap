# Retrospective comparison with delivered MR-linac schedules

Rojas-López and Martínez-Ortiz report four patients affected by a machine failure beginning 22 July 2024. Treatment resumed on 8 August. All four were classified as category 2 and opted to wait for the machine. Tables 1 and 2 give the delivered doses and tumour parameters. The centre reoptimised each plan and reviewed dose distributions before approval. [Original publication](https://pmc.ncbi.nlm.nih.gov/articles/PMC12561238/)

## Target-dose replay

RTGap used the authors’ tumour parameters, the reported elapsed durations, one fraction per treatment day and plain LQ. The calculation includes the fractions delivered before interruption. ΔBED is revised minus prescribed BED for the same tumour. A zero difference would indicate an exact match of this modelled quantity.

| Patient | Original schedule | Fractions before gap | Delivered after gap | α/β (Gy), K (BED Gy/day), Tₖ (days) | Planned / actual days | Planned / revised BED (Gy) | ΔBED (Gy) |
|---|---|---:|---|---|---|---|---:|
| 1 · Paediatric astrocytoma | 31 × 1.8 Gy | 4 | 23 × 2.07 Gy | 2.1, 0.50, 37 | 42 / 56 | 101.13 / 98.41 | −2.72 |
| 2 · Seminoma | 20 × 2 Gy | 8 | 7 × 3.28 Gy | 3, 0.90, 28 | 27 / 36 | 66.67 / 67.53 | +0.86 |
| 3 · Prostate | 44 × 1.8 Gy | 34 | 5 × 3.12 Gy | 3, 0.52, 31 | 61 / 77 | 111.12 / 105.82 | −5.30 |

Patient 3 is a prescription-point comparison at the prostate dose level. Patient 4 changed to an SIB. The paper gives 11 × 3.28 Gy but the complete phase and target-level history would be needed for an equivalent multi-level replay. The reported dates and elapsed durations in Table 1 also disagree for several rows. The dose checks use the elapsed durations printed in that table. These checks do not reconstruct target coverage or normal-tissue DVHs.

## What RTGap selects

The automatic selector was run without entering the clinical team's final schedule. The weekday scenario permits dose changes and extra fractions. No automatic tumour-deficit or late-tissue-increase tolerance is supplied, since the centre gives no such numerical policy. A second scenario permits Saturday, Sunday and BID with the standard 6-hour interval. Availability of these measures in the original centre is unknown.

| Patient | Weekday-only scenario | With weekends and BID available | Clinical decision |
|---|---|---|---|
| 1 | Clinical review. Candidates include 13 × 2.91 Gy and 31 × 1.80 Gy. | RTGap selects 27 × 1.80 Gy using 13 BID days, ending 27 August. | 23 × 2.07 Gy. The authors report limiting the increase in fraction size because of the patient's age. |
| 2 | Clinical review. Candidates include 12 × 2.45 Gy and 20 × 2 Gy. | Clinical review. Candidates include 12 × 2.40 Gy with Saturdays and 20 × 2 Gy. | 7 × 3.28 Gy. The centre imposed a 3.3 Gy fraction ceiling for patients 2 and 3 and reviewed the replanned dose distributions. |

Calendar assumptions for the selector are distinct from the reported-duration calculation above. For patient 1 the first four weekday slots from 15 July were used. For patient 2, seven weekdays precede the outage after the reported 11 July start. The eighth fraction was placed on Saturday 13 July as a reconstruction. A weekday prescription from that start ends 7 August, consistent with the reported 27 days; the printed September end date conflicts with that duration. Intermediate dates of delivery were unavailable. The illustrative OAR uses the published α/β at the prescription point, complete repair and no time correction. This simplified OAR cannot reproduce the individual TPS constraints or support a clinical judgment about BID. No autonomous decision is claimed for patients 3 and 4.

The delivered schedules and the RTGap selections are different comparisons. Numerical proximity of the target BED does not demonstrate that the selected schedule, acute toxicity or OAR doses agree.

## Previously identified case series

In Galway case B, prolonging the same larynx schedule (35 × 2 Gy) from 50 to 62 days gives −9.0 Gy time-corrected EQD2 at the prescription point in RTGap, matching the published change. This is a check of the time penalty. The alternative plans evaluated in that paper do not establish which plan was delivered for this comparison. [O’Shea et al., 2022](https://doi.org/10.1002/acm2.13716)

The Wuhan series documents eight added fractions after a 130-day interruption in an adjuvant rectal case. The reported information does not identify the complete individual prescription, delivered history and organ doses needed for a decision replay. [Published Wuhan series, 2021](https://doi.org/10.3389/fonc.2021.754838)

Reproduce from the repository root with `python -m validation.replay_mrlinac`.
