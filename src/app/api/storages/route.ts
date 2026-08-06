import { createListHandler, createInsertHandler } from '@/lib/api-helpers';
import { z } from 'zod';

const storageCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: z.enum(['experimental', 'literature', 'database']).default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  concentration: z.number().positive().nullish(),
  volume: z.number().positive().nullish(),
  storage_buffer: z.string().nullish(),
  location: z.string().nullish(),
  purified_on: z.string().date().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

export const GET = createListHandler('kbsi_storage');
export const POST = createInsertHandler('kbsi_storage', storageCreateSchema);
