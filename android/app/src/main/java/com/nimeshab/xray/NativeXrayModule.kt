package com.nimeshab.xray

import android.content.Context
import android.content.Intent

class NativeXrayModule(private val context: Context) {
    fun start(configJson: String): String {
        XrayTunnelState.state = TunnelState.STARTING
        val intent = Intent(context, NimeshabVpnService::class.java).apply {
            action = NimeshabVpnService.ACTION_START
            putExtra(NimeshabVpnService.EXTRA_CONFIG_JSON, configJson)
        }
        context.startService(intent)
        return XrayTunnelState.state.name.lowercase()
    }

    fun stop(): String {
        context.startService(Intent(context, NimeshabVpnService::class.java).apply { action = NimeshabVpnService.ACTION_STOP })
        return TunnelState.STOPPING.name.lowercase()
    }

    fun getState(): String = XrayTunnelState.state.name.lowercase()
    fun getStats(): TunnelStats = XrayTunnelState.stats
}

enum class TunnelState { IDLE, STARTING, CONNECTED, STOPPING, STOPPED, RESTARTING, ERROR }
data class TunnelStats(val uploadBytes: Long = 0, val downloadBytes: Long = 0, val updatedAt: Long = System.currentTimeMillis())

object XrayTunnelState {
    @Volatile var state: TunnelState = TunnelState.IDLE
    @Volatile var stats: TunnelStats = TunnelStats()
}
