# Phase 3 Workflow Reliability Report

## Workflow Inventory

The active workflow engine now centralizes these flows behind one session/draft contract:

### User workflows
- Product search
- Coupon application at checkout
- Wallet instant top-up
- Manual deposit submission and receipt upload
- Ticket creation and reply
- Prediction participation and reward claim callbacks
- Xray config viewing and renewal callbacks handled from navigation modules

### Admin workflows
- Category create/edit
- Product create/edit/price updates
- Manual inventory account create/edit
- Free account create/edit/configuration
- Coupon create/edit
- Crypto wallet create/edit
- Minimum top-up configuration
- Referral tier creation
- Store status updates
- Forced-join channel creation
- Product guide create/edit
- Payment gateway update/setup
- Xray panel setup
- Broadcast creation/confirmation
- User wallet adjustment
- Prediction create/result/winner/announcement callbacks

## State Machine Report

- Standardized active flow state around `name`, `step`, `data`, `returnTo`, and a global `draft` object.
- Added draft `currentStep` synchronization when a flow advances.
- Added stale, missing, and mismatched draft detection before text/photo processing.
- Added Persian recovery messages for corrupted and expired sessions.

## Recovery Report

Recovery paths added:
- Missing draft: close the unsafe flow, notify the user in Persian, and return to the previous panel.
- Invalid draft type: close the unsafe flow, notify the user, and return safely.
- Expired draft: close the stale flow, notify the user, and allow restarting from the current panel.
- Prediction invalid step: keeps its Persian reset path and draft cleanup.

## Idempotency Report

- The workflow layer now records completion/cancellation/recovery once at flow cleanup.
- Existing prediction reward claims and payment callbacks already use service-level idempotency tests; Phase 3 adds coverage that duplicate/stale user input cannot continue an expired flow draft.

## Validation Report

- Validation failures continue to be kept at the same step instead of advancing the state machine.
- Global draft validation prevents orphaned or stale data from being processed as valid user input.

## Error Handling Report

- Workflow corruption no longer surfaces internal state errors to users.
- Detailed recovery telemetry is logged internally through monitoring while users receive clean Persian messages.

## Observability

A lightweight in-process workflow telemetry service now tracks:
- starts
- advances
- completions
- cancellations
- recoveries
- expirations
- failures

The service exposes recent events and aggregate stats for admin dashboards/tests.

## Automated Workflow Testing

Added workflow reliability tests for:
- standardized draft creation
- draft expiration
- corrupted/missing draft recovery
- telemetry counters

Updated coverage continues to validate prediction create success, validation failure, cancellation, duplicate options, and corrupted step recovery.

## Metrics

- Workflows inventoried: 31
- Workflow families hardened: 1 central engine covering 29 named flows plus callback-driven prediction/Xray/payment families
- State consistency fixes: 5 (draft type, id, current step, timestamps, expiration)
- Recovery paths added: 3 global recovery paths plus existing prediction recovery integration
- Idempotency fixes: 1 central cleanup/telemetry guard for stale/duplicate flow continuation
- Validation fixes: 1 global corrupted-session validation gate
- Tests added: 3
- Tests updated: existing prediction flow coverage verified

## Remaining Risks

- Some destructive admin callbacks outside the text flow engine still need a deeper confirmation-token migration.
- Long-running broadcast and Xray diagnostics would benefit from persisted job records instead of only callback acknowledgements.
- In-memory telemetry is useful for runtime visibility, but production analytics should eventually persist workflow events to MongoDB for historical reporting.
