import { generateWorkoutAccessories } from './accessory-data';
import type {
  OneRMValues,
  ProgramConfig,
  ProgramInfo,
  ProgramWorkout,
  ProgramAccessory,
} from './types';

export interface LinearProgramGeneratorConfig {
  info: ProgramInfo;
  weeks: number;
  daysPerWeek: number;
  buildExercises: (params: {
    week: number;
    day: number;
    oneRMs: OneRMValues;
    weekNumber: number;
    sessionNumber: number;
    workoutIndex: number;
  }) => ProgramWorkout['exercises'];
  getAccessories?: (week: number, session: number) => ProgramAccessory[];
  calculateTargetWeight: (
    estimatedOneRM: number,
    week: number,
    session: number,
    lift: string,
  ) => number;
  getSessionName?: (params: {
    week: number;
    day: number;
    weekNumber: number;
    sessionNumber: number;
  }) => string;
  getWeekNumber?: (week: number) => number;
  getSessionNumber?: (params: {
    week: number;
    day: number;
    weekNumber: number;
    workoutIndex: number;
  }) => number;
}

export function createLinearProgramGenerator(config: LinearProgramGeneratorConfig): ProgramConfig {
  function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
    const workouts: ProgramWorkout[] = [];
    let workoutIndex = 0;

    for (let week = 1; week <= config.weeks; week++) {
      const weekNumber = config.getWeekNumber ? config.getWeekNumber(week) : week;
      for (let day = 1; day <= config.daysPerWeek; day++) {
        workoutIndex++;
        const sessionNumber = config.getSessionNumber
          ? config.getSessionNumber({ week, day, weekNumber, workoutIndex })
          : (week - 1) * config.daysPerWeek + day;
        const sessionName = config.getSessionName
          ? config.getSessionName({ week, day, weekNumber, sessionNumber })
          : `Week ${weekNumber} - Workout ${day}`;

        const exercises = config.buildExercises({
          week,
          day,
          oneRMs,
          weekNumber,
          sessionNumber,
          workoutIndex,
        });

        workouts.push({
          weekNumber,
          sessionNumber,
          sessionName,
          exercises,
        });
      }
    }

    if (config.getAccessories) {
      for (const workout of workouts) {
        const accessories = config.getAccessories(workout.weekNumber, workout.sessionNumber);
        if (accessories.length > 0) {
          workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
        }
      }
    }

    return workouts;
  }

  return {
    info: config.info,
    generateWorkouts,
    calculateTargetWeight: config.calculateTargetWeight,
    getAccessories: config.getAccessories,
  };
}
