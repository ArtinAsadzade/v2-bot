# Xray Reliability Center Report

## Admin actions

The Telegram admin panel now includes **🧩 Xray Center** with actions to test the panel API, test the subscription base URL, review inbounds, verify a client, repair a client, cleanup broken clients, and view a sync report.

## Verification flow

`XrayDiagnosticsService.verifyXrayClient(clientId/email/orderId/telegramId)` loads the DB `XrayClient`, fetches current panel inbounds and the panel client, validates DB inbound IDs against live panel inbound IDs, requires a `clientSubId`, and probes the subscription URL when possible. It returns typed reasons: `panel_offline`, `subscription_unreachable`, `client_missing`, `stale_inbounds`, `missing_sub_id`, or `unknown_error`.

## Repair flow

Single-client repair can locate a client by client email, order ID, Telegram ID, or internal client ID. The repair uses the current `Product.inboundIds`, recreates or updates the panel client, then runs verification. The DB client and related order item are activated only after verification succeeds.

## Cleanup behavior

Cleanup scans active/provisioning/failed Xray clients, verifies each one, marks missing panel clients as `missing_on_panel`, marks stale inbound clients as `deleted`, and sets related `OrderItem.isActive = false`. Orders are never hard-deleted.

## Delivery safety

New Xray purchases validate product inbound IDs against the live panel before purchase proceeds. Provisioning creates the panel client, verifies the client and subscription, and only then marks the DB client active, creates/activates the order item, and completes delivery. Failed verification leaves delivery in `failed_delivery` for admin repair.

## Manual QA checklist

- Open admin panel and confirm the **🧩 Xray Center** button is visible.
- Run **🔄 Test Panel API** and confirm inbound count is shown.
- Run **🔗 Test Subscription URL** and confirm reachable/unreachable status is shown.
- Open **📊 Sync Report** and verify missing/stale/broken subscription counts.
- Pick a known active client and run **🔍 Verify Client**.
- Temporarily break a test client's panel record, run verify, and confirm `client_missing`.
- Repair that test client and confirm it only becomes active after verification.
- Run cleanup and confirm broken clients disappear from active customer accounts while orders remain.
- Attempt a new purchase with stale product inbound IDs and confirm delivery does not complete.
