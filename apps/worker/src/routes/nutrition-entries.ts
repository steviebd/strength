import { createRouter } from '../lib/router';
import { getEntriesHandler, createEntryHandler } from '../api/nutrition/entries';

const router = createRouter();

router.get('/', getEntriesHandler);
router.post('/', createEntryHandler);

export default router;
