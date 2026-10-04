/**
 * TargetTrack XML에서 결정화 프로토콜 텍스트만 추출
 * npx tsx scripts/extract-cryst-protocols.ts
 */

import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { createGunzip } from 'zlib';
import { join } from 'path';
import { createInterface } from 'readline';

const DATA_DIR = join(process.cwd(), 'data', 'targettrack');
const OUTPUT_FILE = join(DATA_DIR, 'crystallization_protocols.json');

async function main() {
  const xmlGzPath = join(DATA_DIR, 'tt.xml.gz');
  console.log('Extracting crystallization protocols from tt.xml.gz...');

  const protocols: { id: string; name: string; text: string }[] = [];

  const stream = createReadStream(xmlGzPath).pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let inCrystProtocol = false;
  let inProtocolText = false;
  let currentId = '';
  let currentName = '';
  let textBuffer = '';
  let isCrystType = false;
  let protocolCount = 0;

  for await (const line of rl) {
    const trimmed = line.trim();

    // <protocol id="...">
    if (trimmed.startsWith('<protocol ')) {
      const idMatch = trimmed.match(/id="([^"]+)"/);
      currentId = idMatch ? idMatch[1] : '';
      currentName = '';
      isCrystType = false;
      textBuffer = '';
    }

    // <protocolName>
    const nameMatch = trimmed.match(/<protocolName>(.*?)<\/protocolName>/);
    if (nameMatch) currentName = nameMatch[1];

    // <protocolType>crystallization</protocolType>
    if (trimmed.includes('<protocolType>crystallization</protocolType>')) {
      isCrystType = true;
    }

    // <protocolText>
    if (trimmed.startsWith('<protocolText>')) {
      inProtocolText = true;
      // 같은 줄에 내용이 있을 수 있음
      const inlineMatch = trimmed.match(/<protocolText>(.*?)<\/protocolText>/);
      if (inlineMatch) {
        textBuffer = inlineMatch[1];
        inProtocolText = false;
      } else {
        textBuffer = trimmed.replace('<protocolText>', '');
      }
    } else if (inProtocolText) {
      if (trimmed.includes('</protocolText>')) {
        textBuffer += ' ' + trimmed.replace('</protocolText>', '');
        inProtocolText = false;
      } else {
        textBuffer += ' ' + trimmed;
      }
    }

    // </protocol>
    if (trimmed === '</protocol>') {
      protocolCount++;
      if (protocolCount % 100000 === 0) {
        console.log(`  ${protocolCount} protocols processed, ${protocols.length} crystallization found`);
      }

      if (isCrystType && textBuffer.trim().length > 30) {
        protocols.push({
          id: currentId,
          name: currentName,
          text: textBuffer.trim().slice(0, 2000), // 최대 2000자
        });

        // 최대 50000개
        if (protocols.length >= 50000) {
          console.log('  50000개 도달, 중단');
          break;
        }
      }

      currentId = '';
      currentName = '';
      isCrystType = false;
      textBuffer = '';
    }
  }

  console.log(`\nTotal protocols scanned: ${protocolCount}`);
  console.log(`Crystallization protocols extracted: ${protocols.length}`);

  await writeFile(OUTPUT_FILE, JSON.stringify(protocols, null, 2));
  console.log(`Saved to: ${OUTPUT_FILE}`);

  // 샘플
  console.log('\n=== Sample (first 3) ===');
  for (const p of protocols.slice(0, 3)) {
    console.log(`\n[${p.id}] ${p.name}`);
    console.log(p.text.slice(0, 300) + '...');
  }
}

main().catch(console.error);
