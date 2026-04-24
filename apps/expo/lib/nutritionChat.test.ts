import { describe, expect, it } from 'vitest';
import {
  parseMealAnalysisFromContent,
  resolveMealTypeForAnalysis,
  stripMachineJsonFromAssistantText,
} from './nutritionChat';

describe('nutritionChat helpers', () => {
  it('parses current JSON blocks without mealType', () => {
    const analysis = parseMealAnalysisFromContent(`Looks like lunch.
\`\`\`json
{
  "name": "Chicken rice bowl",
  "calories": 640,
  "proteinG": 48,
  "carbsG": 72,
  "fatG": 16
}
\`\`\``);

    expect(analysis).toEqual({
      name: 'Chicken rice bowl',
      calories: 640,
      proteinG: 48,
      carbsG: 72,
      fatG: 16,
    });
  });

  it('parses new JSON blocks with valid mealType', () => {
    const analysis = parseMealAnalysisFromContent(`\`\`\`
{
  "name": "Greek yoghurt",
  "mealType": "Breakfast",
  "calories": 320
}
\`\`\``);

    expect(analysis).toEqual({
      name: 'Greek yoghurt',
      mealType: 'Breakfast',
      calories: 320,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });

  it('rejects invalid mealType while keeping meal analysis', () => {
    const analysis = parseMealAnalysisFromContent(`\`\`\`json
{
  "name": "Protein bar",
  "mealType": "Brunch",
  "calories": 260,
  "proteinG": 20
}
\`\`\``);

    expect(analysis).toEqual({
      name: 'Protein bar',
      calories: 260,
      proteinG: 20,
      carbsG: 0,
      fatG: 0,
    });
  });

  it('strips fenced JSON from visible assistant text', () => {
    const content = `Solid meal estimate.

\`\`\`json
{"name":"Wrap","calories":500}
\`\`\`

Save it if this looks right.`;

    expect(stripMachineJsonFromAssistantText(content)).toBe(
      'Solid meal estimate.\n\nSave it if this looks right.',
    );
  });

  it('leaves non-JSON assistant text unchanged', () => {
    const content = 'Powerlifting Fuel Strategy\n- Put carbs around training.';

    expect(stripMachineJsonFromAssistantText(content)).toBe(content);
  });

  it('resolves small food as Snack even when model suggests a meal', () => {
    expect(
      resolveMealTypeForAnalysis(
        {
          name: 'Apple',
          mealType: 'Lunch',
          calories: 95,
          proteinG: 0,
          carbsG: 25,
          fatG: 0,
        },
        new Date('2026-04-24T12:00:00'),
      ),
    ).toBe('Snack');
  });

  it('resolves a large late-night meal as Dinner instead of Snack', () => {
    expect(
      resolveMealTypeForAnalysis(
        {
          name: 'Steak and potatoes',
          calories: 850,
          proteinG: 60,
          carbsG: 80,
          fatG: 25,
        },
        new Date('2026-04-24T22:30:00'),
      ),
    ).toBe('Dinner');
  });

  it('uses valid model mealType when calories do not trigger correction', () => {
    expect(
      resolveMealTypeForAnalysis(
        {
          name: 'Oats',
          mealType: 'Breakfast',
          calories: 420,
          proteinG: 24,
          carbsG: 55,
          fatG: 10,
        },
        new Date('2026-04-24T12:00:00'),
      ),
    ).toBe('Breakfast');
  });

  it('falls back to time-based meal type when no valid model type exists', () => {
    expect(
      resolveMealTypeForAnalysis(
        {
          name: 'Chicken salad',
          calories: 380,
          proteinG: 38,
          carbsG: 20,
          fatG: 14,
        },
        new Date('2026-04-24T13:00:00'),
      ),
    ).toBe('Lunch');
  });
});
