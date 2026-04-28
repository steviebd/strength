import { createRouter } from '../lib/router';
import { dailySummaryHandler } from '../api/nutrition/daily-summary';

const router = createRouter();

router.get('/daily-summary', dailySummaryHandler);

export default router;
