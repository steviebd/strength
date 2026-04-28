import * as schema from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';

const router = createRouter();

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    let body: {
      date?: string;
      type?: string;
      trainingType?: string;
      customLabel?: string;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    const trainingType = body.trainingType ?? body.type;
    const { customLabel } = body;

    if (!trainingType) {
      return c.json({ error: 'trainingType is required' }, 400);
    }

    const validTypes = ['rest_day', 'cardio', 'powerlifting', 'custom'];
    if (!validTypes.includes(trainingType)) {
      return c.json({ error: 'Invalid trainingType' }, 400);
    }

    const now = new Date();
    const result = await db
      .insert(schema.nutritionTrainingContext)
      .values({
        userId,
        trainingType,
        customLabel: customLabel ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.nutritionTrainingContext.userId,
        set: {
          trainingType,
          customLabel: customLabel ?? null,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    return c.json({
      trainingType: result.trainingType,
      customLabel: result.customLabel,
    });
  }),
);

export default router;
