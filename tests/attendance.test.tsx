import assert from "node:assert/strict";
import { test } from "node:test";
import { attendanceDate, attendanceDefaults, attendanceFilterSchema, attendanceRange, attendanceRecordRange, attendanceMonthRange, shiftAttendanceMonth, formatAttendanceDuration } from "../src/lib/attendance";

test("calendar data is limited to its visible month and clipped to the selected date range", () => {
  const range = attendanceRecordRange("2026-09-15", "2026-10-06", "2026-09");
  assert.equal(range.start.toISOString(), "2026-09-14T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-30T16:00:00.000Z");
  const october = attendanceRecordRange("2026-09-15", "2026-10-06", "2026-10");
  assert.equal(october.start.toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(october.end.toISOString(), "2026-10-06T16:00:00.000Z");
  const outside = attendanceRecordRange("2026-09-15", "2026-10-06", "2026-11");
  assert.ok(outside.start >= outside.end);
  assert.equal(attendanceFilterSchema.safeParse({ from: "2026-09-15", to: "2026-10-06", calendarMonth: "2026-13" }).success, false);
});

test("monthly ranges cover the entire calendar month including leap years", () => {
  assert.deepEqual(attendanceMonthRange("2026-10"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(attendanceMonthRange("2026-09"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(attendanceMonthRange("2024-02"), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(attendanceMonthRange("2100-02"), { from: "2100-02-01", to: "2100-02-28" });
  assert.deepEqual(attendanceMonthRange("2025-12"), { from: "2025-12-01", to: "2025-12-31" });
  assert.equal(shiftAttendanceMonth("2026-01", -1), "2025-12");
  assert.equal(shiftAttendanceMonth("2025-12", 1), "2026-01");
  for (const month of ["", "2026-13", "2026-00", "2026-1", "0000-01"]) {
    assert.equal(attendanceMonthRange(month), null);
    assert.equal(shiftAttendanceMonth(month, -1), null);
  }
  assert.equal(shiftAttendanceMonth("0001-01", -1), null);
  assert.equal(shiftAttendanceMonth("9999-12", 1), null);
});

test("attendance dates and month defaults use Ulaanbaatar even at UTC month boundaries", () => {
  const now = new Date("2026-09-30T16:30:00Z");
  assert.equal(attendanceDate(now), "2026-10-01");
  assert.deepEqual(attendanceDefaults(now), { from: "2026-10-01", to: "2026-10-01" });
  const range = attendanceRange("2026-10-01", "2026-10-02");
  assert.equal(range.start.toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-02T16:00:00.000Z");
});

test("report filters reject impossible dates, reverse ranges, huge ranges and invalid pages", () => {
  const valid = { from: "2026-10-01", to: "2026-10-06" };
  for (const values of [
    { ...valid, from: "2026-02-30" }, { ...valid, to: "2026-09-30" },
    { ...valid, to: "2028-10-01" }, { ...valid, page: "NaN" },
    { ...valid, page: 0 }, { ...valid, page: 1.5 },
  ]) assert.equal(attendanceFilterSchema.safeParse(values).success, false);
  assert.equal(attendanceFilterSchema.parse({ ...valid, page: "2" }).page, 2);
  assert.equal(attendanceFilterSchema.safeParse({ from: "2028-02-29", to: "2028-02-29" }).success, true);
});

test("durations preserve total hours beyond one day without rounding up unfinished minutes", () => {
  assert.equal(formatAttendanceDuration(0), "0 цаг 0 мин");
  assert.equal(formatAttendanceDuration(59999), "0 цаг 0 мин");
  assert.equal(formatAttendanceDuration((27 * 60 + 15) * 60000), "27 цаг 15 мин");
});
