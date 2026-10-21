/**
 * Preflight Loop — 단계적 검증 + 구조화된 피드백
 *
 * npm run preflight:loop              # 기본 (첫 실패에서 중단)
 * npm run preflight:loop -- --json    # JSON 출력
 * npm run preflight:loop -- --no-stop # 모든 단계 실행
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

interface StepResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  error_summary?: string;
  suggestion?: string;
}

const STEPS = [
  { id: 'typecheck', name: 'TypeScript Check', command: 'npx tsc --noEmit --pretty' },
  { id: 'lint', name: 'ESLint', command: 'npx next lint' },
  { id: 'test', name: 'Vitest', command: 'npx vitest run' },
  { id: 'build', name: 'Next.js Build', command: 'npx next build' },
];

function suggestFix(id: string, stderr: string): string {
  const s = stderr.toLowerCase();
  if (id === 'typecheck') {
    if (s.includes('ts2304')) return 'Missing import or type declaration';
    if (s.includes('ts2345')) return 'Type mismatch — check function arguments';
    if (s.includes('ts2322')) return 'Type assignment error — check return types';
    return 'Fix TypeScript errors above, then re-run';
  }
  if (id === 'lint') {
    return 'Run `npx next lint --fix` to auto-fix, then review remaining issues';
  }
  if (id === 'test') {
    const match = stderr.match(/FAIL\s+(.+)/);
    if (match) return `Failing test: ${match[1].trim()}`;
    return 'Check failing tests above';
  }
  if (id === 'build') {
    if (s.includes('module not found')) return 'Missing module — check imports and dependencies';
    if (s.includes('env')) return 'Check environment variables in .env.local';
    return 'Check build errors above';
  }
  return 'Review error output above';
}

function extractErrorSummary(output: string, maxLines = 8): string {
  const lines = output.split('\n').filter(l => l.trim());
  // Pick error-like lines first
  const errorLines = lines.filter(l =>
    /error|fail|✗|✖|Error:|FAIL/i.test(l)
  );
  const selected = errorLines.length > 0 ? errorLines : lines;
  return selected.slice(0, maxLines).join('\n');
}

function run() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const stopOnFail = !args.includes('--no-stop');

  const results: StepResult[] = [];
  let failed = false;

  for (const step of STEPS) {
    if (failed && stopOnFail) {
      results.push({ id: step.id, name: step.name, status: 'skip', duration_ms: 0 });
      continue;
    }

    const start = Date.now();
    try {
      execSync(step.command, {
        cwd: ROOT,
        stdio: 'pipe',
        timeout: 300_000,
        env: { ...process.env },
      });
      const duration_ms = Date.now() - start;
      results.push({ id: step.id, name: step.name, status: 'pass', duration_ms });

      if (!jsonMode) {
        console.log(`  [PASS] ${step.name} (${(duration_ms / 1000).toFixed(1)}s)`);
      }
    } catch (err: any) {
      const duration_ms = Date.now() - start;
      const output = [err.stdout?.toString() || '', err.stderr?.toString() || ''].join('\n');
      const error_summary = extractErrorSummary(output);
      const suggestion = suggestFix(step.id, output);

      results.push({ id: step.id, name: step.name, status: 'fail', duration_ms, error_summary, suggestion });
      failed = true;

      if (!jsonMode) {
        console.log(`  [FAIL] ${step.name} (${(duration_ms / 1000).toFixed(1)}s)`);
        console.log(`\n--- Error Summary ---`);
        console.log(error_summary);
        console.log(`\n--- Suggestion ---`);
        console.log(suggestion);
        console.log('');
      }
    }
  }

  const overall = results.every(r => r.status === 'pass') ? 'pass' : 'fail';
  const failedStep = results.find(r => r.status === 'fail');

  if (jsonMode) {
    const output = { overall, failed_step: failedStep?.id ?? null, steps: results };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('='.repeat(50));
    if (overall === 'pass') {
      console.log('  PREFLIGHT PASSED — all checks green');
    } else {
      console.log(`  PREFLIGHT FAILED at: ${failedStep?.name}`);
      if (failedStep?.suggestion) {
        console.log(`  Fix: ${failedStep.suggestion}`);
      }
    }
    console.log('='.repeat(50));
  }

  process.exit(overall === 'pass' ? 0 : 1);
}

run();
