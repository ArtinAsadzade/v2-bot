# Xray Native Bridge

Nimeshab uses a single typed bridge contract, `NativeXrayModule`, for React Native callers and platform implementations.

## Supported protocols

The parser normalizes `vmess://`, `vless://`, `trojan://`, `ss://`, and base64 or plain-text subscription payloads into `NormalizedXrayConfig`.

## JS API

- `start({ config, mtu, bypassLan, allowApps, disallowApps })`
- `stop()`
- `restart({ config })`
- `getState()`
- `getStats()`
- `ping(config)`
- `testTcpPing(config)`
- `testRealDelay(config)`

## Native responsibilities

- Never log full imported configs.
- Convert normalized configs to Xray JSON on the native side or in a protected JS helper.
- Store active configs in encrypted/protected storage only.
- Emit state and traffic updates to React Native.
- Use Xray-core plus tun2socks where the platform TUN path requires it.

## Files

- TypeScript bridge contract: `src/mobile/xray/types.ts`
- Parser and subscription import: `src/mobile/xray/parser.ts`
- Redaction helpers: `src/mobile/xray/security.ts`
- State/stat store: `src/mobile/xray/state-manager.ts`
- Android service skeleton: `android/app/src/main/java/com/nimeshab/xray/`
- iOS packet tunnel skeleton: `ios/NimeshabPacketTunnel/`
