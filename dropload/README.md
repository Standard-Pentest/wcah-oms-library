# dropload/ — Devlog Report Intake

New devlog reports for the [oms-new](https://github.com/TomWCAH/oms-new) repository are dropped
into this folder as markdown files named by reporting date:

```text
dropload/repo-status-YYYY-MM-DD.md
```

This folder is an inbox, not the published location. To publish a report:

1. Copy it into `tenants/devlog/content/`.
2. Register it at the **top** of the `Status Reports` section in `tenants/devlog/manifest.json`
   (newest first) with a one-line headline `summary`.
3. Add a row to the report index table in `tenants/devlog/content/welcome.md`.
4. Run `npm run build` and `npm run lint`.

Reports are never rewritten after publication — corrections land in a later report.
