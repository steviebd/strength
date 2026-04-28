import { streamText } from 'ai';
import { eq, and, desc, gte, lt, sql } from 'drizzle-orm';
import { getModel } from '../../lib/ai';
import { checkRateLimit, getRateLimitPerHour } from '../../lib/rate-limit';
import {
  assembleSystemPrompt,
  assembleStructuredNutritionContext,
  compactNutritionChatHistoryMessage,
  type SystemPromptContext,
  type NutritionAssistantContext,
  type TrainingContext,
  type DailyIntake,
} from '../../lib/ai/nutrition-prompts';
import * as schema from '@strength/db';
import { createHandler } from '../auth';
import { formatLocalDate } from '@strength/db';
import { getUtcRangeForLocalDate, resolveUserTimezone } from '../../lib/timezone';
import { getWhoopDataForDay } from '../../lib/whoop-queries';
import { calculateMacroTargets } from '../../lib/nutrition';

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  date?: string;
  hasImage: boolean;
  imageBase64?: string;
  timezone?: string;
}

interface ChatHistoryQuery {
  date: string;
  limit?: string;
  before?: string;
}

function isE2ENutritionMockEnabled(env: { APP_ENV?: string; E2E_TEST_MODE?: string }) {
  return env.APP_ENV === 'development' && env.E2E_TEST_MODE === 'true';
}

function buildMockMealAnalysisContent(userMessageContent: string) {
  const normalized = userMessageContent.toLowerCase();
  const isBigMacMeal = normalized.includes('big mac') || normalized.includes('fries');
  const analysis = isBigMacMeal
    ? {
        name: 'Large Big Mac and Fries',
        calories: 1320,
        proteinG: 34,
        carbsG: 156,
        fatG: 63,
        confidence: 'medium',
        mealType: 'Lunch',
      }
    : {
        name: 'E2E Test Meal',
        calories: 600,
        proteinG: 35,
        carbsG: 65,
        fatG: 20,
        confidence: 'medium',
        mealType: 'Snack',
      };

  return [
    `${analysis.name}: ${analysis.calories} kcal, ${analysis.proteinG}g protein, ${analysis.carbsG}g carbs, ${analysis.fatG}g fat.`,
    '',
    '```json',
    JSON.stringify(analysis, null, 2),
    '```',
  ].join('\n');
}

async function streamMockNutritionResponse({
  db,
  userId,
  userMessageContent,
}: {
  db: any;
  userId: string;
  userMessageContent: string;
}) {
  const content = buildMockMealAnalysisContent(userMessageContent);
  await db.insert(schema.nutritionChatMessages).values({
    userId,
    role: 'assistant',
    content,
    hasImage: false,
    createdAt: new Date(),
  });

  const textEncoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        textEncoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text: content })}\n\n`),
      );
      controller.enqueue(textEncoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export const chatHandler = createHandler(async (c, { userId, db }) => {
  let body: ChatRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const rateLimit = await checkRateLimit(db, userId, 'nutrition-chat', getRateLimitPerHour(c.env));
  if (!rateLimit.allowed) {
    return c.json({ message: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter }, 429);
  }

  const { messages, date: requestedDate, hasImage, imageBase64 } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'Messages are required' }, 400);
  }

  const imageCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.nutritionChatMessages)
    .where(
      and(
        eq(schema.nutritionChatMessages.userId, userId),
        eq(schema.nutritionChatMessages.hasImage, true),
        gte(schema.nutritionChatMessages.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    )
    .get();

  if ((imageCount?.count ?? 0) >= 50 && hasImage) {
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const prefs = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .get();

  const bodyStats = await db
    .select()
    .from(schema.userBodyStats)
    .where(eq(schema.userBodyStats.userId, userId))
    .get();

  const activeProgram = await db
    .select()
    .from(schema.userProgramCycles)
    .where(
      and(
        eq(schema.userProgramCycles.userId, userId),
        eq(schema.userProgramCycles.status, 'active'),
      ),
    )
    .get();

  const energyUnit = (prefs?.weightUnit === 'lbs' ? 'kj' : 'kcal') as 'kcal' | 'kj';
  const weightUnit = (prefs?.weightUnit as 'kg' | 'lbs') ?? 'kg';
  const timezoneResult = await resolveUserTimezone(db, userId);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }
  const timezone = timezoneResult.timezone;
  const date =
    requestedDate === undefined
      ? formatLocalDate(new Date(), timezone)
      : /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : null;
  if (!date) {
    return c.json({ error: 'Valid date (YYYY-MM-DD) is required' }, 400);
  }
  const bodyweightKg = bodyStats?.bodyweightKg ?? null;
  const hasProgram = !!activeProgram;

  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(date, timezone);

  const entries = await db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.userId, userId),
        gte(schema.nutritionEntries.loggedAt, startOfDay),
        lt(schema.nutritionEntries.loggedAt, endOfDay),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .all();

  const totalCalories = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
  const totalProteinG = entries.reduce((sum, e) => sum + (e.proteinG ?? 0), 0);
  const totalCarbsG = entries.reduce((sum, e) => sum + (e.carbsG ?? 0), 0);
  const totalFatG = entries.reduce((sum, e) => sum + (e.fatG ?? 0), 0);

  const trainingContextRow = await db
    .select()
    .from(schema.nutritionTrainingContext)
    .where(
      and(
        eq(schema.nutritionTrainingContext.userId, userId),
        gte(schema.nutritionTrainingContext.createdAt, startOfDay),
        lt(schema.nutritionTrainingContext.createdAt, endOfDay),
      ),
    )
    .get();

  const trainingCtx: TrainingContext | null = trainingContextRow
    ? {
        type: trainingContextRow.trainingType as TrainingContext['type'],
        customLabel: trainingContextRow.customLabel ?? undefined,
      }
    : null;

  const whoopData = await getWhoopDataForDay(db, userId, date, timezone);

  const macroTargets = calculateMacroTargets(
    bodyweightKg ?? 80,
    trainingCtx?.type ?? null,
    bodyStats?.targetCalories ?? 2500,
    {
      targetCalories: bodyStats?.targetCalories ?? undefined,
      targetProteinG: bodyStats?.targetProteinG ?? undefined,
      targetCarbsG: bodyStats?.targetCarbsG ?? undefined,
      targetFatG: bodyStats?.targetFatG ?? undefined,
    },
  );

  const dailyIntake: DailyIntake = {
    totalCalories,
    totalProteinG,
    totalCarbsG,
    totalFatG,
  };

  const systemContext: SystemPromptContext = {
    bodyweightKg,
    energyUnit,
    weightUnit,
    trainingContext: trainingCtx,
    whoopData,
    dailyIntake,
    macroTargets,
  };

  const assistantContext: NutritionAssistantContext = {
    ...systemContext,
    date,
    hasActiveProgram: hasProgram,
  };

  const systemPrompt = assembleSystemPrompt(systemContext);
  const structuredContextPrompt = assembleStructuredNutritionContext(assistantContext);

  const userMessageContent = messages[messages.length - 1].content;
  const hasImageFlag = hasImage && !!imageBase64;

  await db.insert(schema.nutritionChatMessages).values({
    userId,
    role: 'user',
    content: userMessageContent,
    hasImage: hasImageFlag,
    createdAt: new Date(),
  });

  if (isE2ENutritionMockEnabled(c.env)) {
    return streamMockNutritionResponse({ db, userId, userMessageContent });
  }

  let userContent:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>;
  if (hasImage && imageBase64) {
    userContent = [
      { type: 'text', text: userMessageContent },
      { type: 'image', image: imageBase64 },
    ];
  } else {
    userContent = userMessageContent;
  }

  const systemMessage = { role: 'system' as const, content: systemPrompt };
  const structuredContextMessage = {
    role: 'system' as const,
    content: structuredContextPrompt,
  };
  const priorMessages = messages.slice(0, -1).map(compactNutritionChatHistoryMessage);
  const userMessage = { role: 'user' as const, content: userContent };
  const aiMessages = [systemMessage, structuredContextMessage, ...priorMessages, userMessage];
  const model = getModel(c.env);

  const result = streamText({
    model,
    messages: aiMessages,
  });

  let fullResponseText = '';
  const textEncoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of result.fullStream) {
          if (isClosed) break;
          if (delta.type === 'error') {
            throw delta.error instanceof Error ? delta.error : new Error(String(delta.error));
          }
          if (delta.type === 'text-delta') {
            fullResponseText += delta.text;
          }
          if (!isClosed) {
            const bytes = textEncoder.encode(`data: ${JSON.stringify(delta)}\n\n`);
            controller.enqueue(bytes);
          }
        }
        if (!isClosed) {
          controller.enqueue(textEncoder.encode('data: [DONE]\n\n'));
          controller.close();
        }

        if (fullResponseText.trim()) {
          await db.insert(schema.nutritionChatMessages).values({
            userId,
            role: 'assistant',
            content: fullResponseText,
            hasImage: false,
            createdAt: new Date(),
          });
        }
      } catch (err) {
        if (!isClosed) {
          controller.error(err);
        }
      }
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

export const getChatHistoryHandler = createHandler(async (c, { userId, db }) => {
  const { date, limit: limitParam, before } = c.req.query() as unknown as ChatHistoryQuery;
  const timezoneResult = await resolveUserTimezone(db, userId);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return c.json({ error: timezoneResult.error }, 400);
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Valid date (YYYY-MM-DD) is required' }, 400);
  }

  const parsedLimit = Number.parseInt(limitParam ?? '5', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 5;
  const beforeTimestamp = before ? Number.parseInt(before, 10) : Number.NaN;

  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(
    date,
    timezoneResult.timezone,
  );

  const filters = [
    eq(schema.nutritionChatMessages.userId, userId),
    gte(schema.nutritionChatMessages.createdAt, startOfDay),
    lt(schema.nutritionChatMessages.createdAt, endOfDay),
  ];

  if (Number.isFinite(beforeTimestamp)) {
    filters.push(lt(schema.nutritionChatMessages.createdAt, new Date(beforeTimestamp)));
  }

  const rows = await db
    .select({
      id: schema.nutritionChatMessages.id,
      role: schema.nutritionChatMessages.role,
      content: schema.nutritionChatMessages.content,
      hasImage: schema.nutritionChatMessages.hasImage,
      createdAt: schema.nutritionChatMessages.createdAt,
    })
    .from(schema.nutritionChatMessages)
    .where(and(...filters))
    .orderBy(desc(schema.nutritionChatMessages.createdAt))
    .limit(limit)
    .all();

  const messages = rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    hasImage: row.hasImage,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
  }));

  const nextCursor =
    rows.length === limit ? (rows[rows.length - 1]?.createdAt?.getTime() ?? null) : null;

  return c.json({
    messages,
    nextCursor,
    hasMore: rows.length === limit,
  });
});
