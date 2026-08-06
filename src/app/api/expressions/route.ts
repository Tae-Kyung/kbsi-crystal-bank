import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { expressionCreateSchema } from '@/lib/validations/protein';

export const GET = createListHandler('kbsi_expression');
export const POST = createInsertHandler('kbsi_expression', expressionCreateSchema);
