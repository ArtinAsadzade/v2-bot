# Telegram Button Capabilities

## Current library

- Package: `telegraf` 4.16.3.
- Supported typed inline button helpers found in the installed package: callback, URL, switch inline query, game, pay, login_url, and WebApp.
- `copy_text` is not exposed by the installed Telegraf type/helper set, so this change does not send copy_text buttons.

## Safe usage decisions

- Callback buttons remain the default for bot navigation because they preserve existing callback formats.
- URL buttons are safe and already used for payment links and can be used for subscription/payment links where a real URL exists.
- WebApp buttons are not introduced because this project does not currently expose a safe WebApp flow.
- Pay buttons are not introduced because native Telegram invoices are not the active payment flow.
- Copy text buttons are documented as unavailable in the current installed Telegraf helper/types and are not used to avoid unsafe raw payloads.

## Visual hierarchy

Telegram inline keyboards do not support arbitrary background colors. The bot uses emoji prefixes, concise labels, row grouping, summaries before actions, and dangerous confirmation screens instead of fake color styling.
