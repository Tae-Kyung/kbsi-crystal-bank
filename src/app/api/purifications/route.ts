import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { purificationCreateSchema } from '@/lib/validations/protein';

export const GET = createListHandler('kbsi_purification');
export const POST = createInsertHandler('kbsi_purification', purificationCreateSchema);
