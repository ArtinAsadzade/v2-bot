import { describe, expect, it } from "vitest";
import { canSubmitPrediction, getPredictionDisplayStatus } from "../src/modules/prediction/prediction.service";
import { PredictionDateService } from "../src/modules/prediction/prediction-date.service";

const closeAt0120Iran = new Date("2026-06-26T01:20:00.000Z");
const nowAt0119Iran = new Date("2026-06-25T21:49:00.000Z");
const nowAt0120Iran = new Date("2026-06-25T21:50:00.000Z");
const nowAt0122Iran = new Date("2026-06-25T21:52:00.000Z");

describe("prediction display status", () => {
  it("contest closesAt 01:20 Iran and now 01:19 Iran appears open", () => {
    const contest = { status: "open", closesAt: closeAt0120Iran, resultOptionId: null };

    expect(getPredictionDisplayStatus(contest, nowAt0119Iran)).toBe("open");
    expect(canSubmitPrediction(contest, nowAt0119Iran)).toBe(true);
  });

  it("contest closesAt 01:20 Iran and now 01:22 Iran appears as waiting_result and blocks submission", () => {
    const contest = { status: "open", closesAt: closeAt0120Iran, resultOptionId: null };

    expect(getPredictionDisplayStatus(contest, nowAt0122Iran)).toBe("waiting_result");
    expect(canSubmitPrediction(contest, nowAt0122Iran)).toBe(false);
  });

  it("contest closesAt equal to now is closed, not open", () => {
    const contest = { status: "open", closesAt: closeAt0120Iran, resultOptionId: null };

    expect(getPredictionDisplayStatus(contest, nowAt0120Iran)).toBe("waiting_result");
    expect(canSubmitPrediction(contest, nowAt0120Iran)).toBe(false);
  });

  it("status=closed without result appears as waiting_result", () => {
    expect(getPredictionDisplayStatus({ status: "closed", closesAt: closeAt0120Iran, resultOptionId: null }, nowAt0122Iran)).toBe("waiting_result");
  });

  it("resulted and announced contests keep their display status", () => {
    expect(getPredictionDisplayStatus({ status: "resulted", closesAt: closeAt0120Iran, resultOptionId: "option-1" }, nowAt0122Iran)).toBe("resulted");
    expect(getPredictionDisplayStatus({ status: "announced", closesAt: closeAt0120Iran, resultOptionId: "option-1", announcedAt: nowAt0122Iran }, nowAt0122Iran)).toBe("announced");
  });

  it("archived and deleted contests are never submittable", () => {
    expect(getPredictionDisplayStatus({ status: "archived", closesAt: closeAt0120Iran, resultOptionId: null }, nowAt0119Iran)).toBe("archived");
    expect(getPredictionDisplayStatus({ status: "deleted", closesAt: closeAt0120Iran, resultOptionId: null }, nowAt0119Iran)).toBe("deleted");
    expect(canSubmitPrediction({ status: "archived", closesAt: closeAt0120Iran, resultOptionId: null }, nowAt0119Iran)).toBe(false);
    expect(canSubmitPrediction({ status: "deleted", closesAt: closeAt0120Iran, resultOptionId: null }, nowAt0119Iran)).toBe(false);
  });

  it("formatted date preserves original Iran wall-clock time", () => {
    expect(PredictionDateService.formatPredictionDateTime(closeAt0120Iran)).toContain("۰۱:۲۰");
  });
});
