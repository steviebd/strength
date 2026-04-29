import { createRouter } from '../lib/router';
import nutritionEntriesRouter from './nutrition-entries';
import nutritionEntriesIdRouter from './nutrition-entries-id';
import nutritionChatRouter from './nutrition-chat';
import nutritionDailySummaryRouter from './nutrition-daily-summary';
import nutritionBodyStatsRouter from './nutrition-body-stats';
import nutritionTrainingContextRouter from './nutrition-training-context';

const router = createRouter();

router.route('/entries', nutritionEntriesRouter);
router.route('/entries', nutritionEntriesIdRouter);
router.route('/', nutritionChatRouter);
router.route('/', nutritionDailySummaryRouter);
router.route('/body-stats', nutritionBodyStatsRouter);
router.route('/training-context', nutritionTrainingContextRouter);

export default router;
