import { z } from 'zod';

export const ligandCreateSchema = z.object({
  name: z.string().min(1).max(500),
  smiles: z.string().nullish(),
  inchi: z.string().nullish(),
  mw: z.number().positive().nullish(),
  source: z.string().max(200).nullish(),
});

export const ligandUpdateSchema = ligandCreateSchema.partial();

export const constructLigandCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  ligand_id: z.number().int().positive(),
  binding_kd: z.number().positive().nullish(),
  binding_ic50: z.number().positive().nullish(),
  notes: z.string().nullish(),
});
