import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { crystallizationCreateSchema } from '@/lib/validations/protein';

export const GET = createListHandler('kbsi_crystallization');
export const POST = createInsertHandler('kbsi_crystallization', crystallizationCreateSchema);
