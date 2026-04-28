import { describe, expect, test } from 'vitest';
import { candito } from './candito';
import { jenSinkler } from './jen-sinkler';
import { madcow } from './madcow';
import { megsquats } from './megsquats';
import { nsuns } from './nsuns';
import { nuckols } from './nuckols';
import { sheiko } from './sheiko';
import { stronglifts } from './stronglifts';
import { wendler531 } from './wendler531';
import type { ProgramConfig, ProgramWorkout } from './types';

const oneRMs = { squat: 180, bench: 120, deadlift: 220, ohp: 80 };

const programs: ProgramConfig[] = [
  stronglifts,
  wendler531,
  nsuns,
  candito,
  sheiko,
  madcow,
  nuckols,
  megsquats,
  jenSinkler,
];

function allProgramRows(workouts: ProgramWorkout[]) {
  return workouts.flatMap((workout) => [...workout.exercises, ...(workout.accessories ?? [])]);
}

describe('program generators', () => {
  test.each(programs)('$info.slug generates structurally valid workouts', (program) => {
    const workouts = program.generateWorkouts(oneRMs);

    expect(workouts.length).toBeGreaterThan(0);
    expect(workouts[0].weekNumber).toBeGreaterThanOrEqual(1);
    expect(
      new Set(workouts.map((workout) => `${workout.weekNumber}:${workout.sessionNumber}`)).size,
    ).toBe(workouts.length);

    for (const workout of workouts) {
      expect(workout.sessionName).toEqual(expect.any(String));
      expect(workout.exercises.length + (workout.accessories?.length ?? 0)).toBeGreaterThan(0);
      for (const exercise of workout.exercises) {
        expect(exercise.name).toEqual(expect.any(String));
        expect(exercise.sets).toBeGreaterThan(0);
        expect(exercise.reps).toBeGreaterThanOrEqual(0);
        expect(exercise.targetWeight).toBeGreaterThanOrEqual(0);
      }
      for (const accessory of workout.accessories ?? []) {
        expect(accessory.name).toEqual(expect.any(String));
        expect(accessory.sets).toBeGreaterThan(0);
        expect(accessory.targetWeight).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test.each(programs)('$info.slug includes configured main lifts', (program) => {
    const lifts = new Set(
      program
        .generateWorkouts(oneRMs)
        .flatMap((workout) => workout.exercises.map((exercise) => exercise.lift)),
    );

    for (const lift of program.info.mainLifts) {
      expect(lifts.has(lift)).toBe(true);
    }
  });

  test('stronglifts exposes expected session count and progression', () => {
    const workouts = stronglifts.generateWorkouts(oneRMs);

    expect(workouts).toHaveLength(36);
    expect(workouts[0].exercises.map((exercise) => exercise.name)).toEqual([
      'Squat',
      'Bench Press',
      'Barbell Row',
    ]);
    expect(workouts[1].exercises.map((exercise) => exercise.name)).toEqual([
      'Squat',
      'Overhead Press',
      'Deadlift',
    ]);
    expect(workouts[1].exercises[0].targetWeight).toBeGreaterThan(
      workouts[0].exercises[0].targetWeight,
    );
  });

  test('at least one generated program contains AMRAP work', () => {
    const rows = programs.flatMap((program) => allProgramRows(program.generateWorkouts(oneRMs)));
    expect(rows.some((row) => row.isAmrap === true)).toBe(true);
  });
});
