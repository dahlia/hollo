import { expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { toTemporalInstant, toDate } from "./date";

const date = new Date("2024-08-31T10:00:00");
const temporalInstant = Temporal.Instant.from(date.toISOString());

test("toTemporalInstant call with null", ()=>{
  expect(toTemporalInstant(null)).toBe(null)
});

test("toTemporalInstant call with Date", ()=>{
  expect(toTemporalInstant(date)).not.toBe(null);
});

test("toDate call with null", ()=>{
  expect(toDate(null)).toBe(null);
});

test("toDate call with Temporal.Instant", ()=>{
  expect(toDate(temporalInstant)).not.toBe(null);
});

test("idempotency test", ()=>{
  expect(toDate(toTemporalInstant(date))).not.toBe(null);
  expect(toTemporalInstant(toDate(temporalInstant))).not.toBe(null);
});
