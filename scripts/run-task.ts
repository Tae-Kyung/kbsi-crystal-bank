/**
 * Task Runner — 태스크 실행 전 선행조건 확인 + 실행 후 자동 검증
 *
 * 사용법:
 *   npx tsx scripts/run-task.ts P1.4.1          # 태스크 정보 및 프롬프트 출력
 *   npx tsx scripts/run-task.ts P1.4.1 --check  # 선행조건만 확인
 *   npx tsx scripts/run-task.ts P1.4.1 --verify # 완료 검증만 실행
 *   npx tsx scripts/run-task.ts --next          # 다음 실행 가능한 태스크 찾기
 *
 * 이 스크립트는 코드를 직접 생성하지 않는다.
 * 대신 Claude Code에 전달할 프롬프트를 생성하여, 사용자가 복사-실행할 수 있게 한다.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// Task registry (verify.ts와 동일한 구조, 여기에 prompt 추가)
interface Task {
  id: string;
  title: string;
  depends_on: string[];
  prompt: string;  // Claude Code에 전달할 구현 프롬프트
  test_spec: string;  // 테스트 파일에 포함되어야 할 테스트 명세
  verifications: { type: string; target?: string; contains?: string; command?: string; description: string }[];
}

const TASKS: Record<string, Task> = {
  'P1.1.1': {
    id: 'P1.1.1',
    title: 'npm install + 의존성 설치',
    depends_on: [],
    prompt: `npm install을 실행하여 package.json의 모든 의존성을 설치해줘.`,
    test_spec: '',
    verifications: [
      { type: 'FILE_EXISTS', target: 'node_modules/.package-lock.json', description: 'node_modules 존재' },
    ],
  },

  'P1.1.3': {
    id: 'P1.1.3',
    title: 'shadcn/ui 초기화',
    depends_on: ['P1.1.1'],
    prompt: `shadcn/ui를 초기화하고 기본 컴포넌트(button, input, label, select, dialog, toast, tabs, card, badge, separator, dropdown-menu, sheet)를 설치해줘. tailwind CSS v4를 사용한다.`,
    test_spec: '',
    verifications: [
      { type: 'FILE_EXISTS', target: 'components.json', description: 'components.json' },
      { type: 'FILE_EXISTS', target: 'src/components/ui/button.tsx', description: 'Button' },
    ],
  },

  'P1.2.1': {
    id: 'P1.2.1',
    title: 'Supabase 타입 자동 생성',
    depends_on: ['P1.1.5'],
    prompt: `Supabase 로컬 인스턴스에서 TypeScript 타입을 자동 생성해줘.
\`npx supabase gen types typescript --local > src/types/supabase.ts\`
그리고 src/lib/supabase/server.ts와 client.ts에서 이 타입을 사용하도록 수정해줘:
\`createServerClient<Database>(...)\` 형태로.`,
    test_spec: '',
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/types/supabase.ts', description: '자동 생성 타입' },
      { type: 'FILE_CONTAINS', target: 'src/types/supabase.ts', contains: 'kbsi_protein', description: 'kbsi_protein 포함' },
    ],
  },

  'P1.3.1': {
    id: 'P1.3.1',
    title: 'Layout + 네비게이션',
    depends_on: ['P1.1.3'],
    prompt: `대시보드 레이아웃과 사이드바 네비게이션을 구현해줘.

요구사항:
1. src/app/(dashboard)/layout.tsx — 사이드바 + 메인 컨텐츠 영역
2. src/components/layout/sidebar.tsx — 네비게이션 사이드바
   - 메뉴: Proteins, Constructs, Experiments, Staging Review, Dashboard
   - 현재 경로 하이라이트
   - lucide-react 아이콘 사용
   - 반응형 (모바일에서 Sheet로 전환)
3. src/components/layout/header.tsx — 상단 바 (타이틀, 사용자 메뉴)

shadcn/ui의 Sheet, Button, Separator 컴포넌트를 활용해줘.
테스트 파일도 작성: tests/components/sidebar.test.tsx`,
    test_spec: `tests/components/sidebar.test.tsx:
- 모든 네비게이션 링크가 렌더링되는지 확인
- 각 링크의 href가 올바른지 확인`,
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/layout/sidebar.tsx', description: 'Sidebar' },
      { type: 'FILE_EXISTS', target: 'src/app/(dashboard)/layout.tsx', description: 'Dashboard layout' },
      { type: 'TEST', target: 'tests/components/sidebar.test.tsx', description: 'Sidebar 테스트' },
    ],
  },

  'P1.3.2': {
    id: 'P1.3.2',
    title: 'DataTable 범용 컴포넌트',
    depends_on: ['P1.1.3'],
    prompt: `@tanstack/react-table 기반 범용 DataTable 컴포넌트를 구현해줘.

요구사항:
1. src/components/tables/data-table.tsx — 제네릭 DataTable<TData>
   - props: columns, data, searchKey?, filterableColumns?, pagination
   - 기능: 정렬, 컬럼 필터, 글로벌 검색, 페이지네이션
   - shadcn/ui Table 컴포넌트 기반
2. src/components/tables/data-table-pagination.tsx — 페이지네이션 UI
3. src/components/tables/data-table-toolbar.tsx — 검색바 + 필터 드롭다운

테스트: tests/components/data-table.test.tsx
- 데이터 렌더링, 정렬, 필터, 페이지네이션 동작 확인`,
    test_spec: `tests/components/data-table.test.tsx:
- 주어진 데이터가 테이블에 렌더링되는지
- 정렬 클릭 시 순서가 변경되는지
- 빈 데이터일 때 "데이터 없음" 표시`,
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/tables/data-table.tsx', description: 'DataTable' },
      { type: 'TEST', target: 'tests/components/data-table.test.tsx', description: 'DataTable 테스트' },
    ],
  },

  'P1.3.3': {
    id: 'P1.3.3',
    title: '폼 컴포넌트 (FormField, EnumSelect)',
    depends_on: ['P1.1.3'],
    prompt: `도메인 특화 폼 컴포넌트를 구현해줘.

1. src/components/forms/form-field.tsx
   - props: label, name, error?, required?, children
   - Label + Input/Select + 에러 메시지 래퍼

2. src/components/forms/enum-select.tsx
   - props: options (enum 값 배열), value, onChange, placeholder?
   - 순서형 enum을 드롭다운으로 표시
   - 각 옵션에 순서 번호 표시 (예: "1. no_expression", "2. insoluble", ...)

3. src/components/forms/experiment-form-base.tsx
   - 모든 실험 폼의 공통 필드 (source_type, reference_id, performed_by, performed_on, notes)
   - 다른 실험 폼에서 이 컴포넌트를 포함하여 재사용

테스트: tests/components/enum-select.test.tsx`,
    test_spec: `tests/components/enum-select.test.tsx:
- 모든 enum 옵션이 렌더링되는지
- 선택 시 onChange가 올바른 값으로 호출되는지
- placeholder가 표시되는지`,
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/components/forms/form-field.tsx', description: 'FormField' },
      { type: 'FILE_EXISTS', target: 'src/components/forms/enum-select.tsx', description: 'EnumSelect' },
      { type: 'TEST', target: 'tests/components/enum-select.test.tsx', description: 'EnumSelect 테스트' },
    ],
  },

  'P1.4.1': {
    id: 'P1.4.1',
    title: 'Protein API (CRUD)',
    depends_on: ['P1.2.1'],
    prompt: `Protein CRUD API를 완성해줘. 기존 src/app/api/proteins/route.ts를 기반으로.

1. src/app/api/proteins/route.ts — GET (목록, 검색, 페이지네이션), POST (생성)
2. src/app/api/proteins/[id]/route.ts — GET (단건), PUT (수정), DELETE (삭제)
3. src/lib/validations/protein.ts의 Zod 스키마를 사용하여 입력 검증

모든 Supabase 쿼리는 kbsi_protein 테이블을 사용.
에러 응답은 { error: string, details?: object } 형태.

테스트: tests/api/proteins.test.ts
- Supabase 클라이언트를 mock하여 단위 테스트
- 유효한 요청: 201 반환 확인
- 유효하지 않은 요청 (빈 full_name): 400 반환 확인
- 존재하지 않는 id: 404 반환 확인`,
    test_spec: `tests/api/proteins.test.ts:
- POST valid protein → 201 + data 반환
- POST invalid (missing full_name) → 400 + validation error
- GET /proteins → 200 + pagination
- GET /proteins?search=KRAS → 필터된 결과
- PUT /proteins/1 → 200 + updated data
- DELETE /proteins/1 → 204`,
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/app/api/proteins/route.ts', description: 'GET/POST' },
      { type: 'FILE_EXISTS', target: 'src/app/api/proteins/[id]/route.ts', description: 'GET/PUT/DELETE' },
      { type: 'TEST', target: 'tests/api/proteins.test.ts', description: 'Protein API 테스트' },
    ],
  },

  'P1.5.3': {
    id: 'P1.5.3',
    title: '서열 MW/pI 자동 계산',
    depends_on: ['P1.1.1'],
    prompt: `단백질 서열에서 분자량(MW)과 등전점(pI)을 계산하는 유틸리티를 구현해줘.

src/lib/utils/sequence.ts:
- calculateMW(sequence: string): number — 아미노산별 평균 분자량 합산, 물 분자 제거
- calculatePI(sequence: string): number — Henderson-Hasselbalch 기반 이진 탐색
- calculateSeqHash(sequence: string): string — SHA-256 해시 (중복 검출용)
- validateProteinSequence(sequence: string): boolean — 유효한 아미노산 문자만 포함 확인

참고: 아미노산 분자량 테이블은 표준 생화학 값 사용.

테스트: tests/utils/sequence.test.ts
- 알려진 단백질 서열로 MW 계산 결과 검증 (예: ACDEFGHIKLMNPQRSTVWY → 알려진 값과 비교)
- pI 계산 결과가 합리적 범위(3~12) 내인지
- 빈 서열, 잘못된 문자 입력 시 에러 처리`,
    test_spec: `tests/utils/sequence.test.ts:
- calculateMW('A') ≈ 89.09 (- 18.02 for water)
- calculateMW('ACDEFGHIKLMNPQRSTVWY') → 합리적 값
- calculatePI('ACDEFGHIKLMNPQRSTVWY') → 3~12 범위
- validateProteinSequence('ACDE') → true
- validateProteinSequence('ACDE123') → false
- calculateSeqHash('ABC') === calculateSeqHash('ABC')
- calculateSeqHash('ABC') !== calculateSeqHash('ABD')`,
    verifications: [
      { type: 'FILE_EXISTS', target: 'src/lib/utils/sequence.ts', description: '서열 유틸리티' },
      { type: 'TEST', target: 'tests/utils/sequence.test.ts', description: 'MW/pI 테스트' },
    ],
  },
};

// ============================================================
// Main
// ============================================================
const args = process.argv.slice(2);
const taskId = args.find(a => !a.startsWith('--'));
const flag = args.find(a => a.startsWith('--'));

function checkDependency(depId: string): boolean {
  try {
    execSync(`npx tsx scripts/verify.ts ${depId}`, { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (flag === '--next') {
  // 다음 실행 가능한 태스크 찾기
  console.log('\n== 다음 실행 가능한 태스크 ==\n');
  for (const [id, task] of Object.entries(TASKS)) {
    // 이미 완료된 태스크 건너뛰기
    const selfDone = (() => {
      try {
        execSync(`npx tsx scripts/verify.ts ${id}`, { cwd: ROOT, stdio: 'pipe' });
        return true;
      } catch { return false; }
    })();
    if (selfDone) continue;

    // 선행조건 확인
    const depsOk = task.depends_on.every(checkDependency);
    if (depsOk) {
      console.log(`>> ${id}: ${task.title}`);
      console.log(`   선행조건: ${task.depends_on.length === 0 ? '없음' : task.depends_on.join(', ') + ' (모두 완료)'}`);
    }
  }
  process.exit(0);
}

if (!taskId || !TASKS[taskId]) {
  console.log('사용법: npx tsx scripts/run-task.ts <task-id> [--check|--verify|--next]');
  console.log('\n등록된 태스크:');
  for (const [id, task] of Object.entries(TASKS)) {
    console.log(`  ${id}: ${task.title}`);
  }
  process.exit(1);
}

const task = TASKS[taskId];

if (flag === '--check') {
  // 선행조건만 확인
  console.log(`\n== 선행조건 확인: ${task.id} ==`);
  let allOk = true;
  for (const depId of task.depends_on) {
    const ok = checkDependency(depId);
    console.log(`  ${ok ? '[OK]' : '[MISSING]'} ${depId}`);
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
} else if (flag === '--verify') {
  // 완료 검증
  execSync(`npx tsx scripts/verify.ts ${taskId}`, { cwd: ROOT, stdio: 'inherit' });
} else {
  // 태스크 정보 + 프롬프트 출력
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TASK ${task.id}: ${task.title}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\n선행조건: ${task.depends_on.length === 0 ? '없음' : task.depends_on.join(', ')}`);

  // 선행조건 확인
  for (const depId of task.depends_on) {
    const ok = checkDependency(depId);
    if (!ok) {
      console.log(`\n!! 선행 태스크 ${depId}가 완료되지 않았습니다. 먼저 완료해주세요.`);
      process.exit(1);
    }
  }
  console.log('선행조건: 모두 충족\n');

  console.log('── Claude Code 프롬프트 ──────────────────────────');
  console.log(task.prompt);
  if (task.test_spec) {
    console.log('\n── 테스트 명세 ──────────────────────────────────');
    console.log(task.test_spec);
  }
  console.log('\n── 검증 방법 ───────────────────────────────────');
  console.log(`완료 후: npx tsx scripts/run-task.ts ${task.id} --verify`);
  console.log('');
}
