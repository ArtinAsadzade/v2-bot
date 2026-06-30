import NetworkExtension

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let runner = XrayCoreRunner()

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
        settings.ipv4Settings = NEIPv4Settings(addresses: ["10.8.0.2"], subnetMasks: ["255.255.255.255"])
        settings.ipv4Settings?.includedRoutes = [NEIPv4Route.default()]
        settings.dnsSettings = NEDNSSettings(servers: ["1.1.1.1"])

        setTunnelNetworkSettings(settings) { [weak self] error in
            guard error == nil else { completionHandler(error); return }
            self?.runner.start(packetFlow: self?.packetFlow, appGroup: "group.com.nimeshab")
            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        runner.stop()
        completionHandler()
    }
}

final class XrayCoreRunner {
    func start(packetFlow: NEPacketTunnelFlow?, appGroup: String) {
        // TODO: read protected config from app group, start Xray-core and tun2socks adapter.
    }

    func stop() {
        // TODO: stop Xray-core process/library and close packet flow adapter.
    }
}
