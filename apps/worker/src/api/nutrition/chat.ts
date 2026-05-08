import { generateText } from 'ai';
import { eq, and, desc, gte, lt, sql } from 'drizzle-orm';
import { getModel } from '../../lib/ai';
import { checkRateLimit, getRateLimitPerHour, shouldSkipRateLimit } from '../../lib/rate-limit';
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
import { calculateMacroTargets, sumNutritionEntries } from '../../lib/nutrition';
import { validateDateParam } from '../../lib/validation';
import type { NutritionChatQueueMessage, WorkerEnv } from '../../auth';

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  date?: string;
  hasImage: boolean;
  imageBase64?: string;
  timezone?: string;
  syncOperationId?: string;
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
const AI_REQUEST_TIMEOUT_MS = 120_000;

interface ChatJobResponse {
  id: string;
  status: ChatJobStatus;
  content: string | null;
  error: string | null;
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

/**
 * Validates the image rate limit for a user.
 * NOTE: This is a soft limit with approximate enforcement. A small race
 * window exists between the count query and the subsequent user message
 * insert, so concurrent requests may occasionally exceed the limit by 1.
 */
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
  let date: string;
  if (requestedDate === undefined) {
    date = formatLocalDate(new Date(), timezone);
  } else {
    const validated = validateDateParam(requestedDate);
    if (!validated.valid) {
      return { error: 'Valid date (YYYY-MM-DD) is required' };
    }
    date = validated.date;
  }

  return { date, timezone };
}

async function generateNutritionChatAssistantContent({
  db,
  env,
  userId,
  body,
  jobId,
}: {
  db: any;
  env: WorkerEnv;
  userId: string;
  body: ChatRequest;
  jobId?: string;
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
  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(date, timezone);

  const [prefs, bodyStats, activeProgram, entries, trainingContextRow, whoopData] =
    await Promise.all([
      db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .get(),
      db.select().from(schema.userBodyStats).where(eq(schema.userBodyStats.userId, userId)).get(),
      db
        .select()
        .from(schema.userProgramCycles)
        .where(
          and(
            eq(schema.userProgramCycles.userId, userId),
            eq(schema.userProgramCycles.status, 'active'),
          ),
        )
        .get(),
      db
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
        .all() as Promise<
        Array<{
          calories: number | null;
          proteinG: number | null;
          carbsG: number | null;
          fatG: number | null;
        }>
      >,
      db
        .select()
        .from(schema.nutritionTrainingContext)
        .where(
          and(
            eq(schema.nutritionTrainingContext.userId, userId),
            gte(schema.nutritionTrainingContext.createdAt, startOfDay),
            lt(schema.nutritionTrainingContext.createdAt, endOfDay),
          ),
        )
        .get(),
      getWhoopDataForDay(db, userId, date, timezone),
    ]);

  const energyUnit = (prefs?.weightUnit === 'lbs' ? 'kj' : 'kcal') as 'kcal' | 'kj';
  const weightUnit = (prefs?.weightUnit as 'kg' | 'lbs') ?? 'kg';
  const bodyweightKg =
    bodyStats?.bodyweightKg != null ? Math.round(bodyStats.bodyweightKg * 10) / 10 : null;
  const hasProgram = !!activeProgram;

  const {
    calories: totalCalories,
    proteinG: totalProteinG,
    carbsG: totalCarbsG,
    fatG: totalFatG,
  } = sumNutritionEntries(entries);

  const trainingCtx: TrainingContext | null = trainingContextRow
    ? {
        type: trainingContextRow.trainingType as TrainingContext['type'],
        customLabel: trainingContextRow.customLabel ?? undefined,
      }
    : null;

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

  const combinedSystemPrompt = `${systemPrompt}\n\n${structuredContextPrompt}`;
  const priorMessages = messages.slice(0, -1).slice(-20).map(compactNutritionChatHistoryMessage);
  const userMessage = { role: 'user' as const, content: userContent };
  const aiMessages = [...priorMessages, userMessage];

  let assistantContent: string;
  let assistantMessageId: string;

  const model = getModel(env, {
    eventId: jobId,
    metadata: {
      feature: 'nutrition-chat',
      jobId: jobId ?? null,
    },
  });
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    console.info('[nutrition-chat] dispatching AI request', {
      jobId,
      model: env.AI_MODEL_NAME,
      hasImage,
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
    const result = await generateText({
      model,
      system: combinedSystemPrompt,
      messages: aiMessages,
      abortSignal: abortController.signal,
    });
    assistantContent = result.text;
    console.info('[nutrition-chat] AI request completed', {
      jobId,
      contentLength: assistantContent.length,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  assistantContent = assistantContent.slice(0, 10_000);
  assistantMessageId = crypto.randomUUID();

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
    syncOperationId,
  } = body;
  if (!validateChatMessages(messages)) {
    return c.json({ error: 'Messages are required' }, 400);
  }

  if (!shouldSkipRateLimit(c.env)) {
    const rateLimit = await checkRateLimit(
      db,
      userId,
      'nutrition-chat',
      getRateLimitPerHour(c.env),
    );
    if (!rateLimit.allowed) {
      return c.json({ message: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter }, 429);
    }
  }

  const hasImageFlag = hasImage && !!imageBase64;
  if (hasImageFlag && imageBase64 && imageBase64.length > 683_594) {
    return c.json({ error: 'Image too large' }, 413);
  }

  const imageAllowed = await validateImageRateLimit({ db, userId, hasImage: hasImageFlag });
  if (!imageAllowed) {
    return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const dateResult = await resolveChatDate({ db, userId, requestedDate, requestedTimezone });
  if (dateResult.error || !dateResult.date) {
    return c.json({ error: dateResult.error }, 400);
  }

  const userMessageContent = messages[messages.length - 1].content;
  const jobId = crypto.randomUUID();
  const now = new Date();

  if (syncOperationId) {
    const jobInsertResult = await db
      .insert(schema.nutritionChatJobs)
      .values({
        id: jobId,
        userId,
        status: 'pending',
        messagesJson: JSON.stringify({ messages, timezone: dateResult.timezone }),
        date: dateResult.date,
        hasImage: hasImageFlag,
        imageBase64: hasImageFlag ? imageBase64 : null,
        syncOperationId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [schema.nutritionChatJobs.userId, schema.nutritionChatJobs.syncOperationId],
      })
      .run();

    if ((jobInsertResult.meta?.changes ?? 0) === 0) {
      const existing = await db
        .select()
        .from(schema.nutritionChatJobs)
        .where(
          and(
            eq(schema.nutritionChatJobs.userId, userId),
            eq(schema.nutritionChatJobs.syncOperationId, syncOperationId),
          ),
        )
        .get();
      if (existing) {
        return c.json({ jobId: existing.id });
      }
      return c.json({ error: 'Failed to create chat job' }, 500);
    }
  } else {
    await db.insert(schema.nutritionChatJobs).values({
      id: jobId,
      userId,
      status: 'pending',
      messagesJson: JSON.stringify({ messages, timezone: dateResult.timezone }),
      date: dateResult.date,
      hasImage: hasImageFlag,
      imageBase64: hasImageFlag ? imageBase64 : null,
      syncOperationId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.insert(schema.nutritionChatMessages).values({
    userId,
    role: 'user',
    content: userMessageContent,
    hasImage: hasImageFlag,
    createdAt: new Date(),
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

  const statusUpdateResult = await db
    .update(schema.nutritionChatJobs)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(
      and(eq(schema.nutritionChatJobs.id, job.id), eq(schema.nutritionChatJobs.status, 'pending')),
    )
    .run();

  if ((statusUpdateResult.meta?.changes ?? 0) === 0) {
    return; // another worker took it
  }

  try {
    const payload = JSON.parse(job.messagesJson) as ChatRequest['messages'] | QueuedChatPayload;
    const messages = Array.isArray(payload) ? payload : payload.messages;
    const timezone = Array.isArray(payload) ? undefined : payload.timezone;
    const assistant = await generateNutritionChatAssistantContent({
      db,
      env,
      userId: job.userId,
      jobId: job.id,
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

    await db.insert(schema.nutritionChatMessages).values({
      id: assistant.assistantMessageId,
      userId: job.userId,
      role: 'assistant',
      content: assistant.content,
      hasImage: false,
      createdAt: new Date(),
    });

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
    console.error('[nutrition-chat] job failed', {
      jobId: job.id,
      error: message,
    });
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

  const validated = validateDateParam(date);
  if (!validated.valid) {
    return validated.response;
  }

  const parsedLimit = Number.parseInt(limitParam ?? '5', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 5;
  const beforeTimestamp = before ? Number.parseInt(before, 10) : Number.NaN;

  const { start: startOfDay, end: endOfDay } = getUtcRangeForLocalDate(
    validated.date,
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
