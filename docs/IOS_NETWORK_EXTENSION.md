# iOS Network Extension Architecture

Nimeshab uses an `NEPacketTunnelProvider` extension for VPN traffic capture.

## Components

- Main app React Native bridge: validates configs, stores protected active config, starts/stops `NETunnelProviderManager`.
- Packet Tunnel Provider: reads config from App Group storage and starts Xray-core/tun2socks.
- Shared App Group: stores active config, connection state snapshots, and traffic counters.

## Startup flow

1. Main app writes encrypted/protected config into the App Group container.
2. Main app starts the configured `NETunnelProviderManager`.
3. `PacketTunnelProvider.startTunnel` applies IP/DNS/routes.
4. `XrayCoreRunner` starts Xray-core and adapts `NEPacketTunnelFlow` via tun2socks if required.
5. Provider writes state and stats to the App Group for the main app to observe.

## Security

- Use Keychain access group or file protection with `NSFileProtectionComplete` for secrets.
- Do not log full configs, UUIDs, passwords, private keys, or subscription URLs.
- Prefer short-lived active config files and delete them on stop.
