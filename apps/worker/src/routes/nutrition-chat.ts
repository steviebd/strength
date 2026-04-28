import { createRouter } from '../lib/router';
import { chatHandler, getChatHistoryHandler } from '../api/nutrition/chat';

const router = createRouter();

router.post('/chat', chatHandler);
router.get('/chat/history', getChatHistoryHandler);

export default router;
