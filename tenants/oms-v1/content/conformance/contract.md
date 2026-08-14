# WCAH Scheduler Conformance Contract

## 1. Purpose and files

This contract defines the language-neutral boundary between the frozen workbook
oracle and a candidate scheduling engine. A conforming runner must turn the
committed fixtures and the candidate engine's output into the canonical
schedule and coverage projections, compare those projections, and serialize the
result exactly as specified below.

The Aug 2 fixture set lives in `conformance/aug02/`:

- `input.json` is the normalized input for the week beginning 2026-08-02. It is
  committed.
- `seed.json` is the committed candidate-side roster: a snapshot of the OMS
  nested document (schema 4) as it stood before the V5 workbook import. It is
  the *candidate's* starting state, not oracle data — `input.json` is injected
  into its `2026-08-02` week and the engine runs from the result. It is
  committed and **must not be regenerated from the live application seed**:
  `expected.json` is a pre-V5 transcription, so following the live seed forward
  compares two generations of clinic ground truth rather than measuring the
  engine (added 2026-08-07; the V5 import moved 51 divergences this way).
  Whether the live seed still matches the clinic is a separate question with a
  separate test. A later fixture directory transcribed from a V5-era week
  carries its own `seed.json`.
- `expected.json` is the canonical workbook transcription. It is committed and
  is the oracle for a language-neutral runner. It must never be generated from
  either scheduling engine or changed to make a test pass.
- `annotations.json` identifies known divergences that carry a standing
  verdict: `inexpressible` (the candidate model cannot express the workbook
  behavior) and `intended` (the candidate is deliberately correct and the
  workbook week reflects superseded rules; the reason names the evidence).
  It is committed.
- `baseline.json` is the committed, deliberately reviewed snapshot of the
  complete report once the baseline ratchet is installed.
- `report.json` is generated output. It is not committed and must be ignored by
  version control.

The fixture set, `baseline.json`, report-writing CLI, and baseline ratchet test
are all landed. Sections 8 and 9 define the baseline discipline and porting
requirements.

`expected.json` has this top-level shape:

```json
{
  "grid": {
    "<employeeId>": {
      "Sun": "<rendered cell>",
      "Mon": "<rendered cell>",
      "Tue": "<rendered cell>",
      "Wed": "<rendered cell>",
      "Thu": "<rendered cell>",
      "Fri": "<rendered cell>",
      "Sat": "<rendered cell>"
    }
  },
  "coverage": {
    "<day>": {
      "<coverage role>": {
        "scheduled": 0,
        "target": 0,
        "status": "ON TARGET"
      }
    }
  }
}
```

The canonical oracle schedule is `expected.json.grid`; the report calls this
projection `oracle`. The different field names are intentional.

## 2. Canonical orders

Day order is:

1. `Sun`
2. `Mon`
3. `Tue`
4. `Wed`
5. `Thu`
6. `Fri`
7. `Sat`

Coverage role order is:

1. `VA`
2. `RVT`
3. `HSS`
4. `PHARM`
5. `ADMIN`

These orders control traversal, object insertion order, divergence ordering, and
therefore serialized bytes. Employee IDs are ordered by ascending Unicode code
unit string order, equivalent to JavaScript's default `Array.prototype.sort()`
for these ASCII fixture IDs.

## 3. `input.json`

`input.json` is an object with exactly these fields:

- `weekStart`: an ISO `YYYY-MM-DD` date string naming a Sunday.
- `dvmCounts`: an object with all seven day keys and integer DVM counts.
- `departmentsEnabled`: an object with all seven day keys. Each value is an
  ordered array of department codes known to the candidate engine's seed.
- `overrides`: an object keyed by employee ID, then by day. A value is either
  the string `OFF` or an object with:
  - `role`: a required OMS role code;
  - `hours`: an optional number;
  - `label`: an optional string;
  - `timeNote`: an optional string.
- `requests`: an array of normalized Time-Off Input rows. Every row has:
  - `id`: request ID;
  - `staffId`: employee ID;
  - `submittedAt`: source timestamp string, preserved verbatim;
  - `status`: one of `Approved`, `Pending`, or `Denied`;
  - `decision`: `granted`, `denied`, or `null`;
  - `startDate`: ISO `YYYY-MM-DD` date;
  - `hours`: total hours across the request's days; `0` means unpaid time off;
  - `days`: positive integer duration in calendar days.

A request applies if and only if:

```text
status != "Denied" AND (status == "Approved" OR decision == "granted")
```

An applied request is supplied to the candidate engine as approved. Every other
request is supplied as pending and is inert to the schedule grid. Its inclusive
end date is `startDate + (days - 1)` calendar days.

The landed Aug 2 adapter injects `dvmCounts`, `overrides`,
`departmentsEnabled`, and `requests` into a fresh seed document. It synchronizes
each count into both `week.dvmCounts` and the corresponding
`week.dayPlans[day].dvmCount`, matching the OMS document's two stored views.
Each enabled department is assigned weight `80`. It selects the schedule week
by `weekStart`.

Only non-synthetic employees are projected. The oracle's employee IDs define
the comparison set; each must have all seven day keys in both projections.

## 4. Schedule projection and cell rendering

The candidate engine output consumed by this projection is an assignment array.
Each relevant assignment has:

- `employeeId`: employee ID;
- `day`: one canonical day;
- `roleCode`: an OMS role or pseudo-code;
- `paidHours`: a number or null;
- optional `label`: string;
- optional `timeNote`: string.

When multiple assignments share the same `(employeeId, day)` pair, the last
matching assignment in the assignments array wins. A conforming port must
retain that last assignment exactly; rejecting duplicates is not conforming.

For each non-synthetic employee and each canonical day, select the candidate
assignment by the exact `(employeeId, day)` pair. No assignment renders as the
empty string.

Translate assignment role codes as follows:

| OMS role code | Workbook role |
| --- | --- |
| `ROOM_TECH` | `VA` |
| `SURGERY_TECH` | `RVT` |
| `DENTAL_TECH` | `RVT` |
| `DENTAL_MONITOR` | `MONITOR` |
| `HSS` | `HSS` |
| `PHARM` | `PHARM` |
| `ADMIN` | `ADMIN` |
| `TECH_NC` | `TECH_NC` |

The `SURGERY_TECH` and `DENTAL_TECH` mapping is deliberately non-injective
because the workbook has one `RVT` line. Any other ordinary role code is an
error; it must never become a blank or pass through silently.

The three pseudo-codes render as follows:

| Pseudo-code | Rendered cell |
| --- | --- |
| `PTO` | `PTO` |
| `UNPAID_OFF` | `UNPAID OFF` |
| `OFF` | empty string |

For an ordinary role, render with this exact precedence:

1. Translate the role code using the table.
2. If `label` is a non-empty string, use it verbatim as the base text.
3. Otherwise, if `timeNote` is a non-empty string, use
   `"<workbook role> (<timeNote>)"`.
4. Otherwise use the workbook role.
5. If an oracle cell has `earlyLeave: true`, append the exact suffix
   `" · EARLY LEAVE"` to the selected base text. The current candidate
   assignment projection has no `earlyLeave` field, which is why the affected
   fixture cell is annotated as inexpressible.

Thus a label takes precedence over a time note rather than combining with it.
Assignment hours do not appear in rendered text. Missing or null paid hours
default to 10 internally, but this default has no effect on rendering.

Examples: `ROOM_TECH` becomes `VA`; `SURGERY_TECH` with `timeNote: "9a"`
becomes `RVT (9a)`; a non-empty `label: "VA (until 5 PM)"` remains exactly
`VA (until 5 PM)`.

## 5. Coverage projection

The candidate engine output consumed by this projection is a coverage row
array. Every relevant row has `day`, `roleCode`, numeric `scheduled`, and
numeric `target` fields.

Every day has exactly the five canonical coverage roles in canonical role
order. Each record has keys in this order:

```json
{
  "scheduled": 0,
  "target": 0,
  "status": "ON TARGET"
}
```

For `VA`, `RVT`, `HSS`, and `PHARM`, initialize `scheduled` and `target` to
zero, then fold candidate coverage rows using:

| Candidate coverage role | Canonical coverage role |
| --- | --- |
| `ROOM_TECH` | `VA` |
| `SURGERY_TECH` | `RVT` |
| `DENTAL_TECH` | `RVT` |
| `HSS` | `HSS` |
| `PHARM` | `PHARM` |

For every folded row, add both its `scheduled` and `target` values to the
canonical record. Coverage rows with any other role code are ignored. In
particular, `DENTAL_MONITOR`, `TECH_NC`, and `ADMIN` coverage rows do not enter
these four target-bearing records.

`ADMIN` is scheduled-only. Count candidate assignments whose day matches and
whose role code is exactly `ADMIN`; do not derive this count from candidate
coverage rows. Its record is always:

```json
{
  "scheduled": "<number of ADMIN assignments on that day>",
  "target": null,
  "status": null
}
```

For every non-ADMIN record, let `variance = scheduled - target` and render:

- negative: `SHORT n`, where `n` is the absolute value;
- positive: `OVER +n`;
- zero: `ON TARGET`.

An engine-internal status of `OK` therefore becomes `ON TARGET`; canonical
status is always recomputed from the canonical scheduled and target values.

## 6. `annotations.json` and divergence records

`annotations.json` has this shape:

```json
{
  "inexpressible": {
    "schedule": [
      { "employeeId": "<id>", "day": "<day>", "reason": "<non-empty text>" }
    ],
    "coverage": [
      { "day": "<day>", "role": "<coverage role>", "reason": "<non-empty text>" }
    ]
  },
  "intended": {
    "schedule": [
      { "employeeId": "<id>", "day": "<day>", "reason": "<non-empty text>" }
    ],
    "coverage": [
      { "day": "<day>", "role": "<coverage role>", "reason": "<non-empty text>" }
    ]
  }
}
```

A conforming runner must implement both categories. Precedence: agreement
between oracle and candidate suppresses any annotation; `inexpressible` wins
over `intended` when the same cell carries both. An `intended` entry's
`reason` must cite evidence (e.g. the commit or rulebook decision that
superseded the workbook), not merely assert intent. Summaries count
`intended` as its own category beside `mismatch`, `missing`, `extra`, and
`inexpressible`.

Annotations affect category and reason only. They do not create a divergence:
if the oracle and candidate values agree, the annotation is ignored. If
duplicate annotation keys exist, the last entry in its array wins.

A schedule divergence record has keys in this exact order:

```json
{
  "employeeId": "<id>",
  "day": "<day>",
  "oracle": "<rendered oracle cell>",
  "oms": "<rendered candidate cell>",
  "category": "<category>",
  "reason": "<annotation reason, present only when annotated>"
}
```

Compare rendered strings with exact, case-sensitive equality. Unequal schedule
cells are categorized with this precedence:

1. `inexpressible` if an inexpressible annotation exists for
   `(employeeId, day)`;
2. `intended` if an intended annotation exists for `(employeeId, day)`;
3. `missing` if oracle is non-empty and candidate is empty;
4. `extra` if oracle is empty and candidate is non-empty;
5. `mismatch` otherwise.

Schedule records are sorted by `(employeeId ascending, canonical day order)`.
The landed algorithm iterates employee IDs from the oracle only; a
candidate-only employee is outside this contract rather than an `extra`
divergence.

A coverage divergence record has keys in this exact order:

```json
{
  "day": "<day>",
  "role": "<coverage role>",
  "oracle": { "scheduled": 0, "target": 0, "status": "ON TARGET" },
  "oms": { "scheduled": 0, "target": 0, "status": "ON TARGET" },
  "category": "<category>",
  "reason": "<annotation reason, present only when annotated>"
}
```

A coverage record agrees only when `scheduled`, `target`, and `status` all
agree using exact equality. An unequal record with an inexpressible annotation
is `inexpressible`; otherwise an intended annotation makes it `intended`;
every other unequal coverage record is `mismatch`. Coverage does not use
`missing` or `extra`. Coverage divergences are sorted by `(canonical day order,
canonical coverage role order)`.

## 7. Report object and deterministic serialization

Build the report with keys and nested keys inserted in this exact order:

```json
{
  "week": "2026-08-02",
  "summary": {
    "schedule": {
      "mismatch": 0,
      "missing": 0,
      "extra": 0,
      "inexpressible": 0,
      "intended": 0
    },
    "coverage": {
      "mismatch": 0,
      "missing": 0,
      "extra": 0,
      "inexpressible": 0,
      "intended": 0
    }
  },
  "schedule": [],
  "coverage": []
}
```

`week` is `input.json.weekStart`. Each summary value is the number of records
of that category in the corresponding divergence array. Coverage's `missing`
and `extra` counts remain zero because coverage emits only `mismatch` and
annotated verdict categories.

The report contains no timestamp, generated-at value, run ID, random value, or
environment-dependent path. Two runs over equal inputs and equal candidate
output must serialize to identical bytes.

Serialization is UTF-8 JSON equivalent to `JSON.stringify(report, null, 2)`:

- two ASCII spaces per indentation level;
- object members in the insertion order specified by this contract;
- arrays in the deterministic orders specified above;
- JSON punctuation and escaping;
- non-ASCII characters emitted directly as UTF-8 rather than `\u` escapes
  (Python `json.dumps` therefore requires `ensure_ascii=False`);
- `/` is not escaped;
- no insignificant trailing spaces;
- exactly one LF byte (`\n`, U+000A) after the closing brace.

Do not sort object keys globally: doing so would change the required bytes.

## 8. Baseline discipline

Once the baseline ratchet is installed, the newly built report object must
deeply equal the parsed committed `baseline.json`. Any difference fails:

- a new divergence;
- a changed divergence;
- a fixed or removed divergence;
- a changed category, reason, summary, or order.

The runner always writes the generated bytes to `report.json`. Baseline updates
must occur only through an explicit update mode that writes those same bytes to
`baseline.json` and tells the operator that this is a deliberate ratchet move.
The baseline diff must be reviewed. Tests and ordinary runner execution must
never update it implicitly.

## 9. Porting checklist

A replacement runner conforms only if all of the following hold:

1. It treats `expected.json.grid` and `expected.json.coverage` as the workbook
   oracle, without regenerating them from the candidate engine.
2. It builds the candidate's starting document from the committed `seed.json`,
   not from its own application seed, and injects `input.json` into that
   document's `2026-08-02` week.
3. It projects a fresh candidate run using the role translation, pseudo-code,
   rendering, time-off, coverage-folding, and ADMIN rules above.
4. It compares only the canonical schedule matrix and coverage records.
5. It applies annotation precedence only after detecting inequality.
6. It emits record fields, summary fields, arrays, and object members in the
   specified order.
7. Its serialized `report.json` is byte-for-byte identical to the reference
   report, including the final newline.
