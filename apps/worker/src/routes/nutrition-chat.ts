import { createRouter } from '../lib/router';
import { chatHandler, getChatHistoryHandler, getChatJobHandler } from '../api/nutrition/chat';

const router = createRouter();

router.post('/chat', chatHandler);
router.get('/chat/jobs/:id', getChatJobHandler);
router.get('/chat/history', getChatHistoryHandler);

export default router;
