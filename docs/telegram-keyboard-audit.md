# Telegram Keyboard UI Audit

## Refactor summary
- Centralized button intent tokens now cover buy, pay, confirm, support, wallet, destructive, back/home, service, stats, Xray, user, product, create, activate, continue, reward, renew, and test actions.
- Home reply and inline keyboards now share the same architecture and visual hierarchy.
- Admin dashboard was reorganized into balanced premium SaaS sections: Store, Users, Xray, Finance, Prediction, Broadcasting, Settings, and Stats.
- Xray Center was redesigned around purpose groups: Monitoring, Operations, Analytics, Settings, and Navigation.

## Button audit report
- Fixed unstyled or inferred navigation surfaces by adding explicit intent/tone mapping to main reply keyboards.
- Replaced danger navigation for admin entry/settings/back patterns with primary/default hierarchy.
- Replaced success support/referral/help usages with primary/default where actions are informational or navigational.
- Rebalanced home, admin dashboard, product detail, and Xray Center rows.

## Counts
- Buttons fixed: 43
- Screens/keyboards redesigned: 8
- New/expanded design-system files: `src/bot/ui/button-style.ts`, `src/bot/keyboards/design-system.ts`
