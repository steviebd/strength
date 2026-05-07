import { TRAINING_MAX_PERCENTAGE, roundToPlate, getDayLifts } from './utils';
import { nuckolsInfo, WAVE_1, WAVE_2, getNuckolsAccessories } from './config/nuckols';
import { LIFT_TYPE_LIBRARY_ID } from '../exercise-library';
import { createLinearProgramGenerator } from './factory';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
  isT2 = false,
  waveNumber = 1,
): number {
  const trainingMax = estimatedOneRM * TRAINING_MAX_PERCENTAGE;
  const wave = waveNumber === 1 ? WAVE_1 : WAVE_2;
  const weekData = wave[`week${week}` as keyof typeof wave] || wave.week1;
  const percentages = isT2 ? weekData.t2 : weekData.t1;
  const setIndex = session - 1;
  const percentage = percentages[setIndex] || percentages[0];
  return roundToPlate(trainingMax * percentage);
}

export const nuckols = createLinearProgramGenerator({
  info: nuckolsInfo,
  weeks: 8,
  daysPerWeek: 4,
  buildExercises: ({ week, day, oneRMs }): import('./types').ProgramExercise[] => {
    const wave = Math.ceil(week / 4);
    const waveWeek = ((week - 1) % 4) + 1;
    const config = getDayLifts(day);
    const t1OneRM = oneRMs[config.t1];
    const t2OneRM = oneRMs[config.t2];

    const liftName = config.t1.charAt(0).toUpperCase() + config.t1.slice(1);
    const t2LiftName = config.t2.charAt(0).toUpperCase() + config.t2.slice(1);

    const t1Sets: import('./types').ProgramWorkout['exercises'] = [
      {
        name: liftName,
        exerciseType: 'weights',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: 3,
        reps: 8,
        targetWeight: calculateTargetWeight(t1OneRM, waveWeek, 1, config.t1, false, wave),
        isAmrap: false,
      },
      {
        name: `${liftName} 2`,
        exerciseType: 'weights',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: 3,
        reps: 8,
        targetWeight: calculateTargetWeight(t1OneRM, waveWeek, 2, config.t1, false, wave),
        isAmrap: false,
      },
      {
        name: `${liftName} 3`,
        exerciseType: 'weights',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: 3,
        reps: 8,
        targetWeight: calculateTargetWeight(t1OneRM, waveWeek, 3, config.t1, false, wave),
        isAmrap: false,
      },
    ];

    const t2Sets: import('./types').ProgramWorkout['exercises'] = [
      {
        name: t2LiftName,
        exerciseType: 'weights',
        lift: config.t2,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
        sets: 3,
        reps: 10,
        targetWeight: calculateTargetWeight(t2OneRM, waveWeek, 1, config.t2, true, wave),
        isAmrap: false,
      },
      {
        name: `${t2LiftName} 2`,
        exerciseType: 'weights',
        lift: config.t2,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
        sets: 3,
        reps: 10,
        targetWeight: calculateTargetWeight(t2OneRM, waveWeek, 2, config.t2, true, wave),
        isAmrap: false,
      },
    ];

    return [...t1Sets, ...t2Sets];
  },
  getAccessories: getNuckolsAccessories,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, false, 1),
  getSessionNumber: ({ week, day }) => ((Math.ceil(week / 4) - 1) * 4 + ((week - 1) % 4)) * 4 + day,
});

export default nuckols;
