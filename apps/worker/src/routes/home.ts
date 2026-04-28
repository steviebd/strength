import { createRouter } from '../lib/router';
import { homeSummaryHandler } from '../api/home/summary';

const router = createRouter();

router.get('/summary', homeSummaryHandler);

export default router;
