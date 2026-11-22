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
See [benchmark.md](benchmark.md) for the completed RadComp and LQL-Equiv-web comparisons, inputs, output definitions, and reproduction commands. Use `rtgap benchmark` for a fresh table of RTGap reference values.
