import { describe, expect, it } from 'vitest';
import {
  assembleStructuredNutritionContext,
  assembleSystemPrompt,
  compactNutritionChatHistoryMessage,
  type NutritionAssistantContext,
  type SystemPromptContext,
} from './nutrition-prompts';

const systemContext: SystemPromptContext = {
  bodyweightKg: 92.5,
  energyUnit: 'kcal',
  weightUnit: 'kg',
  trainingContext: {
    type: 'powerlifting',
    programName: 'Meet prep',
    sessionName: 'Heavy squat',
    targetLifts: 'Squat triples',
  },
  whoopData: {
    recoveryScore: 74,
    recoveryStatus: 'green',
    hrv: 58,
    restingHeartRate: 51,
    caloriesBurned: 420,
    totalStrain: 12.4,
  },
  dailyIntake: {
    totalCalories: 1200,
    totalProteinG: 90,
    totalCarbsG: 130,
    totalFatG: 35,
  },
  macroTargets: {
    calories: 2800,
    proteinG: 185,
    carbsG: 320,
    fatG: 80,
  },
};

const assistantContext: NutritionAssistantContext = {
  ...systemContext,
  date: '2026-04-24',
  hasActiveProgram: true,
};

describe('nutrition prompts', () => {
  it('omits verbose daily context sections from the system prompt', () => {
    const prompt = assembleSystemPrompt(systemContext);

    expect(prompt).not.toContain('DAILY INTAKE SO FAR');
    expect(prompt).not.toContain('MACRO TARGETS');
    expect(prompt).not.toContain('RECOVERY (from Whoop)');
    expect(prompt).not.toContain("TODAY'S TRAINING");
  });

  it('keeps behavior rules and the compact context key legend', () => {
    const prompt = assembleSystemPrompt(systemContext);

    expect(prompt).toContain('name, mealType, calories, proteinG, carbsG, fatG');
    expect(prompt).toContain('Breakfast, Lunch, Dinner, Snack');
    expect(prompt).toContain('Daily Progress Update');
    expect(prompt).toContain('Remaining meal targets');
    expect(prompt).toContain(
      'Context keys: d=date, u=user, tr=training, w=Whoop, in=intake so far, t=targets',
    );
  });

  it('emits minified compact context with required facts preserved', () => {
    const contextPrompt = assembleStructuredNutritionContext(assistantContext);

    expect(contextPrompt).toMatch(/^NUTRITION_CONTEXT_JSON:\{/);
    expect(contextPrompt).not.toContain('\n');

    const parsed = JSON.parse(contextPrompt.replace('NUTRITION_CONTEXT_JSON:', ''));
    expect(parsed).toEqual({
      d: '2026-04-24',
      u: {
        bwKg: 92.5,
        energy: 'kcal',
        weight: 'kg',
        program: true,
      },
      tr: {
        type: 'powerlifting',
        program: 'Meet prep',
        session: 'Heavy squat',
        lifts: 'Squat triples',
      },
      w: {
        rec: 74,
        tier: 'green',
        hrv: 58,
        rhr: 51,
        burn: 420,
        strain: 12.4,
      },
      in: {
        cal: 1200,
        p: 90,
        c: 130,
        f: 35,
      },
      t: {
        cal: 2800,
        p: 185,
        c: 320,
        f: 80,
      },
    });
  });

  it('omits null Whoop fields but keeps w null when no Whoop data exists', () => {
    const withPartialWhoop = assembleStructuredNutritionContext({
      ...assistantContext,
      whoopData: {
        recoveryScore: 74,
        recoveryStatus: null,
        hrv: null,
        restingHeartRate: null,
        caloriesBurned: null,
        totalStrain: null,
      },
    });
    const partial = JSON.parse(withPartialWhoop.replace('NUTRITION_CONTEXT_JSON:', ''));
    expect(partial.w).toEqual({ rec: 74 });

    const withoutWhoop = assembleStructuredNutritionContext({
      ...assistantContext,
      whoopData: {
        recoveryScore: null,
        recoveryStatus: null,
        hrv: null,
        restingHeartRate: null,
        caloriesBurned: null,
        totalStrain: null,
      },
    });
    const empty = JSON.parse(withoutWhoop.replace('NUTRITION_CONTEXT_JSON:', ''));
    expect(empty.w).toBeNull();
  });

  it('compresses prior assistant meal JSON into a short marker', () => {
    const compressed = compactNutritionChatHistoryMessage({
      role: 'assistant',
      content: `Estimate:
\`\`\`json
{
  "name": "Chicken rice bowl",
  "mealType": "Lunch",
  "calories": 640,
  "proteinG": 48,
  "carbsG": 72,
  "fatG": 16
}
\`\`\``,
    });

    expect(compressed).toEqual({
      role: 'assistant',
      content: '[Assistant estimated meal: Chicken rice bowl, Lunch, 640 kcal, P48 C72 F16]',
    });
  });

  it('strips prior assistant machine JSON when no valid meal analysis is present', () => {
    const compressed = compactNutritionChatHistoryMessage({
      role: 'assistant',
      content: `Use carbs before training.
\`\`\`json
{"note":"not a meal"}
\`\`\``,
    });

    expect(compressed).toEqual({
      role: 'assistant',
      content: 'Use carbs before training.',
    });
  });
});
