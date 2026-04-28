import { describe, expect, test } from 'vitest';
import {
  addDays,
  formatDateLong,
  formatDateShort,
  formatTime,
  generateWorkoutSchedule,
  getCurrentWeekNumber,
  getDayIndex,
  getMonday,
  getWeekDateRange,
  getWorkoutsForWeek,
  isGymDay,
  isSameDate,
} from './scheduler';

const workouts = [
  { weekNumber: 1, sessionNumber: 1, sessionName: 'Week 1 A' },
  { weekNumber: 1, sessionNumber: 2, sessionName: 'Week 1 B' },
  { weekNumber: 2, sessionNumber: 3, sessionName: 'Week 2 A' },
];

describe('program scheduler', () => {
  test('maps days and compares local dates', () => {
    expect(getDayIndex('sunday')).toBe(0);
    expect(getDayIndex('wednesday')).toBe(3);
    expect(isSameDate(new Date('2026-12-31T01:00:00'), new Date('2026-12-31T23:00:00'))).toBe(
      true,
    );
    expect(isSameDate(new Date('2026-12-31T23:00:00'), new Date('2027-01-01T00:00:00'))).toBe(
      false,
    );
  });

  test('adds days across month and year boundaries', () => {
    expect(addDays(new Date('2026-12-30T00:00:00'), 3).toISOString().slice(0, 10)).toBe(
      '2027-01-02',
    );
  });

  test('finds monday and gym days', () => {
    expect(getMonday(new Date('2026-05-03T00:00:00')).toISOString().slice(0, 10)).toBe(
      '2026-04-27',
    );
    expect(isGymDay(new Date('2026-04-29T00:00:00'), ['monday', 'wednesday'])).toBe(true);
    expect(isGymDay(new Date('2026-04-30T00:00:00'), ['monday', 'wednesday'])).toBe(false);
  });

  test('generates stable schedule across preferred days', () => {
    const schedule = generateWorkoutSchedule(workouts, new Date('2026-12-29T00:00:00'), {
      preferredDays: ['monday', 'wednesday'],
      preferredTimeOfDay: 'morning',
    });

    expect(schedule.map((entry) => entry.scheduledDate.toISOString().slice(0, 10))).toEqual([
      '2026-12-30',
      '2027-01-04',
      '2027-01-06',
    ]);
    expect(schedule.map((entry) => entry.scheduledTime)).toEqual(['07:00', '07:00', '07:00']);
  });

  test('respects forced first session date', () => {
    const schedule = generateWorkoutSchedule(workouts, new Date('2026-04-28T00:00:00'), {
      preferredDays: ['monday'],
      forceFirstSessionDate: new Date('2026-04-30T00:00:00'),
    });

    expect(schedule[0].scheduledDate.toISOString().slice(0, 10)).toBe('2026-04-30');
    expect(schedule[1].scheduledDate.toISOString().slice(0, 10)).toBe('2026-05-04');
  });

  test('resolves current week before, within, and after the schedule', () => {
    const schedule = generateWorkoutSchedule(workouts, new Date('2026-04-27T00:00:00'), {
      preferredDays: ['monday', 'wednesday'],
    });

    expect(getCurrentWeekNumber(schedule, new Date('2026-04-01T00:00:00'))).toBe(1);
    expect(getCurrentWeekNumber(schedule, new Date('2026-05-04T00:00:00'))).toBe(2);
    expect(getCurrentWeekNumber(schedule, new Date('2026-06-01T00:00:00'))).toBe(2);
  });

  test('groups workouts and returns full week range', () => {
    const schedule = generateWorkoutSchedule(workouts, new Date('2026-04-27T00:00:00'), {
      preferredDays: ['monday', 'wednesday'],
    });
    const weekOne = getWorkoutsForWeek(schedule, 1);
    const range = getWeekDateRange(1, schedule);

    expect(weekOne).toHaveLength(2);
    expect(range.start.toISOString().slice(0, 10)).toBe('2026-04-27');
    expect(range.end.toISOString().slice(0, 10)).toBe('2026-05-03');
    expect(range.days).toHaveLength(7);
  });

  test('formats schedule labels', () => {
    expect(formatTime('17:00')).toBe('5:00 PM');
    expect(formatTime('00:30')).toBe('12:00 AM');
    expect(formatDateShort(new Date('2026-04-28T00:00:00'))).toBe('Apr 28');
    expect(formatDateLong('2026-04-28')).toBe('Tuesday, April 28, 2026');
  });
});

