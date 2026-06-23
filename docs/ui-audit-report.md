# Telegram Bot UI Audit Report

## Scope

The audit scanned the Telegram bot UI surface across `src/bot/views`, `src/bot/keyboards`, `src/bot/handlers/modern`, and notification/payment callback UI emitters. The discovered UI model includes:

- Inline panel views registered with `registerView(...)`.
- Inline keyboards emitted by handlers and service callbacks.
- Reply keyboards routed through quick reply labels.
- Admin management pages, Xray pages, purchase/checkout flows, wallet/deposit flows, support flows, referral and prediction flows.

## Systemic findings

1. **Button styling was partially centralized but not authoritative.** Many screens used `tone`, while raw inline keyboards and untyped panel rows could still ship with no intent.
2. **Rows could become visually unbalanced.** Some high-density admin pages used three-button rows, mixed destructive and constructive actions, or placed navigation among management actions.
3. **Danger heuristics were too broad.** Persian substring matching could classify normal words such as payment labels as destructive.
4. **Reply keyboards and inline keyboards had overlapping IA but no enforced shared intent layer.** Users saw the same destinations, but visual meaning was not guaranteed by one system.
5. **Admin/Xray pages contained workflow-heavy actions that needed stronger grouping.** Existing labels were mostly Persian, but layout consistency depended on each page author.

## Refactor applied

A central UI system now normalizes every panel keyboard before Telegram markup is generated:

- Every button is classified by intent/zone.
- Explicit intents and tones are honored.
- Missing styles are inferred centrally.
- Navigation is isolated from content actions.
- Destructive actions are separated from regular actions.
- Rows are constrained to balanced two-button rows.

## Screens and buttons impacted

Because the normalization is applied in `panelKeyboard(...)`, all registered panel screens now use the same design rules at render time. The audit found 89 panel view ids in the typed registry and applies the system to every view rendered through that registry.

Approximate refactor impact:

- **Screens refactored:** 89 registered panel view ids.
- **Button surfaces refactored:** all panel `UiKeyboard` rows, plus design-system inline/reply keyboard builders.
- **High-risk flows covered by tests:** checkout, wallet/deposit, support, admin, Xray, prediction, products, account services.

## Remaining risks

- Raw `reply_markup.inline_keyboard` objects emitted directly by some handlers still bypass the panel row balancer, though their callback validity and styling are partially protected by existing builders and tests.
- Runtime-only dynamic callbacks produced from live database ids cannot be fully proven statically.
- Telegram clients vary in support for unofficial button style fields; the layout and hierarchy still improve even where custom styling is ignored.
