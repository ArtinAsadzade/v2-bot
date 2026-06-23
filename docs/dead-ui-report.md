# Dead UI Report

## Static checks added

The UI audit test suite scans view registrations and callback targets in the primary bot UI files. It verifies that visible `callbackFor("...")` panel targets map to registered `registerView("...")` views.

## Results after refactor

- No missing registered panel target was found in the audited modern UI surface.
- Callback payloads continue to be guarded by `ensureCallbackData(...)`.
- Destructive controls are no longer mixed into navigation or primary action groups by panel rendering.

## Known limitations

- Regex-based static scanning cannot prove reachability for callbacks assembled dynamically with template literals.
- Some legacy direct `reply_markup` keyboards remain and should be migrated opportunistically to `buildInlineKeyboard(...)` for complete balancing enforcement.
