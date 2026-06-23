# Keyboard Audit Report

## Reply keyboards

Reply keyboards are routed through the design-system builders and quick reply map. Main user IA is organized as:

1. Purchase/test acquisition.
2. Services/wallet management.
3. Engagement/referral/prediction.
4. Support/announcements.
5. Help and admin entry when permitted.

Admin reply IA is organized as:

1. Store and users.
2. Xray and finance.
3. Prediction and announcements.
4. Settings and stats.
5. Return to user menu.

## Inline keyboards

Inline panel keyboards now pass through the UI normalizer. This ensures:

- Main/conversion actions are visually prioritized.
- Management actions stay grouped.
- Destructive actions are separated after normal actions.
- Navigation actions are grouped last.
- Rows are capped and balanced for Telegram display rhythm.

## Consistency result

Reply and inline systems now share one intent vocabulary (`buy`, `pay`, `confirm`, `support`, `wallet`, `services`, `xray`, `delete`, `cancel`, `navigation`, etc.) and one style resolver.
