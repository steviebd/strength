import { roundToPlate } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { megsquatsInfo, getMegsquatsAccessories } from './config/megsquats';
import type { LiftType, OneRMValues, ProgramConfig, ProgramWorkout } from './types';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';

function getWavePercentage(week: number, setNumber: number): number {
  const waveData: Record<number, number[]> = {
    1: [0.65, 0.75, 0.85],
    2: [0.7, 0.8, 0.9],
    3: [0.75, 0.85, 0.95],
    4: [0.4, 0.5, 0.6],
  };
  return waveData[week]?.[setNumber - 1] ?? 0.65;
}

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  _session: number,
  _lift: string,
  trainingMax: number,
): number {
  const tmPercentage = trainingMax / 100;
  const wavePercentage = getWavePercentage(week, 3);
  const baseWeight = estimatedOneRM * tmPercentage * wavePercentage;
  return roundToPlate(baseWeight);
}

function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];
  let workoutIndex = 0;
  const trainingMaxes = {
    squat: oneRMs.squat * 0.85,
    bench: oneRMs.bench * 0.85,
    deadlift: oneRMs.deadlift * 0.85,
    ohp: oneRMs.ohp * 0.85,
  };

  for (let week = 1; week <= 12; week++) {
    const isDeload = week === 4 || week === 8 || week === 12;

    for (let session = 1; session <= 3; session++) {
      workoutIndex++;
      const isLowerA = session === 1;
      const isUpperA = session === 2;

      const weekInWave = isDeload ? 4 : ((week - 1) % 4) + 1;
      const setsConfig = isDeload
        ? [
            { sets: 5, reps: 5, isAmrap: false },
            { sets: 5, reps: 5, isAmrap: false },
            { sets: 5, reps: 5, isAmrap: true },
          ]
        : weekInWave === 1
          ? [
              { sets: 5, reps: 5, isAmrap: false },
              { sets: 5, reps: 5, isAmrap: false },
              { sets: 5, reps: 5, isAmrap: true },
            ]
          : weekInWave === 2
            ? [
                { sets: 3, reps: 3, isAmrap: false },
                { sets: 3, reps: 3, isAmrap: false },
                { sets: 3, reps: 3, isAmrap: true },
              ]
            : weekInWave === 3
              ? [
                  { sets: 5, reps: 3, isAmrap: false },
                  { sets: 3, reps: 3, isAmrap: false },
                  { sets: 1, reps: 5, isAmrap: true },
                ]
              : [
                  { sets: 5, reps: 5, isAmrap: false },
                  { sets: 5, reps: 5, isAmrap: false },
                  { sets: 5, reps: 5, isAmrap: true },
                ];

      const exercises: ProgramWorkout['exercises'] = [];

      if (isLowerA) {
        exercises.push(
          {
            name: 'Squat',
            lift: 'squat' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
            sets: setsConfig[0].sets,
            reps: setsConfig[0].reps,
            targetWeight: calculateTargetWeight(
              oneRMs.squat,
              weekInWave,
              session,
              'squat',
              trainingMaxes.squat,
            ),
            isAmrap: setsConfig[0].isAmrap,
          },
          {
            name: 'Hip Thrust',
            lift: 'squat' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
            sets: 3,
            reps: 10,
            targetWeight: roundToPlate(oneRMs.squat * 0.6),
          },
          {
            name: 'Romanian Deadlift',
            lift: 'deadlift' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
            sets: 3,
            reps: 10,
            targetWeight: roundToPlate(oneRMs.deadlift * 0.6),
          },
          {
            name: 'Leg Press',
            lift: 'squat' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
            sets: 3,
            reps: 12,
            targetWeight: roundToPlate(oneRMs.squat * 0.8),
          },
        );
      } else if (isUpperA) {
        exercises.push(
          {
            name: 'Bench Press',
            lift: 'bench' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
            sets: setsConfig[0].sets,
            reps: setsConfig[0].reps,
            targetWeight: calculateTargetWeight(
              oneRMs.bench,
              weekInWave,
              session,
              'bench',
              trainingMaxes.bench,
            ),
            isAmrap: setsConfig[0].isAmrap,
          },
          {
            name: 'Barbell Row',
            lift: 'row' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['row'],
            sets: setsConfig[1].sets,
            reps: setsConfig[1].reps,
            targetWeight: calculateTargetWeight(
              oneRMs.bench,
              weekInWave,
              session,
              'row',
              trainingMaxes.bench,
            ),
            isAmrap: setsConfig[1].isAmrap,
          },
          {
            name: 'Pull-ups',
            lift: 'row' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['row'],
            sets: 3,
            reps: 8,
            targetWeight: 0,
          },
          {
            name: 'Tricep Pushdowns',
            lift: 'bench' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
            sets: 3,
            reps: 12,
            targetWeight: roundToPlate(oneRMs.bench * 0.25),
          },
          {
            name: 'Face Pulls',
            lift: 'ohp' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
            sets: 3,
            reps: 15,
            targetWeight: roundToPlate(oneRMs.ohp * 0.2),
          },
        );
      } else {
        exercises.push(
          {
            name: 'Deadlift',
            lift: 'deadlift' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
            sets: setsConfig[0].sets,
            reps: setsConfig[0].reps,
            targetWeight: calculateTargetWeight(
              oneRMs.deadlift,
              weekInWave,
              session,
              'deadlift',
              trainingMaxes.deadlift,
            ),
            isAmrap: setsConfig[0].isAmrap,
          },
          {
            name: 'Overhead Press',
            lift: 'ohp' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
            sets: setsConfig[1].sets,
            reps: setsConfig[1].reps,
            targetWeight: calculateTargetWeight(
              oneRMs.ohp,
              weekInWave,
              session,
              'ohp',
              trainingMaxes.ohp,
            ),
            isAmrap: setsConfig[1].isAmrap,
          },
          {
            name: 'Walking Lunges',
            lift: 'squat' as const,
            libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
            sets: 3,
            reps: 10,
            targetWeight: roundToPlate(oneRMs.squat * 0.35),
          },
        );
      }

      workouts.push({
        weekNumber: week,
        sessionNumber: workoutIndex,
        sessionName: isLowerA ? 'Lower A' : isUpperA ? 'Upper A' : 'Full Body',
        exercises,
      });
    }
  }

  for (const workout of workouts) {
    const accessories = getMegsquatsAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const megsquats: ProgramConfig = {
  info: megsquatsInfo,
  generateWorkouts,
  calculateTargetWeight: (estimatedOneRM: number, week: number, session: number, lift: LiftType) =>
    calculateTargetWeight(estimatedOneRM, week, session, lift, estimatedOneRM * 0.85),
};

export default megsquats;
