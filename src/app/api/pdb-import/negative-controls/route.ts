import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * 성공 조건에서 변형하여 실패 가능성 높은 조건을 생성하는 전략
 */
const PERTURBATION_STRATEGIES = [
  {
    name: 'extreme_ph_low',
    label: 'pH 극단 (낮음)',
    description: 'pH를 3.0~4.0으로 낮춤 → 단백질 변성/침전 유발',
    apply: (r: any) => ({
      ...baseFields(r),
      ph: randomBetween(3.0, 4.0),
      outcome: 'precipitate' as const,
      notes: `Negative control: extreme low pH (원본 ID ${r.id}, pH ${r.ph})`,
    }),
    requires: (r: any) => r.ph != null && r.ph > 5,
  },
  {
    name: 'extreme_ph_high',
    label: 'pH 극단 (높음)',
    description: 'pH를 10.0~11.0으로 높임 → 단백질 변성 유발',
    apply: (r: any) => ({
      ...baseFields(r),
      ph: randomBetween(10.0, 11.0),
      outcome: 'precipitate' as const,
      notes: `Negative control: extreme high pH (원본 ID ${r.id}, pH ${r.ph})`,
    }),
    requires: (r: any) => r.ph != null && r.ph < 9,
  },
  {
    name: 'no_precipitant',
    label: '침전제 없음',
    description: '침전제 농도를 0으로 → 과포화 미달, 투명 드롭',
    apply: (r: any) => ({
      ...baseFields(r),
      precipitant_conc: 0,
      outcome: 'clear' as const,
      notes: `Negative control: no precipitant (원본 ID ${r.id}, ${r.precipitant_conc}${r.precipitant_unit})`,
    }),
    requires: (r: any) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'excess_precipitant',
    label: '침전제 과다 (2.5x)',
    description: '침전제 2.5배 → 즉각적 침전',
    apply: (r: any) => ({
      ...baseFields(r),
      precipitant_conc: Math.round(r.precipitant_conc * 2.5 * 10) / 10,
      outcome: 'precipitate' as const,
      notes: `Negative control: excess precipitant 2.5x (원본 ID ${r.id}, ${r.precipitant_conc}→${Math.round(r.precipitant_conc * 2.5 * 10) / 10}${r.precipitant_unit})`,
    }),
    requires: (r: any) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'low_precipitant',
    label: '침전제 부족 (0.2x)',
    description: '침전제 1/5 → 과포화 미달, 투명 드롭',
    apply: (r: any) => ({
      ...baseFields(r),
      precipitant_conc: Math.round(r.precipitant_conc * 0.2 * 10) / 10,
      outcome: 'clear' as const,
      notes: `Negative control: low precipitant 0.2x (원본 ID ${r.id}, ${r.precipitant_conc}→${Math.round(r.precipitant_conc * 0.2 * 10) / 10}${r.precipitant_unit})`,
    }),
    requires: (r: any) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'high_temp',
    label: '고온 (37°C)',
    description: '37°C → 단백질 불안정화',
    apply: (r: any) => ({
      ...baseFields(r),
      temperature: 37,
      outcome: 'precipitate' as const,
      notes: `Negative control: high temperature (원본 ID ${r.id}, ${r.temperature}°C→37°C)`,
    }),
    requires: (r: any) => r.temperature != null && r.temperature < 30,
  },
  {
    name: 'high_salt',
    label: '고농도 염 (5x)',
    description: '염 농도 5배 → salting out',
    apply: (r: any) => ({
      ...baseFields(r),
      salt_conc: Math.round(r.salt_conc * 5),
      outcome: 'precipitate' as const,
      notes: `Negative control: excess salt 5x (원본 ID ${r.id}, salt ${r.salt_conc}→${Math.round(r.salt_conc * 5)}mM)`,
    }),
    requires: (r: any) => r.salt_conc != null && r.salt_conc > 0,
  },
];

function baseFields(r: any) {
  return {
    construct_id: r.construct_id,
    source_type: 'synthetic',
    precipitant_type: r.precipitant_type,
    precipitant_conc: r.precipitant_conc,
    precipitant_unit: r.precipitant_unit,
    buffer_type: r.buffer_type,
    ph: r.ph,
    temperature: r.temperature,
    salt_type: r.salt_type,
    salt_conc: r.salt_conc,
    protein_concentration: r.protein_concentration,
    additive: r.additive,
  };
}

function randomBetween(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

/**
 * GET /api/pdb-import/negative-controls — 생성 가능한 Negative Control 미리보기
 */
export async function GET() {
  const supabase = await createClient();

  // 성공 조건 중 구조화 필드가 있는 레코드
  const { data: successes, error } = await (supabase.from('kbsi_crystallization') as any)
    .select('id, construct_id, precipitant_type, precipitant_conc, precipitant_unit, buffer_type, ph, temperature, salt_type, salt_conc, protein_concentration, additive, outcome')
    .in('outcome', ['diffraction_quality', 'single_crystal'])
    .not('precipitant_type', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 이미 생성된 synthetic 수
  const { count: existingSynthetic } = await (supabase.from('kbsi_crystallization') as any)
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'synthetic');

  // 각 성공 조건에 적용 가능한 전략 계산
  let totalPossible = 0;
  const preview = (successes || []).map((r: any) => {
    const applicable = PERTURBATION_STRATEGIES.filter((s) => s.requires(r));
    totalPossible += applicable.length;
    return {
      sourceId: r.id,
      precipitant: r.precipitant_type,
      ph: r.ph,
      temperature: r.temperature,
      applicableStrategies: applicable.map((s) => s.label),
      count: applicable.length,
    };
  });

  return NextResponse.json({
    successRecords: (successes || []).length,
    existingSynthetic: existingSynthetic || 0,
    totalPossible,
    strategies: PERTURBATION_STRATEGIES.map((s) => ({ name: s.name, label: s.label, description: s.description })),
    preview,
  });
}

/**
 * POST /api/pdb-import/negative-controls — Negative Control 일괄 생성
 * body: { strategies?: string[] } — 미지정 시 전체 전략 적용
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const selectedStrategies = body.strategies as string[] | undefined;

  const { data: successes, error } = await (supabase.from('kbsi_crystallization') as any)
    .select('id, construct_id, precipitant_type, precipitant_conc, precipitant_unit, buffer_type, ph, temperature, salt_type, salt_conc, protein_concentration, additive, outcome')
    .in('outcome', ['diffraction_quality', 'single_crystal'])
    .not('precipitant_type', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const strategies = selectedStrategies
    ? PERTURBATION_STRATEGIES.filter((s) => selectedStrategies.includes(s.name))
    : PERTURBATION_STRATEGIES;

  const inserts: any[] = [];

  for (const record of successes || []) {
    for (const strategy of strategies) {
      if (!strategy.requires(record)) continue;
      const negativeControl = strategy.apply(record);
      // null 값 제거
      const cleaned: any = {};
      for (const [k, v] of Object.entries(negativeControl)) {
        if (v != null && v !== 'null') cleaned[k] = v;
      }
      inserts.push(cleaned);
    }
  }

  if (inserts.length === 0) {
    return NextResponse.json({ message: '생성 가능한 Negative Control이 없습니다', created: 0 });
  }

  // 배치 삽입
  const { data: inserted, error: insertErr } = await (supabase.from('kbsi_crystallization') as any)
    .insert(inserts)
    .select('id');

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    message: `${(inserted || []).length}건의 Negative Control 생성 완료`,
    created: (inserted || []).length,
    byStrategy: strategies.map((s) => ({
      name: s.label,
      count: inserts.filter((i) => i.notes?.includes(s.name.replace(/_/g, ' '))).length,
    })),
  });
}

/**
 * DELETE /api/pdb-import/negative-controls — synthetic 데이터 전체 삭제
 */
export async function DELETE() {
  const supabase = await createClient();

  const { error } = await (supabase.from('kbsi_crystallization') as any)
    .delete()
    .eq('source_type', 'synthetic');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Synthetic 데이터 전체 삭제 완료' });
}
