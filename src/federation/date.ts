import { Temporal } from "@js-temporal/polyfill";

export function toTemporalInstant(value: Date): Temporal.Instant;
export function toTemporalInstant(value: null): null;
export function toTemporalInstant(value: Date | null): Temporal.Instant | null;
export function toTemporalInstant(value: Date | null): Temporal.Instant | null {
  return value == null ? null : Temporal.Instant.from(value.toISOString());
}

export function toDate(value: Temporal.Instant): Date;
export function toDate(value: null): null;
export function toDate(value: Temporal.Instant | null): Date | null;
export function toDate(value: Temporal.Instant | null): Date | null {
  return value == null ? value : new Date(value.toString());
}
