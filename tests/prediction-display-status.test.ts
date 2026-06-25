import { describe, expect, it } from "vitest";
import { canSubmitPrediction, getPredictionDisplayStatus } from "../src/modules/prediction/prediction.service";

const now = new Date("2026-06-25T12:00:00.000Z");
const future = new Date("2026-06-25T13:00:00.000Z");
const past = new Date("2026-06-25T11:00:00.000Z");

describe("prediction display status", () => {
  it("open contest appears as open and is submittable before close time", () => {
    const contest = { status: "open", closesAt: future, resultOptionId: null };

    expect(getPredictionDisplayStatus(contest, now)).toBe("open");
    expect(canSubmitPrediction(contest, now)).toBe(true);
  });

  it("status=open with closesAt in past appears as waiting_result and blocks submission", () => {
    const contest = { status: "open", closesAt: past, resultOptionId: null };

    expect(getPredictionDisplayStatus(contest, now)).toBe("waiting_result");
    expect(canSubmitPrediction(contest, now)).toBe(false);
  });

  it("status=closed without result appears as waiting_result", () => {
    expect(getPredictionDisplayStatus({ status: "closed", closesAt: past, resultOptionId: null }, now)).toBe("waiting_result");
  });

  it("resulted and announced contests keep their display status", () => {
    expect(getPredictionDisplayStatus({ status: "resulted", closesAt: past, resultOptionId: "option-1" }, now)).toBe("resulted");
    expect(getPredictionDisplayStatus({ status: "announced", closesAt: past, resultOptionId: "option-1", announcedAt: now }, now)).toBe("announced");
  });

  it("archived contests are visible only through history logic and never submittable", () => {
    const contest = { status: "archived", closesAt: future, resultOptionId: null };

    expect(getPredictionDisplayStatus(contest, now)).toBe("archived");
    expect(canSubmitPrediction(contest, now)).toBe(false);
  });
});
