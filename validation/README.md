# Validation

## Retrospective comparison with past decisions
Put one file per past interruption in `cases/` (YAML or the JSON saved by the web app). Enter the
schedule that was actually given as the first `custom_options` entry (in the web app: "Schedule
that was given"). Then:

    rtgap validate validation/cases --protocol my_department.yaml --csv validation/results.csv

Each row shows the tool's suggestion and the given schedule side by side: change in tumour EQD2,
late-tissue increase, peak 7-day dose, rule-of-thumb loss of local control, the rules the given
schedule breaks, and whether the two schedules are identical. Use anonymised data only.

## Comparison with independent software
`rtgap benchmark > validation/benchmark.md` writes reference BED and EQD2 values for standard
schedules, with empty columns for the values of another calculator (for example LQL-Equiv).
Agreement within rounding on every row is the acceptance criterion; file the completed table.
