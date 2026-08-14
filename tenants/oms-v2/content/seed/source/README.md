# Archived source

`WCAH_OMS_Seed_Workbook-V5.xlsx` is a frozen historical artifact (design decision D4).

It was converted **once** into `seed/wcah_seed.sql` by `tools/convert_workbook.py`. That
SQL file is the committed fixture and the only thing the application loads. Nothing in
`backend/app`, `frontend/src`, or any test reads this `.xlsx`. Only
`tools/convert_workbook.py` does, and it is not run in CI.

It is kept so the fixture's provenance is inspectable, not because anything depends on it.
Corrections to the data are made through the application (D5, D21), not by editing this
file and re-running the converter.
