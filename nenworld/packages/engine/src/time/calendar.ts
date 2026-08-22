/*
 * Game-calendar conversion.
 *
 * The game clock stores absolute time as a linear GameTimestamp measured in
 * milliseconds from the calendar epoch.
 *
 * This file converts between that timestamp and the calendar-facing
 * GameDateTime representation used by the world and UI.
 *
 * Calendar epoch:
 *
 *   Year 1
 *   Month 1
 *   Day 1
 *   00:00:00
 *
 * corresponds to GameTimestamp 0.
 *
 * The campaign itself does not need to begin at the epoch. A campaign may
 * begin at any valid GameDateTime, which is converted into its corresponding
 * GameTimestamp when the game clock is created.
 */

import type {
  GameDateTime,
  GameTimestamp,
} from "./types";


const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const MILLISECONDS_PER_MINUTE =
  SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

const MILLISECONDS_PER_HOUR =
  MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE;

const MILLISECONDS_PER_DAY =
  HOURS_PER_DAY * MILLISECONDS_PER_HOUR;


/**
 * Number of months in the current world calendar.
 */
export const MONTHS_PER_YEAR = 12;


/**
 * Base number of days in each month.
 *
 * February receives an additional day during leap years.
 */
const DAYS_PER_MONTH = [
  31,
  28,
  31,
  30,
  31,
  30,
  31,
  31,
  30,
  31,
  30,
  31,
] as const;


/**
 * Returns whether a calendar year is a leap year.
 *
 * The current calendar uses Gregorian-style leap-year rules:
 *
 * - divisible by 4      -> leap year
 * - divisible by 100    -> not a leap year
 * - divisible by 400    -> leap year
 */
export function isLeapYear(year: number): boolean {
  if (year % 400 === 0) {
    return true;
  }

  if (year % 100 === 0) {
    return false;
  }

  return year % 4 === 0;
}


/**
 * Returns the number of days in a particular month of a particular year.
 *
 * Month numbers are 1-based:
 *
 *   1  = first month
 *   12 = twelfth month
 */
export function getDaysInMonth(
  year: number,
  month: number,
): number {
  const baseDays = DAYS_PER_MONTH[month - 1];

  if (baseDays === undefined) {
    throw new RangeError(
      `Month must be between 1 and ${MONTHS_PER_YEAR}. Received: ${month}.`,
    );
  }

  if (month === 2 && isLeapYear(year)) {
    return baseDays + 1;
  }

  return baseDays;
}


/**
 * Returns the number of days in a calendar year.
 */
export function getDaysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}


/**
 * Converts a calendar date and time into an absolute GameTimestamp.
 *
 * The epoch is:
 *
 *   Year 1, Month 1, Day 1, 00:00:00
 *
 * Therefore:
 *
 *   fromGameDateTime({
 *     year: 1,
 *     month: 1,
 *     day: 1,
 *     hour: 0,
 *     minute: 0,
 *     second: 0,
 *   })
 *
 * returns 0.
 */
export function fromGameDateTime(
  dateTime: GameDateTime,
): GameTimestamp {
  assertValidGameDateTime(dateTime);

  let totalDays = 0;

  /*
   * Add every complete year preceding the requested year.
   */
  for (let year = 1; year < dateTime.year; year += 1) {
    totalDays += getDaysInYear(year);
  }

  /*
   * Add every complete month preceding the requested month.
   */
  for (let month = 1; month < dateTime.month; month += 1) {
    totalDays += getDaysInMonth(dateTime.year, month);
  }

  /*
   * Day 1 contributes zero complete days, hence the -1.
   */
  totalDays += dateTime.day - 1;

  const dayMilliseconds =
    totalDays * MILLISECONDS_PER_DAY;

  const hourMilliseconds =
    dateTime.hour * MILLISECONDS_PER_HOUR;

  const minuteMilliseconds =
    dateTime.minute * MILLISECONDS_PER_MINUTE;

  const secondMilliseconds =
    dateTime.second * MILLISECONDS_PER_SECOND;

  return (
    dayMilliseconds +
    hourMilliseconds +
    minuteMilliseconds +
    secondMilliseconds
  );
}


/**
 * Converts an absolute GameTimestamp into its calendar-facing representation.
 *
 * Sub-second timestamp precision is intentionally omitted because
 * GameDateTime currently resolves only to whole seconds.
 */
export function toGameDateTime(
  timestamp: GameTimestamp,
): GameDateTime {
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(
      `Game timestamp must be finite. Received: ${timestamp}.`,
    );
  }

  if (timestamp < 0) {
    throw new RangeError(
      `Game timestamp cannot occur before the calendar epoch. Received: ${timestamp}.`,
    );
  }

  let remainingDays =
    Math.floor(timestamp / MILLISECONDS_PER_DAY);

  const millisecondsWithinDay =
    timestamp % MILLISECONDS_PER_DAY;

  let year = 1;

  /*
   * Consume complete years until the remaining number of days belongs to
   * the current year.
   */
  while (remainingDays >= getDaysInYear(year)) {
    remainingDays -= getDaysInYear(year);
    year += 1;
  }

  let month = 1;

  /*
   * Consume complete months until the remaining number of days belongs to
   * the current month.
   */
  while (
    remainingDays >= getDaysInMonth(year, month)
  ) {
    remainingDays -= getDaysInMonth(year, month);
    month += 1;
  }

  const day = remainingDays + 1;

  let remainingMilliseconds = millisecondsWithinDay;

  const hour = Math.floor(
    remainingMilliseconds / MILLISECONDS_PER_HOUR,
  );

  remainingMilliseconds %=
    MILLISECONDS_PER_HOUR;

  const minute = Math.floor(
    remainingMilliseconds / MILLISECONDS_PER_MINUTE,
  );

  remainingMilliseconds %=
    MILLISECONDS_PER_MINUTE;

  const second = Math.floor(
    remainingMilliseconds / MILLISECONDS_PER_SECOND,
  );

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}


/**
 * Returns whether a GameDateTime represents a valid calendar moment.
 */
export function isValidGameDateTime(
  dateTime: GameDateTime,
): boolean {
  const {
    year,
    month,
    day,
    hour,
    minute,
    second,
  } = dateTime;

  if (
    !Number.isInteger(year) ||
    year < 1
  ) {
    return false;
  }

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > MONTHS_PER_YEAR
  ) {
    return false;
  }

  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > getDaysInMonth(year, month)
  ) {
    return false;
  }

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour >= HOURS_PER_DAY
  ) {
    return false;
  }

  if (
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute >= MINUTES_PER_HOUR
  ) {
    return false;
  }

  if (
    !Number.isInteger(second) ||
    second < 0 ||
    second >= SECONDS_PER_MINUTE
  ) {
    return false;
  }

  return true;
}


/**
 * Throws when a GameDateTime does not represent a valid calendar moment.
 *
 * Detailed engine-facing validation can additionally be provided by
 * time/validation.ts. This assertion exists to prevent invalid calendar
 * values from being converted into authoritative timestamps.
 */
function assertValidGameDateTime(
  dateTime: GameDateTime,
): void {
  if (!isValidGameDateTime(dateTime)) {
    throw new RangeError(
      `Invalid game date/time: ${JSON.stringify(dateTime)}.`,
    );
  }
}