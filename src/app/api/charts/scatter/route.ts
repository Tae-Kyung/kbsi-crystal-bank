import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/charts/scatter — 서버에서 결정화 pH×Temperature Scatter SVG 생성
 * 22K+ 데이터를 서버에서 처리하여 SVG 이미지로 반환
 * 클라이언트에 행 데이터 전송 없음
 *
 * ?width=900&height=600  — 차트 크기 (기본 900x600)
 * ?source=all|real|synthetic — 데이터 필터
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const width = parseInt(searchParams.get('width') || '900');
  const height = parseInt(searchParams.get('height') || '600');
  const sourceFilter = searchParams.get('source') || 'all';

  const supabase = createServiceClient();

  // 전체 데이터 fetch (서버 → DB 직접, 클라이언트 미경유)
  const PAGE = 1000;
  let allData: any[] = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from('kbsi_crystallization')
      .select('ph, temperature, outcome, source_type')
      .not('ph', 'is', null)
      .not('temperature', 'is', null)
      .not('outcome', 'is', null)
      .range(offset, offset + PAGE - 1);

    if (sourceFilter === 'real') query = query.neq('source_type', 'synthetic');
    if (sourceFilter === 'synthetic') query = query.eq('source_type', 'synthetic');

    const { data } = await query;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const svg = generateScatterSVG(allData, width, height);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
}

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

function generateScatterSVG(data: any[], width: number, height: number): string {
  const margin = { top: 30, right: 30, bottom: 50, left: 60 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // 축 범위
  const phMin = 2, phMax = 12;
  const tempMin = -5, tempMax = 45;

  const scaleX = (ph: number) => margin.left + ((ph - phMin) / (phMax - phMin)) * plotW;
  const scaleY = (temp: number) => margin.top + plotH - ((temp - tempMin) / (tempMax - tempMin)) * plotH;

  // 포인트 생성
  const points = data.map(d => ({
    x: scaleX(d.ph),
    y: scaleY(d.temperature),
    color: OUTCOME_COLORS[d.outcome] || '#94a3b8',
    outcome: d.outcome,
    isSynthetic: d.source_type === 'synthetic',
  }));

  // Outcome별 집계
  const outcomeCounts: Record<string, number> = {};
  for (const d of data) {
    outcomeCounts[d.outcome] = (outcomeCounts[d.outcome] || 0) + 1;
  }

  // SVG 생성
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<style>text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }</style>`;

  // 배경
  svg += `<rect width="${width}" height="${height}" fill="white"/>`;

  // 그리드
  for (let ph = phMin; ph <= phMax; ph += 1) {
    const x = scaleX(ph);
    svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" stroke="#f0f0f0" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${margin.top + plotH + 20}" text-anchor="middle" font-size="11" fill="#666">${ph}</text>`;
  }
  for (let temp = 0; temp <= 40; temp += 10) {
    const y = scaleY(temp);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>`;
    svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${temp}</text>`;
  }

  // 축 라벨
  svg += `<text x="${margin.left + plotW / 2}" y="${height - 8}" text-anchor="middle" font-size="13" fill="#333" font-weight="600">pH</text>`;
  svg += `<text x="15" y="${margin.top + plotH / 2}" text-anchor="middle" font-size="13" fill="#333" font-weight="600" transform="rotate(-90, 15, ${margin.top + plotH / 2})">Temperature (°C)</text>`;

  // 축 테두리
  svg += `<rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="none" stroke="#ddd" stroke-width="1"/>`;

  // 포인트 (synthetic은 투명하게)
  for (const p of points) {
    if (p.x >= margin.left && p.x <= margin.left + plotW && p.y >= margin.top && p.y <= margin.top + plotH) {
      const opacity = p.isSynthetic ? 0.2 : 0.5;
      const r = p.isSynthetic ? 1.5 : 2;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${p.color}" opacity="${opacity}"/>`;
    }
  }

  // 범례
  const legendX = margin.left + plotW - 180;
  const legendY = margin.top + 10;
  svg += `<rect x="${legendX - 8}" y="${legendY - 5}" width="190" height="${Object.keys(OUTCOME_COLORS).length * 18 + 30}" rx="4" fill="white" stroke="#e5e7eb" stroke-width="1" opacity="0.95"/>`;
  svg += `<text x="${legendX}" y="${legendY + 10}" font-size="11" font-weight="600" fill="#333">Total: ${data.length.toLocaleString()} points</text>`;

  let ly = legendY + 28;
  for (const [outcome, color] of Object.entries(OUTCOME_COLORS)) {
    const count = outcomeCounts[outcome] || 0;
    const label = outcome.replace(/_/g, ' ');
    svg += `<circle cx="${legendX + 5}" cy="${ly - 3}" r="4" fill="${color}"/>`;
    svg += `<text x="${legendX + 15}" y="${ly}" font-size="10" fill="#555">${label}: ${count.toLocaleString()}</text>`;
    ly += 18;
  }

  svg += '</svg>';
  return svg;
}
