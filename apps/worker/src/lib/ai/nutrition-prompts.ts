export interface TrainingContext {
  type: 'rest_day' | 'cardio' | 'powerlifting' | 'custom';
  customLabel?: string;
  programName?: string;
  sessionName?: string;
  targetLifts?: string;
}

export interface WhoopData {
  recoveryScore: number | null;
  recoveryStatus: string | null;
  hrv: number | null;
  restingHeartRate: number | null;
  caloriesBurned: number | null;
  totalStrain: number | null;
}

export interface DailyIntake {
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface SystemPromptContext {
  bodyweightKg: number | null;
  energyUnit: 'kcal' | 'kj';
  weightUnit: 'kg' | 'lbs';
  timezone: string;
  trainingContext: TrainingContext | null;
  whoopData: WhoopData;
  dailyIntake: DailyIntake;
  macroTargets: MacroTargets;
}

export interface NutritionAssistantContext extends SystemPromptContext {
  date: string;
  hasActiveProgram: boolean;
}

const MACHINE_JSON_BLOCK_REGEX = /```(?:json)?\s*\n([\s\S]*?)\n```/gi;

interface CompactObject {
  [key: string]: unknown;
}

function addIfPresent(target: CompactObject, key: string, value: unknown) {
  if (value !== null && value !== undefined && value !== '') {
    target[key] = value;
  }
}

function compactTrainingContext(tc: TrainingContext | null): CompactObject | null {
  if (!tc) return null;

  const compact: CompactObject = {
    type: tc.type,
  };
  addIfPresent(compact, 'label', tc.customLabel);
  addIfPresent(compact, 'program', tc.programName);
  addIfPresent(compact, 'session', tc.sessionName);
  addIfPresent(compact, 'lifts', tc.targetLifts);
  return compact;
}

function compactWhoopData(data: WhoopData): CompactObject | null {
  const compact: CompactObject = {};
  addIfPresent(compact, 'rec', data.recoveryScore);
  addIfPresent(compact, 'tier', data.recoveryStatus);
  addIfPresent(compact, 'hrv', data.hrv);
  addIfPresent(compact, 'rhr', data.restingHeartRate);
  addIfPresent(compact, 'burn', data.caloriesBurned);
  addIfPresent(compact, 'strain', data.totalStrain);

  return Object.keys(compact).length > 0 ? compact : null;
}

export function assembleSystemPrompt(_context: SystemPromptContext): string {
  return `You are a nutrition assistant for a powerlifter using the Fit workout app.
Use NUTRITION_CONTEXT_JSON for user facts, targets, training, recovery, and intake.
Context keys: d=date, u=user, tr=training, w=Whoop, in=intake so far, t=targets; cal=calories, p=proteinG, c=carbsG, f=fatG, tz=timezone.
Do not ask for bodyweight if context.u.bwKg is non-null.
When estimating/logging food, include one JSON code block like:
\u0060\u0060\u0060json
{
  "name": "meal name",
  "mealType": "Breakfast",
  "calories": 123,
  "proteinG": 45,
  "carbsG": 30,
  "fatG": 15
}
\u0060\u0060\u0060
Use the exact field names: name, mealType, calories, proteinG, carbsG, fatG.
mealType must be one of: Breakfast, Lunch, Dinner, Snack.
The app uses this JSON for logging and renders it separately, so do not repeat the same JSON fields as raw prose.
Do not include sections titled "Daily Progress Update" or "Remaining meal targets" in chat responses.
Keep exact daily totals and target math out of prose unless the user explicitly asks; the app dashboard calculates and displays daily progress.
For strategy guidance, use short concise bullets.
Respond in context.u.energy.`.trim();
}

export function assembleStructuredNutritionContext(context: NutritionAssistantContext): string {
  return `NUTRITION_CONTEXT_JSON:${JSON.stringify({
    d: context.date,
    u: {
      bwKg: context.bodyweightKg,
      energy: context.energyUnit,
      weight: context.weightUnit,
      program: context.hasActiveProgram,
      tz: context.timezone,
    },
    tr: compactTrainingContext(context.trainingContext),
    w: compactWhoopData(context.whoopData),
    in: {
      cal: context.dailyIntake.totalCalories,
      p: context.dailyIntake.totalProteinG,
      c: context.dailyIntake.totalCarbsG,
      f: context.dailyIntake.totalFatG,
    },
    t: {
      cal: context.macroTargets.calories,
      p: context.macroTargets.proteinG,
      c: context.macroTargets.carbsG,
      f: context.macroTargets.fatG,
    },
  })}`;
}

interface ParsedMealAnalysis {
  name: string;
  mealType?: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

function parseMealAnalysisFromContent(content: string): ParsedMealAnalysis | null {
  MACHINE_JSON_BLOCK_REGEX.lastIndex = 0;

  for (const match of content.matchAll(MACHINE_JSON_BLOCK_REGEX)) {
    const rawJson = match[1];
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.name === 'string' &&
        typeof parsed.calories === 'number' &&
        Number.isFinite(parsed.calories)
      ) {
        return parsed as ParsedMealAnalysis;
      }
    } catch {}
  }

  return null;
}

function stripMachineJsonFromAssistantText(content: string): string {
  return content
    .replace(MACHINE_JSON_BLOCK_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function compactNutritionChatHistoryMessage(message: { role: string; content: string }): {
  role: 'user' | 'assistant';
  content: string;
} {
  const role = message.role as 'user' | 'assistant';

  if (role !== 'assistant') {
    return { role, content: message.content };
  }

  const analysis = parseMealAnalysisFromContent(message.content);
  if (!analysis) {
    return { role, content: stripMachineJsonFromAssistantText(message.content) || message.content };
  }

  const mealType = analysis.mealType ? `${analysis.mealType}, ` : '';
  const protein = analysis.proteinG ?? 0;
  const carbs = analysis.carbsG ?? 0;
  const fat = analysis.fatG ?? 0;

  return {
    role,
    content: `[Assistant estimated meal: ${analysis.name}, ${mealType}${analysis.calories} kcal, P${protein} C${carbs} F${fat}]`,
  };
}
