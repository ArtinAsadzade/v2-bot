import { BOT_TIME_ZONE, zonedJalaliToUtcDate } from "../../utils/persianDateTime";

export const PREDICTION_TIME_ZONE = BOT_TIME_ZONE;

export type PredictionDateInput = Date | string | null | undefined;

const toDate = (value: PredictionDateInput): Date | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const partsInZone = (date: Date, timeZone: string) => {
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
  return { year: val("year"), month: val("month"), day: val("day"), hour: val("hour"), minute: val("minute"), second: val("second") };
};

const wallClockMs = (value: PredictionDateInput): number | undefined => {
  const date = toDate(value);
  if (!date) return undefined;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
};

const tehranWallClockNowMs = (now: Date = new Date()) => {
  const p = partsInZone(now, PREDICTION_TIME_ZONE);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, now.getMilliseconds());
};

export class PredictionDateService {
  static readonly timeZone = PREDICTION_TIME_ZONE;

  /**
   * Formats prediction dates by preserving the stored wall-clock value. Legacy
   * rows were saved as Iran local date/time values, so UTC fields are treated as
   * Tehran wall-clock fields and are never timezone-shifted for display.
   */
  static formatPredictionDate(value: PredictionDateInput): string {
    const date = toDate(value);
    if (!date) return "—";
    const wallClockDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), 0, 0));
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

  static fromJalaliSelection(year: number, month: number, day: number, hour: number, minute: number): Date {
    const tehranInstant = zonedJalaliToUtcDate(year, month, day, hour, minute, PREDICTION_TIME_ZONE);
    const p = partsInZone(tehranInstant, PREDICTION_TIME_ZONE);
    return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0));
  }

  static hasPredictionClosed(closesAt: PredictionDateInput, now: Date = new Date()): boolean {
    const closes = toDate(closesAt);
    return !closes ? true : closes.getTime() <= now.getTime();
  }

  static isPredictionOpen(contest: { status?: string | null; closesAt?: PredictionDateInput }, now: Date = new Date()): boolean {
    return contest.status === "open" && !this.hasPredictionClosed(contest.closesAt, now);
  }

  static hasResultTimeReached(contest: { closesAt?: PredictionDateInput }, now: Date = new Date()): boolean {
    return this.hasPredictionClosed(contest.closesAt, now);
  }

  static countdown(closesAt: PredictionDateInput, now: Date = new Date()): string {
    const closes = wallClockMs(closesAt);
    if (closes === undefined) return "مهلت تمام شده";
    const ms = closes - tehranWallClockNowMs(now);
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
