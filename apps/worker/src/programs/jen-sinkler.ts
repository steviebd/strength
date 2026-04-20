import { roundToPlate } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { jenSinklerInfo, getJenSinklerAccessories } from './config/jen-sinkler';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
): number {
  const basePercentage = 0.7;
  const weeklyIncrease = 0.025;
  const progression = (week - 1) * 3 + session;
  const weight = estimatedOneRM * (basePercentage + progression * weeklyIncrease);
  return roundToPlate(weight);
}

export function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];
  let workoutIndex = 0;

  for (let week = 1; week <= 8; week++) {
    for (let session = 1; session <= 3; session++) {
      workoutIndex++;
      const exercises: ProgramWorkout['exercises'] = [];

      if (session === 1) {
        exercises.push(
          {
            name: 'Squat',
            lift: 'squat' as const,
            sets: 5,
            reps: 5,
            targetWeight: calculateTargetWeight(oneRMs.squat, week, session, 'squat'),
          },
          {
            name: 'Deadlift',
            lift: 'deadlift' as const,
            sets: 3,
            reps: 5,
            targetWeight: calculateTargetWeight(oneRMs.deadlift, week, session, 'deadlift'),
          },
          {
            name: 'Leg Press',
            lift: 'squat' as const,
            sets: 3,
            reps: 12,
            targetWeight: roundToPlate(oneRMs.squat * 0.7),
          },
          {
            name: 'Leg Extension',
            lift: 'squat' as const,
            sets: 3,
            reps: 15,
            targetWeight: roundToPlate(oneRMs.squat * 0.35),
          },
          {
            name: 'Leg Curl',
            lift: 'deadlift' as const,
            sets: 3,
            reps: 15,
            targetWeight: roundToPlate(oneRMs.deadlift * 0.3),
          },
        );
      } else if (session === 2) {
        exercises.push(
          {
            name: 'Bench Press',
            lift: 'bench' as const,
            sets: 5,
            reps: 5,
            targetWeight: calculateTargetWeight(oneRMs.bench, week, session, 'bench'),
          },
          {
            name: 'Barbell Row',
            lift: 'row' as const,
            sets: 4,
            reps: 6,
            targetWeight: calculateTargetWeight(oneRMs.bench, week, session, 'row'),
          },
          {
            name: 'Overhead Press',
            lift: 'ohp' as const,
            sets: 4,
            reps: 8,
            targetWeight: calculateTargetWeight(oneRMs.ohp, week, session, 'ohp'),
          },
          {
            name: 'Pull-ups',
            lift: 'row' as const,
            sets: 3,
            reps: 8,
            targetWeight: 0,
          },
          {
            name: 'Tricep Pushdowns',
            lift: 'bench' as const,
            sets: 3,
            reps: 12,
            targetWeight: roundToPlate(oneRMs.bench * 0.25),
          },
          {
            name: 'Lateral Raises',
            lift: 'ohp' as const,
            sets: 3,
            reps: 15,
            targetWeight: roundToPlate(oneRMs.ohp * 0.15),
          },
        );
      } else {
        exercises.push(
          {
            name: 'Overhead Press',
            lift: 'ohp' as const,
            sets: 4,
            reps: 6,
            targetWeight: calculateTargetWeight(oneRMs.ohp, week, session, 'ohp'),
          },
          {
            name: 'Front Squat',
            lift: 'squat' as const,
            sets: 4,
            reps: 8,
            targetWeight: roundToPlate(oneRMs.squat * 0.6),
          },
          {
            name: 'Romanian Deadlift',
            lift: 'deadlift' as const,
            sets: 4,
            reps: 8,
            targetWeight: roundToPlate(oneRMs.deadlift * 0.65),
          },
          {
            name: 'Dumbbell Bench Press',
            lift: 'bench' as const,
            sets: 3,
            reps: 10,
            targetWeight: roundToPlate(oneRMs.bench * 0.5),
          },
          {
            name: 'Dumbbell Row',
            lift: 'row' as const,
            sets: 3,
            reps: 10,
            targetWeight: roundToPlate(oneRMs.bench * 0.4),
          },
        );
      }

      workouts.push({
        weekNumber: week,
        sessionNumber: workoutIndex,
        sessionName:
          session === 1 ? 'Lower Strength' : session === 2 ? 'Upper Strength' : 'Full Body',
        exercises,
      });
    }
  }

  for (const workout of workouts) {
    const accessories = getJenSinklerAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const jenSinkler: ProgramConfig = {
  info: jenSinklerInfo,
  generateWorkouts,
  calculateTargetWeight,
};

export default jenSinkler;
