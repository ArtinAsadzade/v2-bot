import { prisma } from "../services/prisma";
import { XrayClientService, sanitizePanelError } from "../modules/xray/xray.service";

type Summary = { matched: number; missingInPanel: number; missingInDb: number; repaired: number; failed: number };

export async function syncXrayDeliveries({ repair = false } = {}) {
  const summary: Summary = { matched: 0, missingInPanel: 0, missingInDb: 0, repaired: 0, failed: 0 };
  const clients = await prisma.xrayClient.findMany({ where: { status: { in: ["active", "failed"] } }, take: 1000 });
  for (const client of clients) {
    try {
      const verified = await XrayClientService.verifyPanelClient({ email: client.clientEmail });
      if (client.status === "active") summary.matched += 1;
      else {
        summary.missingInDb += 1;
        await prisma.auditLog.create({ data: { actorId: "system", action: "xray_sync.missing_in_db", metadata: JSON.stringify({ xrayClientId: client.id, email: client.clientEmail, panelClientId: verified.panelClientId }) } });
        if (repair) {
          await prisma.xrayClient.update({ where: { id: client.id }, data: { status: "active", panelClientId: verified.panelClientId, clientSubId: verified.subId, lastError: null } });
          summary.repaired += 1;
        }
      }
    } catch (error) {
      summary.missingInPanel += client.status === "active" ? 1 : 0;
      summary.failed += client.status === "active" ? 0 : 1;
      await prisma.auditLog.create({ data: { actorId: "system", action: "xray_sync.missing_in_panel", metadata: JSON.stringify({ xrayClientId: client.id, email: client.clientEmail, status: client.status, error: sanitizePanelError(error) }) } });
      if (client.status === "active") await prisma.xrayClient.update({ where: { id: client.id }, data: { status: "missing_on_panel", lastError: "XRAY_CLIENT_MISSING_ON_PANEL" } });
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) syncXrayDeliveries({ repair: process.argv.includes("--repair") }).finally(() => prisma.$disconnect());
