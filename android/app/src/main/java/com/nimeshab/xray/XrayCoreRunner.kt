package com.nimeshab.xray

import android.content.Context

object XrayCoreRunner {
    fun start(context: Context, sanitizedConfigJson: String, tunFd: Int) {
        // TODO: load libxray.so or execute bundled xray binary from noBackupFilesDir.
        // TODO: start tun2socks when Xray-core cannot consume Android TUN directly.
        XrayTunnelState.stats = TunnelStats(updatedAt = System.currentTimeMillis())
    }

    fun stop() {
        // TODO: stop native process/library and release tun2socks resources.
    }
}
