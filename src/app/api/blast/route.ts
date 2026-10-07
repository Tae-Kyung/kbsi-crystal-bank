import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const BLAST_API = 'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi';

/**
 * POST /api/blast — NCBI BLAST 검색 → KBSI DB 매칭
 * 서열 → BLAST (PDB DB) → PDB ID → KBSI construct 검색
 */
export async function POST(request: Request) {
  const { sequence } = await request.json();

  if (!sequence || sequence.length < 10) {
    return NextResponse.json({ error: '서열은 최소 10잔기 이상' }, { status: 400 });
  }

  const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');

  try {
    // 1. BLAST 검색 제출
    const submitParams = new URLSearchParams({
      CMD: 'Put',
      PROGRAM: 'blastp',
      DATABASE: 'pdb',
      QUERY: cleanSeq,
      FORMAT_TYPE: 'JSON2',
      HITLIST_SIZE: '50',
      EXPECT: '0.001',
    });

    const submitRes = await fetch(BLAST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: submitParams.toString(),
    });

    const submitText = await submitRes.text();
    const ridMatch = submitText.match(/RID = (\S+)/);
    if (!ridMatch) {
      return NextResponse.json({ error: 'BLAST 제출 실패', phase: 'submit' }, { status: 500 });
    }

    const rid = ridMatch[1];

    // 2. 결과 폴링 (최대 60초)
    let results: any = null;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const checkRes = await fetch(`${BLAST_API}?CMD=Get&RID=${rid}&FORMAT_TYPE=JSON2`);
      const checkText = await checkRes.text();

      if (checkText.includes('Status=WAITING')) continue;
      if (checkText.includes('Status=FAILED')) {
        return NextResponse.json({ error: 'BLAST 검색 실패', phase: 'search' }, { status: 500 });
      }

      // 결과 파싱
      try {
        const jsonStart = checkText.indexOf('{');
        if (jsonStart >= 0) {
          results = JSON.parse(checkText.slice(jsonStart));
          break;
        }
      } catch {
        continue;
      }
    }

    if (!results) {
      return NextResponse.json({ error: 'BLAST 타임아웃 (60초)', rid, phase: 'timeout' }, { status: 504 });
    }

    // 3. 결과에서 PDB ID 추출
    const hits = results?.BlastOutput2?.[0]?.report?.results?.search?.hits || [];
    const pdbMatches = hits.map((hit: any) => {
      const desc = hit.description?.[0] || {};
      const hsp = hit.hsps?.[0] || {};
      const accession = desc.accession || '';
      const pdbId = accession.split('_')[0]?.toUpperCase();
      return {
        pdb_id: pdbId,
        title: desc.title?.slice(0, 80),
        identity: hsp.identity ? Math.round(hsp.identity / hsp.align_len * 100) : 0,
        evalue: hsp.evalue,
        score: hsp.bit_score,
        align_len: hsp.align_len,
      };
    }).filter((m: any) => m.pdb_id && m.pdb_id.length === 4);

    // 중복 PDB ID 제거
    const seenPdb = new Set<string>();
    const uniqueMatches = pdbMatches.filter((m: any) => {
      if (seenPdb.has(m.pdb_id)) return false;
      seenPdb.add(m.pdb_id);
      return true;
    }).slice(0, 20);

    // 4. KBSI DB에서 매칭
    const supabase = createServiceClient();
    const pdbIds = uniqueMatches.map((m: any) => m.pdb_id);

    let kbsiData: any[] = [];
    if (pdbIds.length > 0) {
      const { data } = await supabase
        .from('kbsi_structure')
        .select('pdb_id, construct_id, resolution, method, kbsi_construct(id, name, protein_id, expression_system, theoretical_mw, kbsi_protein(full_name, abbreviation, organism))')
        .in('pdb_id', pdbIds)
        .limit(50);
      kbsiData = data || [];
    }

    // 5. BLAST 결과 + KBSI 데이터 통합
    const combined = uniqueMatches.map((m: any) => {
      const kbsi = kbsiData.find((k: any) => k.pdb_id?.toUpperCase() === m.pdb_id);
      return {
        ...m,
        in_kbsi: !!kbsi,
        construct_id: kbsi?.construct_id,
        protein: kbsi?.kbsi_construct?.kbsi_protein?.abbreviation || kbsi?.kbsi_construct?.kbsi_protein?.full_name?.slice(0, 30),
        organism: kbsi?.kbsi_construct?.kbsi_protein?.organism,
        expression_system: kbsi?.kbsi_construct?.expression_system,
        mw: kbsi?.kbsi_construct?.theoretical_mw ? Math.round(kbsi.kbsi_construct.theoretical_mw / 1000 * 10) / 10 : null,
        resolution: kbsi?.resolution,
      };
    });

    return NextResponse.json({
      rid,
      query_length: cleanSeq.length,
      total_hits: hits.length,
      matches: combined,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'BLAST 오류', phase: 'unknown' }, { status: 500 });
  }
}
