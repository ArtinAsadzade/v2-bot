# Navigation Audit Report

## Findings

- Panel navigation is centralized with `callbackFor(...)` and `PanelViewId`.
- Back/home controls are injected consistently by `panelKeyboard(...)` unless a view opts out.
- Duplicate back/home controls are deduplicated.
- Callback payloads are length-checked with `ensureCallbackData(...)`.

## Changes

- Navigation rows are normalized as their own zone.
- Home/back/cancel no longer compete visually with primary actions.
- Tests verify callback targets in audited source files resolve to registered panel views.

## Flow coverage

The navigation model covers purchase, wallet, referral, support, Xray, settings, prediction, products/categories, and admin management flows via registered views and action callbacks.
