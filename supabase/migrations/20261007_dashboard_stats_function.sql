-- Dashboard 통계를 단일 RPC로 반환하는 함수
-- 23개 개별 쿼리 → 1개 SQL 호출로 최적화

CREATE OR REPLACE FUNCTION dashboard_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT json_build_object(
  -- 기본 통계
  'proteins', (SELECT count(*) FROM kbsi_protein),
  'constructs', (SELECT count(*) FROM kbsi_construct),
  'expressions', (SELECT count(*) FROM kbsi_expression),
  'purifications', (SELECT count(*) FROM kbsi_purification),
  'characterizations', (SELECT count(*) FROM kbsi_characterization),
  'crystallizations', (SELECT count(*) FROM kbsi_crystallization),
  'diffractions', (SELECT count(*) FROM kbsi_diffraction),
  'structures', (SELECT count(*) FROM kbsi_structure),
  'ligands', (SELECT count(*) FROM kbsi_ligand),
  'bindings', (SELECT count(*) FROM kbsi_construct_ligand),
  'staging_pending', (SELECT count(*) FROM kbsi_extraction_staging WHERE review_status = 'pending'),

  -- Outcome 분포 (실험 + 합성)
  'outcome_clear', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'clear'),
  'outcome_precipitate', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'precipitate'),
  'outcome_phase_separation', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'phase_separation'),
  'outcome_microcrystal', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'microcrystal'),
  'outcome_single_crystal', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'single_crystal'),
  'outcome_diffraction_quality', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'diffraction_quality'),

  -- Outcome synthetic
  'synthetic_clear', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'clear' AND source_type = 'synthetic'),
  'synthetic_precipitate', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'precipitate' AND source_type = 'synthetic'),
  'synthetic_phase_separation', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'phase_separation' AND source_type = 'synthetic'),
  'synthetic_microcrystal', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'microcrystal' AND source_type = 'synthetic'),
  'synthetic_single_crystal', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'single_crystal' AND source_type = 'synthetic'),
  'synthetic_diffraction_quality', (SELECT count(*) FROM kbsi_crystallization WHERE outcome = 'diffraction_quality' AND source_type = 'synthetic'),

  -- Source 분포
  'source_cryst_pdb', (SELECT count(*) FROM kbsi_crystallization WHERE source_db = 'PDB'),
  'source_cryst_targettrack', (SELECT count(*) FROM kbsi_crystallization WHERE source_db = 'TargetTrack'),
  'source_cryst_chembl', (SELECT count(*) FROM kbsi_crystallization WHERE source_db = 'ChEMBL'),
  'source_cryst_kbsi', (SELECT count(*) FROM kbsi_crystallization WHERE source_db = 'KBSI'),
  'source_cryst_synthetic', (SELECT count(*) FROM kbsi_crystallization WHERE source_db = 'synthetic'),
  'source_cryst_unknown', (SELECT count(*) FROM kbsi_crystallization WHERE source_db IS NULL),

  'source_struct_pdb', (SELECT count(*) FROM kbsi_structure WHERE source_db = 'PDB'),
  'source_struct_targettrack', (SELECT count(*) FROM kbsi_structure WHERE source_db = 'TargetTrack'),
  'source_struct_chembl', (SELECT count(*) FROM kbsi_structure WHERE source_db = 'ChEMBL'),
  'source_struct_kbsi', (SELECT count(*) FROM kbsi_structure WHERE source_db = 'KBSI'),

  'source_ligand_chembl', (SELECT count(*) FROM kbsi_ligand WHERE source_db = 'ChEMBL')
);
$$;
