import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { structureCreateSchema } from '@/lib/validations/protein';

export const GET = createListHandler('kbsi_structure');
export const POST = createInsertHandler('kbsi_structure', structureCreateSchema);
