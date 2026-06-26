# Real flight-log fixtures

A small set of real, publicly-shared flight files used to regression-test the
parsers and analysis against known-good numbers (`../real-files.test.ts`). These
are trimmed/downsampled from much larger originals — enough to exercise the real
column layouts and produce the right headline numbers, without committing tens of
megabytes. Original sources below.

| File | Device / format | Source | Ground truth |
|---|---|---|---|
| `altusmetrum-telemetrum.csv` | Altus Metrum TeleMetrum (AltOS CSV; single `speed` column + GPS) | ISSUIUC `flight-data` `20211030/` | apogee ≈ 9,322 ft |
| `perfectflite-stratologger.csv` | PerfectFlite StratoLogger CSV (`time_s,altitude_ft,…`) | ISSUIUC `flight-data` `20211030/` | reads via the generic column mapper |
| `perfectflite-pnut.pf2` | PerfectFlite Pnut native `.pf2` | HMC AdvRoc FlightData (Top_Shot) | file states **apogee 1009 ft AGL** |
| `featherweight-raven-fip.csv` | Featherweight Raven, FIP export (`Time@x,x,bILBA`); downsampled ×5 | HMC AdvRoc FlightData (Top_Shot) | same flight as the Pnut → ≈ 1,009 ft |
| `blueraven-app-lr.csv` | Featherweight Blue Raven phone-app low-rate CSV; downsampled ×2 | RocketryForum (kjh, C40511-h180) | see `blueraven-app.summary.csv` |
| `blueraven-app.summary.csv` | Blue Raven flight summary for the LR file above | RocketryForum (kjh) | apogee 4,034.98 ft, max V 700.36 ft/s, drogue −45.7, main −23.5 ft/s |

The Pnut `.pf2` and the Raven FIP CSV are the **same physical flight** recorded by
two altimeters, so they cross-check each other (~1,009 ft).

The full corpus these came from (many more flights, high-rate files, plots) was
used during development but is intentionally not committed — it was ~260 MB.
