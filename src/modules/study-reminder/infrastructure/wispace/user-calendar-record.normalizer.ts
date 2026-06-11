import { UserCalendarRecord } from '../../domain/entities/user-calendar.types';

export function unwrapCalendarCreatePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const obj = payload as Record<string, unknown>;
  const data = obj.data ?? obj.Data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }

  return payload;
}

export function normalizeCreatedCalendarRecord(
  payload: unknown,
  input: { eventDate: string; time: string; userId?: number },
): UserCalendarRecord | null {
  const normalized = normalizeUserCalendarRecord(
    unwrapCalendarCreatePayload(payload),
  );
  if (normalized) {
    return normalized;
  }

  const raw = unwrapCalendarCreatePayload(payload);
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const id = Number(item.id ?? item.Id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  let eventDate = input.eventDate.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(eventDate)) {
    eventDate = eventDate.slice(0, 10);
  }

  const userId = Number(item.userId ?? item.UserId ?? input.userId ?? 0);

  return {
    id,
    userId: Number.isFinite(userId) ? userId : 0,
    eventDate,
    time: input.time,
  };
}

export function normalizeUserCalendarRecord(
  raw: unknown,
): UserCalendarRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const id = Number(item.id ?? item.Id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const eventDateRaw = item.eventDate ?? item.EventDate;
  if (eventDateRaw === undefined || eventDateRaw === null) {
    return null;
  }

  let eventDate =
    eventDateRaw instanceof Date
      ? eventDateRaw.toISOString()
      : String(eventDateRaw).trim();
  if (!eventDate) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(eventDate)) {
    eventDate = eventDate.slice(0, 10);
  }

  const timeRaw = item.time ?? item.Time;
  const time =
    timeRaw === null || timeRaw === undefined
      ? null
      : String(timeRaw).trim() || null;

  const userId = Number(item.userId ?? item.UserId ?? 0);
  const createdAtRaw = item.createdAt ?? item.CreatedAt;

  return {
    id,
    userId: Number.isFinite(userId) ? userId : 0,
    eventDate,
    time,
    createdAt:
      createdAtRaw === undefined || createdAtRaw === null
        ? undefined
        : String(createdAtRaw),
  };
}

export function normalizeUserCalendarRecords(
  payload: unknown,
): UserCalendarRecord[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  return rows
    .map((row) => normalizeUserCalendarRecord(row))
    .filter((record): record is UserCalendarRecord => record !== null);
}
