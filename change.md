# Changelog

All changes to this project will be documented in this file.

## [Unreleased]

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
