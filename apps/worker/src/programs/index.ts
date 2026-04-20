export * from './types';
export * from './utils';
export * from './accessory-data';
export * from './scheduler';
export * from './config';

export { stronglifts, generateWorkouts as generateStrongliftsWorkouts } from './stronglifts';
export { wendler531, generateWorkouts as generateWendler531Workouts } from './wendler531';
export { madcow, generateWorkouts as generateMadcowWorkouts } from './madcow';
export { candito, generateWorkouts as generateCanditoWorkouts } from './candito';
export { nsuns, generateWorkouts as generateNsunsWorkouts } from './nsuns';
export { sheiko, generateWorkouts as generateSheikoWorkouts } from './sheiko';
export { nuckols, generateWorkouts as generateNuckolsWorkouts } from './nuckols';
export { megsquats, generateWorkouts as generateMegsquatsWorkouts } from './megsquats';
export { jenSinkler, generateWorkouts as generateJenSinklerWorkouts } from './jen-sinkler';

import { stronglifts } from './stronglifts';
import { wendler531 } from './wendler531';
import { madcow } from './madcow';
import { candito } from './candito';
import { nsuns } from './nsuns';
import { sheiko } from './sheiko';
import { nuckols } from './nuckols';
import { megsquats } from './megsquats';
import { jenSinkler } from './jen-sinkler';
import type { ProgramConfig, ProgramSlug } from './types';

export const PROGRAMS: Record<string, ProgramConfig> = {
  'stronglifts-5x5': stronglifts,
  '531': wendler531,
  'madcow-5x5': madcow,
  'candito-6-week': candito,
  'nsuns-lp': nsuns,
  sheiko: sheiko,
  'nuckols-28-programs': nuckols,
  'stronger-by-the-day': megsquats,
  'unapologetically-strong': jenSinkler,
};

export function getProgram(slug: ProgramSlug): ProgramConfig | undefined {
  return PROGRAMS[slug];
}

export function getProgramBySlug(slug: string): ProgramConfig | undefined {
  return PROGRAMS[slug];
}
