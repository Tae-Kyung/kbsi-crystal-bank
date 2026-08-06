/**
 * Task Verification Runner
 *
 * 각 태스크의 완료 조건을 자동으로 검증하는 스크립트.
 * `npx tsx scripts/verify.ts [task-id]` 로 실행.
 * task-id 없이 실행하면 전체 태스크 상태를 점검.
 *
 * 검증 레벨:
 *   - FILE_EXISTS: 파일이 존재하는지
 *   - FILE_CONTAINS: 파일에 특정 문자열이 포함되는지
 *   - TYPE_CHECK: tsc --noEmit 통과하는지
 *   - BUILD: next build 통과하는지
 *   - TEST: vitest 특정 테스트 파일 통과하는지
 *   - HTTP: 로컬 서버에 HTTP 요청 후 응답 검증
 *   - SQL: Supabase에 SQL 실행 후 결과 검증
 *   - CUSTOM: 커스텀 검증 함수
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// ============================================================
// Types
// ============================================================
interface Verification {
  type: 'FILE_EXISTS' | 'FILE_CONTAINS' | 'TYPE_CHECK' | 'BUILD' | 'TEST' | 'COMMAND';
  target?: string;
  contains?: string;
  command?: string;
  description: string;
}

interface Task {
  id: string;
  title: string;
  depends_on: string[];
  verifications: Verification[];
}

// ============================================================
// Task Registry — 모든 태스크의 완료 조건 정의
// ============================================================
const TASKS: Task[] = [
  // ── Phase 1.1: 프로젝트 초기 설정 ──
  {
    id: 'P1.1.1',
    title: 'npm install + 의존성 설치',
    depends_on: [],
    verifications: [
      { type: 'FILE_EXISTS', target: 'node_modules/.package-lock.json', description: 'node_modules 존재' },
      { type: 'FILE_EXISTS', target: 'node_modules/next/package.json', description: 'next 설치됨' },
      { type: 'FILE_EXISTS', target: 'node_modules/@supabase/supabase-js/package.json', description: 'supabase-js 설치됨' },
    ],
  },
  {
    id: 'P1.1.2',
    title: 'TypeScript 컴파일 통과',
    depends_on: ['P1.1.1'],
    verifications: [
      { type: 'COMMAND', command: 'npx tsc --noEmit', description: 'tsc --noEmit 통과' },
    ],
  },
  {
    id: 'P1.1.3',
    title: 'shadcn/ui 초기화',
    depends_on: ['P1.1.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'components.json', description: 'components.json 존재' },
      { type: 'FILE_EXISTS', target: 'src/components/ui/button.tsx', description: 'Button 컴포넌트 존재' },
    ],
  },
  {
    id: 'P1.1.4',
    title: 'Supabase 로컬 실행',
    depends_on: [],
    verifications: [
      { type: 'COMMAND', command: 'npx supabase status --output json', description: 'Supabase 로컬 인스턴스 실행 중' },
    ],
  },
  {
    id: 'P1.1.5',
    title: 'DB 마이그레이션 + 시드 적용',
    depends_on: ['P1.1.4'],
    verifications: [
      { type: 'COMMAND', command: 'npx supabase db reset', description: 'DB reset 성공' },
    ],
  },
  {
    id: 'P1.1.6',
    title: 'Next.js 빌드 통과',
    depends_on: ['P1.1.2', 'P1.1.3'],
    verifications: [
      { type: 'COMMAND', command: 'npx next build', description: 'next build 성공' },
    ],
  },
  {
    id: 'P1.1.7',
    title: 'Git 초기화 + 첫 커밋',
    depends_on: ['P1.1.6'],
    verifications: [
      { type: 'FILE_EXISTS', target: '.git/HEAD', description: '.git 존재' },
      { type: 'COMMAND', command: 'git log --oneline -1', description: '최소 1개 커밋 존재' },
    ],
  },

  // ── Phase 1.2: Supabase 타입 생성 ──
  {
    id: 'P1.2.1',
    title: 'Supabase 타입 자동 생성',
    depends_on: ['P1.1.5'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/types/supabase.ts', description: '자동 생성 타입 파일 존재' },
      { type: 'FILE_CONTAINS', target: 'src/types/supabase.ts', contains: 'kbsi_protein', description: 'kbsi_protein 테이블 타입 포함' },
      { type: 'FILE_CONTAINS', target: 'src/types/supabase.ts', contains: 'kbsi_construct', description: 'kbsi_construct 테이블 타입 포함' },
    ],
  },

  // ── Phase 1.3: 공통 UI 컴포넌트 ──
  {
    id: 'P1.3.1',
    title: 'Layout + 네비게이션',
    depends_on: ['P1.1.3'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/layout/sidebar.tsx', description: 'Sidebar 컴포넌트' },
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/layout.tsx', description: 'Dashboard 레이아웃' },
      { type: 'TEST', target: 'tests/components/sidebar.test.tsx', description: 'Sidebar 테스트 통과' },
    ],
  },
  {
    id: 'P1.3.2',
    title: 'DataTable 범용 컴포넌트',
    depends_on: ['P1.1.3'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/tables/data-table.tsx', description: 'DataTable 컴포넌트' },
      { type: 'TEST', target: 'tests/components/data-table.test.tsx', description: 'DataTable 테스트 통과' },
    ],
  },
  {
    id: 'P1.3.3',
    title: '폼 컴포넌트 (FormField, EnumSelect)',
    depends_on: ['P1.1.3'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/forms/form-field.tsx', description: 'FormField 컴포넌트' },
      { type: 'FILE_EXISTS', target: 'src/components/forms/enum-select.tsx', description: 'EnumSelect 컴포넌트' },
      { type: 'TEST', target: 'tests/components/enum-select.test.tsx', description: 'EnumSelect 테스트 통과' },
    ],
  },

  // ── Phase 1.4: Protein 모듈 ──
  {
    id: 'P1.4.1',
    title: 'Protein API (CRUD)',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/proteins/route.ts', description: 'GET/POST API' },
      { type: 'FILE_EXISTS', target: 'src/app/api/proteins/[id]/route.ts', description: 'GET/PUT/DELETE API' },
      { type: 'TEST', target: 'tests/api/proteins.test.ts', description: 'Protein API 테스트 통과' },
    ],
  },
  {
    id: 'P1.4.2',
    title: 'Protein 목록 페이지',
    depends_on: ['P1.4.1', 'P1.3.1', 'P1.3.2'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/proteins/page.tsx', description: '목록 페이지' },
      { type: 'FILE_CONTAINS', target: 'src/app/(dashboard)/proteins/page.tsx', contains: 'kbsi_protein', description: 'kbsi_protein 쿼리 사용' },
    ],
  },
  {
    id: 'P1.4.3',
    title: 'Protein 생성/수정 폼',
    depends_on: ['P1.4.1', 'P1.3.3'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/proteins/new/page.tsx', description: '생성 페이지' },
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/proteins/[id]/edit/page.tsx', description: '수정 페이지' },
      { type: 'TEST', target: 'tests/pages/protein-form.test.tsx', description: 'Protein 폼 테스트 통과' },
    ],
  },
  {
    id: 'P1.4.4',
    title: 'Protein 상세 페이지',
    depends_on: ['P1.4.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/proteins/[id]/page.tsx', description: '상세 페이지' },
    ],
  },

  // ── Phase 1.5: Construct 모듈 ──
  {
    id: 'P1.5.1',
    title: 'Construct API (CRUD)',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/constructs/route.ts', description: 'GET/POST API' },
      { type: 'FILE_EXISTS', target: 'src/app/api/constructs/[id]/route.ts', description: 'GET/PUT/DELETE API' },
      { type: 'TEST', target: 'tests/api/constructs.test.ts', description: 'Construct API 테스트 통과' },
    ],
  },
  {
    id: 'P1.5.2',
    title: 'Construct 목록/상세 페이지',
    depends_on: ['P1.5.1', 'P1.3.1', 'P1.3.2'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/constructs/page.tsx', description: '목록 페이지' },
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/constructs/[id]/page.tsx', description: '상세 페이지' },
    ],
  },
  {
    id: 'P1.5.3',
    title: '서열 MW/pI 자동 계산',
    depends_on: ['P1.1.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/lib/utils/sequence.ts', description: '서열 유틸리티' },
      { type: 'TEST', target: 'tests/utils/sequence.test.ts', description: 'MW/pI 계산 테스트 통과' },
    ],
  },

  // ── Phase 1.6: 실험 데이터 API ──
  {
    id: 'P1.6.1',
    title: 'Expression API + 테스트',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/expressions/route.ts', description: 'Expression API' },
      { type: 'TEST', target: 'tests/api/expressions.test.ts', description: 'Expression API 테스트' },
    ],
  },
  {
    id: 'P1.6.2',
    title: 'Purification API + 테스트',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/purifications/route.ts', description: 'Purification API' },
      { type: 'TEST', target: 'tests/api/purifications.test.ts', description: 'Purification API 테스트' },
    ],
  },
  {
    id: 'P1.6.3',
    title: 'Crystallization API + 테스트',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/crystallizations/route.ts', description: 'Crystallization API' },
      { type: 'TEST', target: 'tests/api/crystallizations.test.ts', description: 'Crystallization API 테스트' },
    ],
  },
  {
    id: 'P1.6.4',
    title: 'Characterization + Storage + Diffraction API',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/characterizations/route.ts', description: 'Characterization API' },
      { type: 'FILE_EXISTS', target: 'src/app/api/storages/route.ts', description: 'Storage API' },
      { type: 'FILE_EXISTS', target: 'src/app/api/diffractions/route.ts', description: 'Diffraction API' },
    ],
  },
  {
    id: 'P1.6.5',
    title: 'NMR + CryoEM + Structure API',
    depends_on: ['P1.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/nmr-experiments/route.ts', description: 'NMR API' },
      { type: 'FILE_EXISTS', target: 'src/app/api/cryoem-sessions/route.ts', description: 'CryoEM API' },
      { type: 'FILE_EXISTS', target: 'src/app/api/structures/route.ts', description: 'Structure API' },
    ],
  },

  // ── Phase 1.7: 실험 데이터 UI ──
  {
    id: 'P1.7.1',
    title: 'Construct 실험 탭 UI',
    depends_on: ['P1.5.2', 'P1.6.1', 'P1.6.2', 'P1.6.3'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/constructs/[id]/experiments/page.tsx', description: '실험 탭 페이지' },
      { type: 'FILE_EXISTS', target: 'src/components/experiments/expression-tab.tsx', description: 'Expression 탭' },
      { type: 'FILE_EXISTS', target: 'src/components/experiments/crystallization-tab.tsx', description: 'Crystallization 탭' },
    ],
  },

  // ── Phase 1.8: 인증 ──
  {
    id: 'P1.8.1',
    title: '인증 (Supabase Auth)',
    depends_on: ['P1.1.4'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(auth)/login/page.tsx', description: '로그인 페이지' },
      { type: 'FILE_EXISTS', target: 'src/middleware.ts', description: '인증 미들웨어' },
      { type: 'FILE_CONTAINS', target: 'src/middleware.ts', contains: 'supabase', description: 'Supabase 인증 로직' },
    ],
  },

  // ── Phase 1.9: 통합 검증 ──
  {
    id: 'P1.9.1',
    title: 'Phase 1 전체 빌드 + 테스트',
    depends_on: ['P1.4.3', 'P1.5.2', 'P1.7.1', 'P1.8.1'],
    verifications: [
      { type: 'COMMAND', command: 'npx next build', description: '전체 빌드 성공' },
      { type: 'COMMAND', command: 'npx vitest run', description: '전체 테스트 통과' },
      { type: 'COMMAND', command: 'npx tsc --noEmit', description: '타입 체크 통과' },
    ],
  },

  // ============================================================
  // Phase 2: LLM 파이프라인 + 시각화 + Import/Export
  // ============================================================

  // ── Phase 2.1: LLM 문헌 추출 ──
  {
    id: 'P2.1.1',
    title: 'LLM 추출 프롬프트 설계',
    depends_on: ['P1.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/lib/llm/extraction-prompt.ts', description: '추출 프롬프트 파일' },
    ],
  },
  {
    id: 'P2.1.2',
    title: '추출 API (OpenAI + CrossRef)',
    depends_on: ['P2.1.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/extract/route.ts', description: '추출 API' },
    ],
  },
  {
    id: 'P2.1.3',
    title: 'Staging 검토 API',
    depends_on: ['P2.1.2'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/staging/route.ts', description: 'Staging API' },
    ],
  },
  {
    id: 'P2.1.4',
    title: 'Staging 검토 UI',
    depends_on: ['P2.1.3'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/staging/page.tsx', description: 'Staging 페이지' },
      { type: 'FILE_EXISTS', target: 'src/components/staging/staging-review-list.tsx', description: '검토 리스트' },
      { type: 'FILE_EXISTS', target: 'src/components/staging/extraction-form.tsx', description: '추출 폼' },
    ],
  },

  // ── Phase 2.2: 리간드 ──
  {
    id: 'P2.2.1',
    title: 'Ligand API (CRUD)',
    depends_on: ['P1.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/ligands/route.ts', description: 'Ligand API' },
      { type: 'FILE_EXISTS', target: 'src/lib/validations/ligand.ts', description: 'Ligand 검증 스키마' },
    ],
  },
  {
    id: 'P2.2.2',
    title: 'Construct-Ligand 바인딩 API',
    depends_on: ['P2.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/construct-ligands/route.ts', description: 'Construct-Ligand API' },
    ],
  },
  {
    id: 'P2.2.3',
    title: 'Ligand 목록 페이지 + 폼',
    depends_on: ['P2.2.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/ligands/page.tsx', description: 'Ligand 페이지' },
      { type: 'FILE_EXISTS', target: 'src/components/forms/ligand-form-dialog.tsx', description: 'Ligand 폼' },
    ],
  },

  // ── Phase 2.3: 대시보드 ──
  {
    id: 'P2.3.1',
    title: 'Dashboard 페이지 + 통계 카드',
    depends_on: ['P1.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/dashboard/page.tsx', description: 'Dashboard 페이지' },
    ],
  },
  {
    id: 'P2.3.2',
    title: 'Pipeline Funnel 차트',
    depends_on: ['P2.3.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/charts/pipeline-funnel.tsx', description: 'Pipeline Funnel' },
    ],
  },
  {
    id: 'P2.3.3',
    title: 'Outcome 분포 차트',
    depends_on: ['P2.3.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/charts/outcome-distribution.tsx', description: 'Outcome 분포' },
    ],
  },
  {
    id: 'P2.3.4',
    title: 'pH×온도 Scatter Plot',
    depends_on: ['P2.3.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/charts/crystallization-heatmap.tsx', description: 'Crystallization Heatmap' },
    ],
  },

  // ── Phase 2.4: Import/Export ──
  {
    id: 'P2.4.1',
    title: 'CSV/JSON Export API',
    depends_on: ['P1.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/export/route.ts', description: 'Export API' },
    ],
  },
  {
    id: 'P2.4.2',
    title: 'CSV Bulk Import API',
    depends_on: ['P2.4.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/import/route.ts', description: 'Import API' },
    ],
  },

  // ── Phase 2.9: 통합 검증 ──
  {
    id: 'P2.9.1',
    title: 'Phase 2 전체 빌드 + 테스트',
    depends_on: ['P2.1.4', 'P2.2.3', 'P2.3.4', 'P2.4.2'],
    verifications: [
      { type: 'COMMAND', command: 'npx next build', description: '전체 빌드 성공' },
      { type: 'COMMAND', command: 'npx vitest run', description: '전체 테스트 통과' },
      { type: 'COMMAND', command: 'npx tsc --noEmit', description: '타입 체크 통과' },
    ],
  },

  // ============================================================
  // Phase 3: AI/ML + 외부 DB 연동 + 고급 접근 제어
  // ============================================================

  // ── Phase 3.1: AI/ML ──
  {
    id: 'P3.1.1',
    title: '결정화 조건 추천 API (k-NN)',
    depends_on: ['P2.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/recommend/route.ts', description: '추천 API' },
    ],
  },
  {
    id: 'P3.1.2',
    title: '결정화 성공 확률 예측 API',
    depends_on: ['P3.1.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/predict/route.ts', description: '예측 API' },
    ],
  },
  {
    id: 'P3.1.4',
    title: 'ML Feature Engineering',
    depends_on: ['P3.1.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/lib/ml/features.ts', description: 'Feature 파이프라인' },
    ],
  },

  // ── Phase 3.2: 외부 DB 연동 ──
  {
    id: 'P3.2.1',
    title: 'UniProt API 연동',
    depends_on: ['P2.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/lib/external/uniprot.ts', description: 'UniProt 클라이언트' },
    ],
  },
  {
    id: 'P3.2.2',
    title: 'PDB API 연동',
    depends_on: ['P2.9.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/lib/external/pdb.ts', description: 'PDB 클라이언트' },
    ],
  },

  // ── Phase 3.3: 고급 접근 제어 ──
  {
    id: 'P3.3.1',
    title: 'RBAC (admin/researcher/viewer)',
    depends_on: ['P1.8.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'supabase/migrations/00002_rbac.sql', description: 'RBAC migration' },
    ],
  },
  {
    id: 'P3.3.3',
    title: 'Audit Log 대시보드',
    depends_on: ['P3.3.1'],
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/audit/page.tsx', description: 'Audit 페이지' },
    ],
  },

  // ── Phase 3.9: 통합 검증 ──
  {
    id: 'P3.9.1',
    title: 'Phase 3 전체 빌드 + 테스트',
    depends_on: ['P3.1.2', 'P3.2.1', 'P3.2.2', 'P3.3.3'],
    verifications: [
      { type: 'COMMAND', command: 'npx next build', description: '전체 빌드 성공' },
      { type: 'COMMAND', command: 'npx vitest run', description: '전체 테스트 통과' },
      { type: 'COMMAND', command: 'npx tsc --noEmit', description: '타입 체크 통과' },
    ],
  },
];

// ============================================================
// Verification Runner
// ============================================================
function runVerification(v: Verification): { pass: boolean; message: string } {
  try {
    switch (v.type) {
      case 'FILE_EXISTS': {
        const fullPath = resolve(ROOT, v.target!);
        const exists = existsSync(fullPath);
        return { pass: exists, message: exists ? `OK: ${v.target}` : `MISSING: ${v.target}` };
      }
      case 'FILE_CONTAINS': {
        const fullPath = resolve(ROOT, v.target!);
        if (!existsSync(fullPath)) return { pass: false, message: `MISSING: ${v.target}` };
        const content = readFileSync(fullPath, 'utf-8');
        const found = content.includes(v.contains!);
        return { pass: found, message: found ? `OK: contains "${v.contains}"` : `NOT FOUND: "${v.contains}" in ${v.target}` };
      }
      case 'COMMAND': {
        execSync(v.command!, { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
        return { pass: true, message: `OK: ${v.command}` };
      }
      case 'TEST': {
        execSync(`npx vitest run ${v.target}`, { cwd: ROOT, stdio: 'pipe', timeout: 60_000 });
        return { pass: true, message: `OK: ${v.target}` };
      }
      default:
        return { pass: false, message: `Unknown verification type: ${v.type}` };
    }
  } catch (err: any) {
    return { pass: false, message: `FAIL: ${v.description} — ${err.message?.slice(0, 100)}` };
  }
}

function verifyTask(task: Task): { allPass: boolean; results: string[] } {
  const results: string[] = [];
  let allPass = true;

  for (const v of task.verifications) {
    const r = runVerification(v);
    const icon = r.pass ? '[PASS]' : '[FAIL]';
    results.push(`  ${icon} ${v.description}: ${r.message}`);
    if (!r.pass) allPass = false;
  }

  return { allPass, results };
}

// ============================================================
// Main
// ============================================================
const targetId = process.argv[2];

if (targetId) {
  // 특정 태스크 검증
  const task = TASKS.find((t) => t.id === targetId);
  if (!task) {
    console.error(`Task not found: ${targetId}`);
    console.log('Available tasks:', TASKS.map((t) => t.id).join(', '));
    process.exit(1);
  }

  console.log(`\n== Verifying: ${task.id} — ${task.title} ==`);
  if (task.depends_on.length > 0) {
    console.log(`   Depends on: ${task.depends_on.join(', ')}`);
  }

  const { allPass, results } = verifyTask(task);
  results.forEach((r) => console.log(r));
  console.log(allPass ? '\n>> TASK COMPLETE' : '\n>> TASK INCOMPLETE');
  process.exit(allPass ? 0 : 1);
} else {
  // 전체 상태 점검
  console.log('\n== KBSI Protein DB — Task Verification Report ==\n');

  let completed = 0;
  let incomplete = 0;

  for (const task of TASKS) {
    const { allPass, results } = verifyTask(task);
    const status = allPass ? 'DONE' : 'TODO';
    const icon = allPass ? '[v]' : '[ ]';

    console.log(`${icon} ${task.id} ${task.title} (${status})`);
    if (!allPass) {
      results.filter((r) => r.includes('[FAIL]')).forEach((r) => console.log(r));
      incomplete++;
    } else {
      completed++;
    }
  }

  console.log(`\n== Summary: ${completed} done / ${incomplete} remaining / ${TASKS.length} total ==`);
  process.exit(incomplete > 0 ? 1 : 0);
}
