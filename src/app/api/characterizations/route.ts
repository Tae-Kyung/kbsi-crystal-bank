import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { characterizationCreateSchema } from '@/lib/validations/protein';

export const GET = createListHandler('kbsi_characterization');
export const POST = createInsertHandler('kbsi_characterization', characterizationCreateSchema);
