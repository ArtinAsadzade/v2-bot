import { BOT_TIME_ZONE, zonedJalaliToUtcDate } from "../../utils/persianDateTime";

export const PREDICTION_TIMEZONE = "Asia/Tehran";
export const PREDICTION_TIME_ZONE = PREDICTION_TIMEZONE;

export type PredictionDateInput = Date | string | null | undefined;
export type PredictionLocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

type PredictionStatusContest = {
  status?: string | null;
  closesAt?: PredictionDateInput;
  resultOptionId?: string | null;
  announcedAt?: Date | string | null;
};

const toDate = (value: PredictionDateInput): Date | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const partsInZone = (date: Date, timeZone: string): PredictionLocalDateTime => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const val = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: val("year"), month: val("month"), day: val("day"), hour: val("hour"), minute: val("minute"), second: val("second"), millisecond: date.getMilliseconds() };
};

const wallClockMs = (value: PredictionLocalDateTime) =>
  Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second, value.millisecond);

export class PredictionDateService {
  static readonly timeZone = PREDICTION_TIMEZONE;

  static predictionNow(now: Date = new Date()): PredictionLocalDateTime {
    return partsInZone(now, PREDICTION_TIMEZONE);
  }

  /**
   * Legacy prediction close dates are stored as Iran wall-clock values. For a
   * Date object, the UTC fields are intentionally read as local wall-clock
   * fields. This avoids shifting 1405/04/06 01:20 to another timezone during
   * business comparisons or display.
   */
  static parsePredictionDbDateAsIranLocal(value: Date | string): PredictionLocalDateTime {
    const date = toDate(value);
    if (!date) return { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millisecond: date.getUTCMilliseconds(),
    };
  }

  static comparePredictionDateTime(a: PredictionLocalDateTime, b: PredictionLocalDateTime): number {
    const diff = wallClockMs(a) - wallClockMs(b);
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }

  static hasPredictionClosed(contestOrClosesAt: PredictionStatusContest | PredictionDateInput, now: Date = new Date()): boolean {
    const closesAt = typeof contestOrClosesAt === "object" && !(contestOrClosesAt instanceof Date) && contestOrClosesAt !== null && "closesAt" in contestOrClosesAt
      ? contestOrClosesAt.closesAt
      : contestOrClosesAt;
    if (!closesAt) return true;
    const closes = this.parsePredictionDbDateAsIranLocal(closesAt as Date | string);
    return this.comparePredictionDateTime(this.predictionNow(now), closes) >= 0;
  }

  static canSubmitPrediction(contest: PredictionStatusContest, now: Date = new Date()): boolean {
    return contest.status === "open" && !this.hasPredictionClosed(contest, now);
  }

  static getPredictionDisplayStatus(contest: PredictionStatusContest, now: Date = new Date()): "open" | "waiting_result" | "resulted" | "announced" | "archived" | "deleted" {
    if (contest.status === "archived") return "archived";
    if (contest.status === "deleted") return "deleted";
    if (contest.announcedAt || contest.status === "announced") return "announced";
    if (contest.resultOptionId || contest.status === "resulted") return "resulted";
    if (contest.status === "open" && this.hasPredictionClosed(contest, now)) return "waiting_result";
    if (contest.status === "closed") return "waiting_result";
    if (contest.status === "open" && !this.hasPredictionClosed(contest, now)) return "open";
    return "waiting_result";
  }

  static isPredictionOpen(contest: PredictionStatusContest, now: Date = new Date()): boolean {
    return this.canSubmitPrediction(contest, now);
  }

  static hasResultTimeReached(contest: { closesAt?: PredictionDateInput }, now: Date = new Date()): boolean {
    return this.hasPredictionClosed(contest, now);
  }

  static formatPredictionDateTime(value: PredictionDateInput): string {
    const date = toDate(value);
    if (!date) return "—";
    const p = this.parsePredictionDbDateAsIranLocal(date);
    const wallClockDate = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0));
    const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(wallClockDate);
    const val = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${val("day")} ${val("month")} ${val("year")} ساعت ${val("hour")}:${val("minute")}`;
  }

  static formatPredictionDate(value: PredictionDateInput): string {
    return this.formatPredictionDateTime(value);
  }

  static fromJalaliSelection(year: number, month: number, day: number, hour: number, minute: number): Date {
    const tehranInstant = zonedJalaliToUtcDate(year, month, day, hour, minute, BOT_TIME_ZONE);
    const p = partsInZone(tehranInstant, PREDICTION_TIMEZONE);
    return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0));
  }

  static countdown(closesAt: PredictionDateInput, now: Date = new Date()): string {
    if (!closesAt) return "مهلت تمام شده";
    const closes = this.parsePredictionDbDateAsIranLocal(closesAt as Date | string);
    const ms = wallClockMs(closes) - wallClockMs(this.predictionNow(now));
    if (ms <= 0) return "مهلت تمام شده";
    const totalMinutes = Math.ceil(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const out: string[] = [];
    if (days) out.push(`${days.toLocaleString("fa-IR")} روز`);
    if (hours) out.push(`${hours.toLocaleString("fa-IR")} ساعت`);
    if (minutes || !out.length) out.push(`${minutes.toLocaleString("fa-IR")} دقیقه`);
    return out.join(" و ");
  }
}
