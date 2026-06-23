import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_MODULE_ARCHITECTURE, CLICK_DEPTH_REPORT, NAVIGATION_AUDIT, NAVIGATION_GRAPH, USER_MODULE_ARCHITECTURE } from "../src/bot/navigation/information-architecture";
import type { PanelViewId } from "../src/bot/navigation/panel-ui";
import { readAdminViewsSource } from "./helpers/view-source";

const allAreas = [...USER_MODULE_ARCHITECTURE, ...ADMIN_MODULE_ARCHITECTURE];
const registeredViewSource = ["src/bot/views/home.views.ts", "src/bot/views/product.views.ts", "src/bot/views/purchase.views.ts", "src/bot/views/account.views.ts", "src/bot/views/wallet.views.ts", "src/bot/views/support.views.ts", "src/bot/views/free-account.views.ts", "src/bot/views/prediction.views.ts"]
  .map((file) => readFileSync(file, "utf8"))
  .concat(readAdminViewsSource())
  .join("\n");

const hasRegisteredView = (view: PanelViewId) => registeredViewSource.includes(`registerView("${view}"`);

describe("Phase 2 information architecture", () => {
  test("every user goal module has a reachable home entry point", () => {
    expect(USER_MODULE_ARCHITECTURE.map((area) => area.module)).toEqual(["Buy", "My Services", "Wallet", "Rewards", "Support", "Profile"]);
    for (const area of USER_MODULE_ARCHITECTURE) {
      expect(hasRegisteredView(area.entry)).toBe(true);
      expect(NAVIGATION_GRAPH).toContainEqual(expect.objectContaining({ from: "home", to: area.entry }));
    }
  });

  test("admin tools are grouped by management domain", () => {
    expect(ADMIN_MODULE_ARCHITECTURE.map((area) => area.module)).toEqual(["Commerce", "Customer", "Xray", "Marketing", "System"]);
    for (const area of ADMIN_MODULE_ARCHITECTURE) {
      expect(hasRegisteredView(area.entry)).toBe(true);
      expect(NAVIGATION_GRAPH).toContainEqual(expect.objectContaining({ from: "admin.dashboard", to: area.entry }));
    }
  });

  test("all mapped screens are implemented and have a domain owner", () => {
    const mappedScreens = new Set(allAreas.flatMap((area) => area.screens));
    for (const view of mappedScreens) expect(hasRegisteredView(view)).toBe(true);
    expect(mappedScreens.size).toBeGreaterThan(70);
  });

  test("large entity lists expose search entry points", () => {
    const searchable = new Set(allAreas.flatMap((area) => area.searchable ?? []));
    expect([...searchable]).toEqual(expect.arrayContaining(["shop.searchResults", "admin.products", "admin.users", "admin.tickets", "admin.predictionList", "admin.xrayClients"]));
    expect(readFileSync("src/bot/views/product.views.ts", "utf8")).toContain("flow:start:product_search");
    expect(readAdminViewsSource()).toContain("flow:start:admin_product_search");
  });

  test("common workflows meet one-to-three click depth target", () => {
    for (const item of CLICK_DEPTH_REPORT) expect(item.clicks).toBeLessThanOrEqual(item.targetMax);
    expect(CLICK_DEPTH_REPORT.map((item) => item.workflow)).toEqual(expect.arrayContaining(["Buy service", "Renew service", "Recharge wallet", "Create product", "Create prediction", "View Xray client", "Send broadcast"]));
  });

  test("navigation graph avoids dead-end module entries and unrestricted circular paths", () => {
    const outgoing = new Map<PanelViewId, number>();
    for (const edge of NAVIGATION_GRAPH) outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    for (const area of allAreas) expect(outgoing.get(area.entry) ?? 0).toBeGreaterThan(0);
    const directCycles = NAVIGATION_GRAPH.filter((edge) => NAVIGATION_GRAPH.some((candidate) => candidate.from === edge.to && candidate.to === edge.from));
    expect(directCycles).toEqual([]);
    expect(NAVIGATION_AUDIT.navigationImprovementsCount).toBe(NAVIGATION_GRAPH.length);
  });
});
