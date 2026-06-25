import { describe, expect, it } from "vitest";
import { BOT_TIME_ZONE, formatJalaliDateTime, formatPredictionCountdown, zonedJalaliToUtcDate } from "../src/utils/persianDateTime";
import { canSubmitPrediction, getPredictionDisplayStatus, PredictionService, resolvePredictionState } from "../src/modules/prediction/prediction.service";

describe("prediction finite-state visibility and Iran timezone", () => {
  const now = new Date("2026-06-25T12:00:00.000Z");
  const past = new Date("2026-06-25T11:00:00.000Z");
  const future = new Date("2026-06-25T13:30:00.000Z");

  it("enforces Asia/Tehran and renders Persian calendar date-times", () => {
    expect(BOT_TIME_ZONE).toBe("Asia/Tehran");
    expect(formatJalaliDateTime(zonedJalaliToUtcDate(1405, 4, 5, 22, 30))).toBe("۵ تیر ۱۴۰۵ ساعت ۲۲:۳۰");
  });

  it("computes countdowns from absolute instants without browser/server timezone", () => {
    expect(formatPredictionCountdown(future, now)).toBe("۱ ساعت و ۳۰ دقیقه");
    expect(formatPredictionCountdown(past, now)).toBe("مهلت تمام شده");
  });

  it("keeps every non-deleted business state deterministic and visible where it belongs", () => {
    expect(resolvePredictionState({ status: "draft", closesAt: future }, now)).toBe("draft");
    expect(resolvePredictionState({ status: "open", closesAt: future }, now)).toBe("open");
    expect(resolvePredictionState({ status: "open", closesAt: past }, now)).toBe("waiting_result");
    expect(resolvePredictionState({ status: "closed", closesAt: past }, now)).toBe("waiting_result");
    expect(resolvePredictionState({ status: "resulted", closesAt: past, resultOptionId: "o" }, now)).toBe("resulted");
    expect(resolvePredictionState({ status: "announced", closesAt: past, resultOptionId: "o", announcedAt: now }, now)).toBe("announced");
    expect(resolvePredictionState({ status: "archived", closesAt: past, archivedAt: now }, now)).toBe("archived");
    expect(resolvePredictionState({ status: "deleted", closesAt: past }, now)).toBe("deleted");
  });

  it("allows submission only for open predictions before close time", () => {
    expect(canSubmitPrediction({ status: "open", closesAt: future }, now)).toBe(true);
    expect(canSubmitPrediction({ status: "open", closesAt: past }, now)).toBe(false);
    expect(canSubmitPrediction({ status: "closed", closesAt: past }, now)).toBe(false);
    expect(canSubmitPrediction({ status: "announced", closesAt: past, resultOptionId: "o" }, now)).toBe(false);
    expect(canSubmitPrediction({ status: "deleted", closesAt: future }, now)).toBe(false);
  });

  it("documents why admin-visible predictions are absent from user screens", () => {
    expect(PredictionService.visibilityReason({ status: "draft", closesAt: future })).toBe("draft_only_admin");
    expect(PredictionService.visibilityReason({ status: "archived", closesAt: past })).toBe("archive_only");
    expect(PredictionService.visibilityReason({ status: "deleted", closesAt: past })).toBe("deleted_hidden");
    expect(PredictionService.visibilityReason({ status: "closed", closesAt: past })).toBe("visible");
  });
});
