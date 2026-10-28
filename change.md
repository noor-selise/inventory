# Changelog

All changes to this project will be documented in this file.

## [Unreleased]

- Reports export at once: removed Run in the background and the Background reports card; CSV and Print are disabled while a report updates, CSV cells that look like formulas are escaped, and the file opens in Excel with the right characters (by noor-selise, 2026-10-29)
- Fix History “As of” date field stretching in section headers (by noor-selise, 2026-10-29)
- Restyle opening stock rows: stacked on mobile, clearer labels, unit cost suffix (by noor-selise, 2026-10-28)
- Opening stock adjustments take a unit cost and set the product's average cost once; standard unit and unit ratios lock once a product has stock history. Products stocked through Adjustments before this keep an average cost of 0 until their next receipt (by noor-selise, 2026-10-28)
- Product dialog gets a Stock tab: on hand per location, where it sits, Adjust stock to a new total, and View history (by noor-selise, 2026-10-28)
- New stocked products can be saved with their opening stock per location, lot or serial (by noor-selise, 2026-10-28)
- Add TablePagination; paginate Team roster and payment balance tables (by noor-selise, 2026-10-27)
- Hide legacy @example.com users on Team; sync script revokes their org access (by noor-selise, 2026-10-27)
- Replace demo team with yopmail accounts; add sync-demo-team script and seed password env (by noor-selise, 2026-10-27)
- Fix nginx container: move pid to main config so non-root deploy health checks pass (by noor-selise, 2026-10-27)
- Payments mobile: scrollable tabs, balance cards to lg, touch targets, void on phone (by noor-selise, 2026-10-27)
- Refine payment balance table spacing: shrink-to-fit name/currency, aging group border, card header padding (by noor-selise, 2026-10-27)
- Tighten payment balance tables: grouped aging header, fixed columns, mobile cards; drop table header word-spacing (by noor-selise, 2026-10-27)
- Product standard, purchase, and sales units use dropdowns with a shared UOM catalog (by noor-selise, 2026-10-27)
- Clarify product size (cm), weight (kg), and purchase/sales unit conversions in the product form (by noor-selise, 2026-10-27)
- Fix fixed-asset product picker: resilient load, refresh on dialog open, empty-state link (by noor-selise, 2026-10-27)
- Widen company settings with profile and depreciation side by side on large screens (by noor-selise, 2026-10-27)
- Let depreciation classes use full page width like other record lists (by noor-selise, 2026-10-27)
- Run nginx as non-root in the release image so Blocks deploy matches cluster policy (by noor-selise, 2026-10-25)
- Push `dev` branch and trigger Blocks release deploy for the dev environment (by noor-selise, 2026-10-20)
- Hide native number spinners and align input focus rings with DESIGN.md (by noor-selise, 2026-10-20)
- Let tablets expand or collapse the sidebar like desktop and trim the footer to copyright and version only (by noor-selise, 2026-10-20)
- Widen the top-bar account chip, lift the avatar off the pill, and use a dropdown chevron (by noor-selise, 2026-10-20)
- Move the account chip into the top bar so name, role, security and sign out sit with the navbar (by noor-selise, 2026-10-20)
- Thin the app scrollbars and quiet the sidebar rail so nav and dialogs no longer show a thick system bar (by noor-selise, 2026-10-20)
- Restyle shared tabs as filter chips and add word spacing on overline labels so payment and order views stay readable (by noor-selise, 2026-10-20)
