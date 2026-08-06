-- ============================================================================
-- Seed Data: 테스트 데이터
-- ============================================================================

INSERT INTO kbsi_protein (full_name, abbreviation, gene_name, organism, owner)
VALUES
  ('Kirsten Rat Sarcoma Viral Proto-Oncogene', 'KRAS', 'KRAS', 'Homo sapiens', 'Lab A'),
  ('Epidermal Growth Factor Receptor', 'EGFR', 'EGFR', 'Homo sapiens', 'Lab A'),
  ('Green Fluorescent Protein', 'GFP', 'GFP', 'Aequorea victoria', 'Lab B');

INSERT INTO kbsi_database_id (protein_id, db_name, db_value)
VALUES
  (1, 'UniProt', 'P01116'),
  (1, 'NCBI Gene', '3845'),
  (2, 'UniProt', 'P00533'),
  (3, 'UniProt', 'P42212');

INSERT INTO kbsi_construct (protein_id, name, residues, construct_type, expression_system, vector, tag_name, tag_position)
VALUES
  (1, 'KRAS-G12D-1-169', '1-169', 'truncation', 'E. coli BL21(DE3)', 'pET-28a', 'His6', 'N-terminal'),
  (1, 'KRAS-FL', '1-189', 'full-length', 'E. coli BL21(DE3)', 'pET-28a', 'His6', 'N-terminal'),
  (2, 'EGFR-kinase', '696-1022', 'domain', 'Sf9 insect cells', 'pFastBac', 'His6', 'C-terminal');

INSERT INTO kbsi_ligand (name, smiles, mw, source)
VALUES
  ('Sotorasib', 'O=C1C=CC(=O)N1CC2=CC=C(C3=NC=C(Cl)N=C3)C=C2', 560.6, 'ChEMBL'),
  ('Gefitinib', 'COC1=CC2=C(C=C1OCCCN3CCOCC3)C(=NC=N2)NC4=CC(=C(C=C4)F)Cl', 446.9, 'ChEMBL');
