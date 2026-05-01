import { generateText } from 'ai';
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
import { createDb, createHandler } from '../auth';
import { formatLocalDate } from '@strength/db';
import { getUtcRangeForLocalDate, resolveUserTimezone } from '../../lib/timezone';
import { getWhoopDataForDay } from '../../lib/whoop-queries';
import { calculateMacroTargets } from '../../lib/nutrition';
import type { NutritionChatQueueMessage, WorkerEnv } from '../../auth';

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  date?: string;
  hasImage: boolean;
  imageBase64?: string;
  timezone?: string;
}

interface QueuedChatPayload {
  messages: ChatRequest['messages'];
  timezone?: string | null;
}

interface ChatHistoryQuery {
  date: string;
  limit?: string;
  before?: string;
  timezone?: string;
}

type ChatJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface ChatJobResponse {
  id: string;
  status: ChatJobStatus;
  content: string | null;
  error: string | null;
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

async function persistMockAssistantResponse({
  db,
  userId,
  userMessageContent,
}: {
  db: any;
  userId: string;
  userMessageContent: string;
}) {
  const content = buildMockMealAnalysisContent(userMessageContent);
  const id = crypto.randomUUID();
  await db.insert(schema.nutritionChatMessages).values({
    id,
    userId,
    role: 'assistant',
    content,
    hasImage: false,
    createdAt: new Date(),
  });
  return { content, assistantMessageId: id };
}

function validateChatMessages(messages: ChatRequest['messages']) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  return messages.every(
    (message) =>
      message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string',
  );
}

async function validateImageRateLimit({
  db,
  userId,
  hasImage,
}: {
  db: any;
  userId: string;
  hasImage: boolean;
}) {
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

  return !((imageCount?.count ?? 0) >= 50 && hasImage);
}

async function resolveChatDate({
  db,
  userId,
  requestedDate,
  requestedTimezone,
}: {
  db: any;
  userId: string;
  requestedDate: string | undefined;
  requestedTimezone?: string | null;
}) {
  const timezoneResult = await resolveUserTimezone(db, userId, requestedTimezone);
  if (timezoneResult.error || !timezoneResult.timezone) {
    return { error: timezoneResult.error ?? 'Timezone is required' };
  }

  const timezone = timezoneResult.timezone;
  const date =
    requestedDate === undefined
      ? formatLocalDate(new Date(), timezone)
      : /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : null;

  if (!date) {
    return { error: 'Valid date (YYYY-MM-DD) is required' };
  }

  return { date, timezone };
}

async function generateNutritionChatAssistantContent({
  db,
  env,
  userId,
  body,
}: {
  db: any;
  env: WorkerEnv;
  userId: string;
  body: ChatRequest;
}): Promise<{ content: string; assistantMessageId: string }> {
  const {
    messages,
    date: requestedDate,
    hasImage,
    imageBase64,
    timezone: requestedTimezone,
  } = body;
  const dateResult = await resolveChatDate({ db, userId, requestedDate, requestedTimezone });
  if (dateResult.error || !dateResult.date || !dateResult.timezone) {
    throw new Error(dateResult.error);
  }

  const { date, timezone } = dateResult;
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
  const bodyweightKg = bodyStats?.bodyweightKg ?? null;
  const hasProgram = !!activeProgram;

  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(date, timezone);

  const entries: Array<{
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  }> = await db
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
    timezone,
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

  let assistantContent: string;
  let assistantMessageId: string;

  if (isE2ENutritionMockEnabled(env)) {
    const persisted = await persistMockAssistantResponse({ db, userId, userMessageContent });
    assistantContent = persisted.content;
    assistantMessageId = persisted.assistantMessageId;
  } else {
    const model = getModel(env);
    const result = await generateText({
      model,
      messages: aiMessages,
    });
    assistantContent = result.text;
    assistantMessageId = crypto.randomUUID();

    await db.insert(schema.nutritionChatMessages).values({
      id: assistantMessageId,
      userId,
      role: 'assistant',
      content: assistantContent,
      hasImage: false,
      createdAt: new Date(),
    });
  }

  return { content: assistantContent, assistantMessageId };
}

async function readChatJob(
  db: any,
  userId: string,
  jobId: string,
): Promise<ChatJobResponse | null> {
  const job = await db
    .select({
      id: schema.nutritionChatJobs.id,
      status: schema.nutritionChatJobs.status,
      error: schema.nutritionChatJobs.error,
      assistantMessageId: schema.nutritionChatJobs.assistantMessageId,
    })
    .from(schema.nutritionChatJobs)
    .where(and(eq(schema.nutritionChatJobs.id, jobId), eq(schema.nutritionChatJobs.userId, userId)))
    .get();

  if (!job) {
    return null;
  }

  let content: string | null = null;
  if (job.assistantMessageId) {
    const message = await db
      .select({ content: schema.nutritionChatMessages.content })
      .from(schema.nutritionChatMessages)
      .where(
        and(
          eq(schema.nutritionChatMessages.id, job.assistantMessageId),
          eq(schema.nutritionChatMessages.userId, userId),
        ),
      )
      .get();
    content = message?.content ?? null;
  }

  return {
    id: job.id,
    status: job.status as ChatJobStatus,
    content,
    error: job.error ?? null,
  };
}

export const chatHandler = createHandler(async (c, { userId, db }) => {
  let body: ChatRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const {
    messages,
    date: requestedDate,
    hasImage = false,
    imageBase64,
    timezone: requestedTimezone,
  } = body;
  if (!validateChatMessages(messages)) {
    return c.json({ error: 'Messages are required' }, 400);
  }

  const rateLimit = await checkRateLimit(db, userId, 'nutrition-chat', getRateLimitPerHour(c.env));
  if (!rateLimit.allowed) {
    return c.json({ message: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter }, 429);
  }

  const hasImageFlag = hasImage && !!imageBase64;
  const imageAllowed = await validateImageRateLimit({ db, userId, hasImage: hasImageFlag });
  if (!imageAllowed) {
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const dateResult = await resolveChatDate({ db, userId, requestedDate, requestedTimezone });
  if (dateResult.error || !dateResult.date) {
    return c.json({ error: dateResult.error }, 400);
  }

  const userMessageContent = messages[messages.length - 1].content;
  await db.insert(schema.nutritionChatMessages).values({
    userId,
    role: 'user',
    content: userMessageContent,
    hasImage: hasImageFlag,
    createdAt: new Date(),
  });

  const jobId = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.nutritionChatJobs).values({
    id: jobId,
    userId,
    status: 'pending',
    messagesJson: JSON.stringify({ messages, timezone: dateResult.timezone }),
    date: dateResult.date,
    hasImage: hasImageFlag,
    imageBase64: hasImageFlag ? imageBase64 : null,
    createdAt: now,
    updatedAt: now,
  });

  if (!c.env.NUTRITION_CHAT_QUEUE) {
    await db
      .update(schema.nutritionChatJobs)
      .set({
        status: 'failed',
        error: 'Nutrition chat queue is not configured.',
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(
        and(eq(schema.nutritionChatJobs.id, jobId), eq(schema.nutritionChatJobs.userId, userId)),
      );

    return c.json({ error: 'Nutrition chat queue is not configured.' }, 500);
  }

  try {
    await c.env.NUTRITION_CHAT_QUEUE.send({ jobId });
  } catch {
    await db
      .update(schema.nutritionChatJobs)
      .set({
        status: 'failed',
        error: 'Unable to enqueue nutrition chat job.',
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(
        and(eq(schema.nutritionChatJobs.id, jobId), eq(schema.nutritionChatJobs.userId, userId)),
      );

    return c.json({ error: 'Unable to enqueue nutrition chat job.' }, 500);
  }

  return c.json({ jobId, status: 'pending' }, 202);
});

export const getChatJobHandler = createHandler(async (c, { userId, db }) => {
  const jobId = c.req.param('id');
  if (!jobId) {
    return c.json({ error: 'Job id is required' }, 400);
  }

  const job = await readChatJob(db, userId, jobId);
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});

export async function processNutritionChatJob(env: WorkerEnv, message: NutritionChatQueueMessage) {
  const db = createDb(env);
  const job = await db
    .select()
    .from(schema.nutritionChatJobs)
    .where(eq(schema.nutritionChatJobs.id, message.jobId))
    .get();

  if (!job || job.status === 'completed') {
    return;
  }

  await db
    .update(schema.nutritionChatJobs)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(schema.nutritionChatJobs.id, job.id));

  try {
    const payload = JSON.parse(job.messagesJson) as ChatRequest['messages'] | QueuedChatPayload;
    const messages = Array.isArray(payload) ? payload : payload.messages;
    const timezone = Array.isArray(payload) ? undefined : payload.timezone;
    const assistant = await generateNutritionChatAssistantContent({
      db,
      env,
      userId: job.userId,
      body: {
        messages,
        date: job.date,
        timezone: timezone ?? undefined,
        hasImage: job.hasImage ?? false,
        imageBase64: job.imageBase64 ?? undefined,
      },
    });

    if (!assistant.content.trim()) {
      throw new Error('The assistant returned an empty response.');
    }

    await db
      .update(schema.nutritionChatJobs)
      .set({
        status: 'completed',
        assistantMessageId: assistant.assistantMessageId,
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(schema.nutritionChatJobs.id, job.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nutrition chat job failed.';
    await db
      .update(schema.nutritionChatJobs)
      .set({
        status: 'failed',
        error: message,
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(schema.nutritionChatJobs.id, job.id));
  }
}

export const getChatHistoryHandler = createHandler(async (c, { userId, db }) => {
  const {
    date,
    limit: limitParam,
    before,
    timezone: requestedTimezone,
  } = c.req.query() as unknown as ChatHistoryQuery;
  const timezoneResult = await resolveUserTimezone(db, userId, requestedTimezone);
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
