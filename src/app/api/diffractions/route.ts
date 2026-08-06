import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { diffractionCreateSchema } from '@/lib/validations/protein';

export const GET = createListHandler('kbsi_diffraction');
export const POST = createInsertHandler('kbsi_diffraction', diffractionCreateSchema);
