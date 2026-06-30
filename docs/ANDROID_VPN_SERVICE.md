# Android VpnService Architecture

`NimeshabVpnService` owns the Android TUN interface and delegates Xray-core lifecycle to `XrayCoreRunner`.

## Startup flow

1. React Native calls `NativeXrayModule.start(configJson)`.
2. The module starts `NimeshabVpnService` with `ACTION_START`.
3. `VpnService.Builder` establishes a TUN interface.
4. `XrayCoreRunner.start(context, configJson, tunFd)` starts Xray-core and optionally tun2socks.
5. State changes move from `starting` to `connected` and stats are published.

## Stop flow

1. React Native calls `stop()`.
2. The service receives `ACTION_STOP`.
3. Xray-core and tun2socks are stopped.
4. The TUN descriptor is closed and state becomes `stopped`.

## Integration notes

- Bundle `libxray.so` per ABI or an executable `xray` binary.
- Keep config files in app-private storage and redact credentials in logs.
- Use Android Keystore/EncryptedSharedPreferences for saved configs.
- Add foreground-service notification before production release.
- Implement traffic stats by reading Xray stats API, tun2socks counters, or per-interface counters.
