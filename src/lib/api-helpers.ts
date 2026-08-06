import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ZodSchema } from 'zod';

/**
 * 실험 테이블 CRUD 공통 헬퍼
 * 모든 실험 API가 동일한 패턴을 따르므로 코드 중복 방지
 */

type TableName = 'kbsi_expression' | 'kbsi_purification' | 'kbsi_crystallization'
  | 'kbsi_characterization' | 'kbsi_storage' | 'kbsi_diffraction'
  | 'kbsi_nmr_experiment' | 'kbsi_cryoem_session' | 'kbsi_structure';

export function createListHandler(table: TableName, defaultSelect = '*') {
  return async (request: NextRequest) => {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const constructId = searchParams.get('construct_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let query = supabase
      .from(table)
      .select(defaultSelect, { count: 'exact' });

    if (constructId) {
      query = query.eq('construct_id', parseInt(constructId));
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, pagination: { page, limit, total: count } });
  };
}

export function createInsertHandler(table: TableName, schema: ZodSchema) {
  return async (request: NextRequest) => {
    const supabase = await createClient();
    const body = await request.json();

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(table) as any)
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  };
}
