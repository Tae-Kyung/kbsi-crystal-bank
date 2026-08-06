/**
 * Task History Logger
 * 태스크 완료 시 이력을 data/BUILD_LOG.md에 기록
 *
 * 사용법: npx tsx scripts/log-task.ts <task-id> "<summary>"
 */

import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const LOG_PATH = resolve(__dirname, '..', 'data', 'BUILD_LOG.md');
const taskId = process.argv[2];
const summary = process.argv[3] || '';

if (!taskId) {
  console.error('Usage: npx tsx scripts/log-task.ts <task-id> "<summary>"');
  process.exit(1);
}

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const entry = `| ${now} | ${taskId} | ${summary} |\n`;

if (!existsSync(LOG_PATH)) {
  writeFileSync(LOG_PATH, `# BUILD LOG\n\n| Timestamp | Task | Summary |\n|-----------|------|---------|\n`);
}

appendFileSync(LOG_PATH, entry);
console.log(`Logged: ${taskId} — ${summary}`);
