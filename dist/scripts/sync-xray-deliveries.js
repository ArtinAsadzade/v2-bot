"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncXrayDeliveries = syncXrayDeliveries;
const prisma_1 = require("../services/prisma");
const xray_service_1 = require("../modules/xray/xray.service");
async function syncXrayDeliveries({ repair = false } = {}) {
    const summary = { matched: 0, missingInPanel: 0, missingInDb: 0, repaired: 0, failed: 0 };
    const clients = await prisma_1.prisma.xrayClient.findMany({ where: { status: { in: ["active", "failed"] } }, take: 1000 });
    for (const client of clients) {
        try {
            const verified = await xray_service_1.XrayClientService.verifyPanelClient({ email: client.clientEmail });
            if (client.status === "active")
                summary.matched += 1;
            else {
                summary.missingInDb += 1;
                await prisma_1.prisma.auditLog.create({ data: { actorId: "system", action: "xray_sync.missing_in_db", metadata: JSON.stringify({ xrayClientId: client.id, email: client.clientEmail, panelClientId: verified.panelClientId }) } });
                if (repair) {
                    await prisma_1.prisma.xrayClient.update({ where: { id: client.id }, data: { status: "active", panelClientId: verified.panelClientId, clientSubId: verified.subId, lastError: null } });
                    summary.repaired += 1;
                }
            }
        }
        catch (error) {
            summary.missingInPanel += client.status === "active" ? 1 : 0;
            summary.failed += client.status === "active" ? 0 : 1;
            await prisma_1.prisma.auditLog.create({ data: { actorId: "system", action: "xray_sync.missing_in_panel", metadata: JSON.stringify({ xrayClientId: client.id, email: client.clientEmail, status: client.status, error: (0, xray_service_1.sanitizePanelError)(error) }) } });
            if (client.status === "active")
                await prisma_1.prisma.xrayClient.update({ where: { id: client.id }, data: { status: "missing_on_panel", lastError: "XRAY_CLIENT_MISSING_ON_PANEL" } });
        }
    }
    console.log(JSON.stringify(summary, null, 2));
    return summary;
}
if (require.main === module)
    syncXrayDeliveries({ repair: process.argv.includes("--repair") }).finally(() => prisma_1.prisma.$disconnect());
