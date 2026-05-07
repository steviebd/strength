import { createRouter } from '../lib/router';
import { getEntriesHandler, createEntryHandler } from '../api/nutrition/entries';
import {
  getEntryHandler,
  updateEntryHandler,
  deleteEntryHandler,
} from '../api/nutrition/entries.$id';
import { dailySummaryHandler } from '../api/nutrition/daily-summary';
import { chatHandler, getChatHistoryHandler, getChatJobHandler } from '../api/nutrition/chat';
import {
  getBodyStatsHandler,
  upsertBodyStatsHandler,
  getBodyweightHistoryHandler,
} from '../api/nutrition/body-stats';
import { upsertTrainingContextHandler } from '../api/nutrition/training-context';

const router = createRouter();

router.get('/entries', getEntriesHandler);
router.post('/entries', createEntryHandler);
router.get('/entries/:id', getEntryHandler);
router.put('/entries/:id', updateEntryHandler);
router.delete('/entries/:id', deleteEntryHandler);
router.get('/daily-summary', dailySummaryHandler);
router.post('/chat', chatHandler);
router.get('/chat/jobs/:id', getChatJobHandler);
router.get('/chat/history', getChatHistoryHandler);
router.get('/body-stats', getBodyStatsHandler);
router.post('/body-stats', upsertBodyStatsHandler);
router.get('/bodyweight-history', getBodyweightHistoryHandler);
router.post('/training-context', upsertTrainingContextHandler);

export default router;
