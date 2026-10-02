/**
 * TargetTrack XML 파싱 스크립트
 *
 * 사용법:
 *   npx tsx scripts/parse-targettrack.ts
 *
 * 1단계: XML에서 결정화 관련 데이터 추출 → JSON 중간 파일 생성
 * 2단계: LLM으로 프로토콜 텍스트 파싱 (별도 스크립트)
 * 3단계: DB에 import (API 호출)
 */

import { createReadStream } from 'fs';
import { writeFile, access } from 'fs/promises';
import { createGunzip } from 'zlib';
import { join } from 'path';
import { createInterface } from 'readline';

const DATA_DIR = join(process.cwd(), 'data', 'targettrack');
const OUTPUT_FILE = join(DATA_DIR, 'crystallization_trials.json');

// TargetTrack의 결정화 관련 상태값
const CRYSTALLIZATION_STATUSES = new Set([
  'Crystallized', 'Crystal', 'Crystals',
  'Diffraction', 'Diffraction-quality Crystals',
  'In Crystallization', 'Crystallization',
  'Crystal Structure', 'In Crystal Growth',
]);

// 실패를 나타내는 상태값
const FAILURE_STOP_STATUSES = new Set([
  'Work Stopped', 'Abandoned', 'Stopped',
  'Failed - Expression', 'Failed - Purification',
  'Failed - Crystallization', 'Failed - Other',
]);

interface TargetTrial {
  targetId: string;
  proteinName: string;
  organism: string;
  sequence: string;
  status: string;
  stopStatus: string | null;
  crystallizationProtocol: string | null;
  center: string;
  trialId: string;
}

async function main() {
  // tar.gz 파일 확인
  const tarPath = join(DATA_DIR, 'TargetTrack.tar.gz');
  try {
    await access(tarPath);
  } catch {
    console.error(`파일을 찾을 수 없습니다: ${tarPath}`);
    console.error('먼저 Zenodo에서 다운로드하세요.');
    process.exit(1);
  }

  console.log('TargetTrack XML 파싱 시작...');
  console.log('이 스크립트는 대용량 XML을 스트리밍으로 처리합니다.');

  // tar.gz 내부의 tt.xml.gz를 추출해야 함
  // 먼저 tar를 풀고 xml.gz를 찾음
  const { execSync } = await import('child_process');

  // tt.xml.gz 추출
  const xmlGzPath = join(DATA_DIR, 'tt.xml.gz');
  try {
    await access(xmlGzPath);
    console.log('tt.xml.gz 이미 존재, 추출 건너뜀');
  } catch {
    console.log('tar.gz에서 tt.xml.gz 추출 중...');
    try {
      execSync(`cd "${DATA_DIR}" && tar -xzf TargetTrack.tar.gz --include="*tt.xml.gz" --strip-components=1 2>/dev/null || tar -xzf TargetTrack.tar.gz 2>/dev/null`, {
        stdio: 'inherit',
      });
      // 추출된 파일 찾기
      const findResult = execSync(`find "${DATA_DIR}" -name "tt.xml.gz" -type f`).toString().trim();
      if (findResult && findResult !== xmlGzPath) {
        execSync(`mv "${findResult}" "${xmlGzPath}"`);
      }
    } catch (e) {
      console.error('tar 추출 실패. 수동으로 tt.xml.gz를 data/targettrack/에 배치해주세요.');
      process.exit(1);
    }
  }

  // XML을 스트리밍으로 파싱 (SAX 방식)
  console.log('tt.xml.gz 스트리밍 파싱 중...');

  const trials: TargetTrial[] = [];
  let currentTarget: Partial<TargetTrial> = {};
  let currentElement = '';
  let charBuffer = '';
  let targetCount = 0;
  let crystRelated = 0;
  let inTrial = false;

  // 간단한 줄 단위 XML 파싱 (SAX 라이브러리 없이)
  const stream = createReadStream(xmlGzPath).pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();

    // <target> 시작
    if (trimmed.startsWith('<target ') || trimmed === '<target>') {
      currentTarget = {};
      targetCount++;
      if (targetCount % 50000 === 0) {
        console.log(`  처리 중: ${targetCount}개 타겟, ${crystRelated}개 결정화 관련`);
      }
    }

    // <trial> 시작
    if (trimmed.startsWith('<trial ') || trimmed === '<trial>') {
      inTrial = true;
    }

    // 주요 필드 추출 (간단 패턴 매칭)
    const tagMatch = trimmed.match(/<(\w+)>(.*?)<\/\1>/);
    if (tagMatch) {
      const [, tag, value] = tagMatch;
      switch (tag) {
        case 'targetId':
        case 'target_id':
          if (!currentTarget.targetId) currentTarget.targetId = value;
          break;
        case 'protein_name':
        case 'proteinName':
        case 'name':
          if (!currentTarget.proteinName) currentTarget.proteinName = value;
          break;
        case 'organism_name':
        case 'organism':
          if (!currentTarget.organism) currentTarget.organism = value;
          break;
        case 'sequence':
          if (!currentTarget.sequence) currentTarget.sequence = value.substring(0, 100);
          break;
        case 'status':
          currentTarget.status = value;
          break;
        case 'stop_status':
        case 'stopStatus':
          currentTarget.stopStatus = value;
          break;
        case 'protocol':
        case 'crystallization_protocol':
        case 'crystal_protocol':
          currentTarget.crystallizationProtocol = value;
          break;
        case 'center':
        case 'center_name':
          currentTarget.center = value;
          break;
        case 'trial_id':
        case 'trialId':
          currentTarget.trialId = value;
          break;
      }
    }

    // </trial> 끝
    if (trimmed === '</trial>') {
      inTrial = false;
    }

    // </target> 끝 — 결정화 관련 데이터만 수집
    if (trimmed === '</target>') {
      const status = currentTarget.status || '';
      const stopStatus = currentTarget.stopStatus || '';

      const isCrystRelated =
        CRYSTALLIZATION_STATUSES.has(status) ||
        status.toLowerCase().includes('crystal') ||
        status.toLowerCase().includes('diffraction') ||
        stopStatus.toLowerCase().includes('crystal') ||
        currentTarget.crystallizationProtocol;

      if (isCrystRelated && currentTarget.targetId) {
        crystRelated++;
        trials.push({
          targetId: currentTarget.targetId || '',
          proteinName: currentTarget.proteinName || '',
          organism: currentTarget.organism || '',
          sequence: currentTarget.sequence || '',
          status: status,
          stopStatus: currentTarget.stopStatus || null,
          crystallizationProtocol: currentTarget.crystallizationProtocol || null,
          center: currentTarget.center || '',
          trialId: currentTarget.trialId || '',
        });

        // 메모리 관리: 최대 10,000건
        if (trials.length >= 10000) {
          console.log('  최대 수집 한도(10,000건) 도달, 파싱 중단');
          break;
        }
      }

      currentTarget = {};
    }
  }

  console.log(`\n파싱 완료:`);
  console.log(`  전체 타겟: ${targetCount}`);
  console.log(`  결정화 관련: ${trials.length}`);

  // 상태별 분포
  const statusDist: Record<string, number> = {};
  for (const t of trials) {
    const key = t.stopStatus || t.status;
    statusDist[key] = (statusDist[key] || 0) + 1;
  }
  console.log(`\n상태 분포:`);
  for (const [status, count] of Object.entries(statusDist).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${status}: ${count}`);
  }

  // 프로토콜이 있는 항목 수
  const withProtocol = trials.filter((t) => t.crystallizationProtocol);
  console.log(`\n프로토콜 텍스트 있음: ${withProtocol.length}건`);

  // JSON으로 저장
  await writeFile(OUTPUT_FILE, JSON.stringify(trials, null, 2));
  console.log(`\n결과 저장: ${OUTPUT_FILE}`);

  // 샘플 출력
  console.log(`\n=== 샘플 (최초 3건) ===`);
  for (const t of trials.slice(0, 3)) {
    console.log(JSON.stringify(t, null, 2));
  }
}

main().catch(console.error);
