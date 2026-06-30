package com.nimeshab.xray

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor

class NimeshabVpnService : VpnService() {
    private var tun: ParcelFileDescriptor? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startTunnel(intent.getStringExtra(EXTRA_CONFIG_JSON).orEmpty())
            ACTION_STOP -> stopTunnel()
        }
        return START_STICKY
    }

    private fun startTunnel(configJson: String) {
        XrayTunnelState.state = TunnelState.STARTING
        tun = Builder()
            .setSession("Nimeshab")
            .setMtu(1500)
            .addAddress("10.8.0.2", 32)
            .addRoute("0.0.0.0", 0)
            .addDnsServer("1.1.1.1")
            .establish()

        // TODO: pass tun.fileDescriptor and configJson to Xray-core/tun2socks runner.
        XrayCoreRunner.start(applicationContext, configJson, tun?.fd ?: -1)
        XrayTunnelState.state = TunnelState.CONNECTED
    }

    private fun stopTunnel() {
        XrayTunnelState.state = TunnelState.STOPPING
        XrayCoreRunner.stop()
        tun?.close()
        tun = null
        XrayTunnelState.state = TunnelState.STOPPED
        stopSelf()
    }

    override fun onDestroy() {
        stopTunnel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.nimeshab.xray.START"
        const val ACTION_STOP = "com.nimeshab.xray.STOP"
        const val EXTRA_CONFIG_JSON = "configJson"
    }
}
