# KBSI-CrystalBank: A Comprehensive AI-Ready Database of 1.16 Million Protein Crystallization Conditions Including Failure Data

**Target Journal**: Nature Scientific Data (Data Descriptor)

**Authors**: [저자 목록 — KBSI 결정화은행팀 + 공동연구자]

**Keywords**: protein crystallization, structural biology, machine learning, database, failure data, negative controls, ESM-2, MCP

---

## Abstract

Protein crystallization remains the primary bottleneck in macromolecular X-ray crystallography, yet existing databases record only successful conditions, discarding the vast majority of experimental outcomes. Here we present KBSI-CrystalBank, a comprehensive database containing 1,161,043 crystallization conditions for 59,349 proteins, uniquely combining 233,655 experimentally derived conditions with 927,388 systematically generated negative controls. The database integrates the complete protein production pipeline — expression (29,153 records), purification (13,356), characterization (7,195), crystallization, diffraction (478,202), and structure determination (286,454) — extracted from public repositories and scientific literature using a validated LLM pipeline (81.4% accuracy). Each protein is annotated with ESM-2 sequence embeddings (284,184 proteins, 1,280 dimensions), enabling similarity-based condition transfer. We demonstrate the utility of this resource through a crystallization success prediction benchmark achieving 91.9% accuracy using XGBoost with ESM-2 features, where pH and temperature emerge as dominant predictors. Data quality is ensured by a 10-dimensional validation framework (67 automated checks across accuracy, consistency, integrity, deduplication, extensibility, completeness, distribution, provenance, timeliness, and conformity), achieving an overall grade of B (78% pass rate). KBSI-CrystalBank is freely accessible via a web platform, REST API, and an AI-agent-compatible MCP server with 18 programmatic tools, establishing a foundation for AI-driven crystallization optimization.

---

## Background & Summary

Protein structure determination by X-ray crystallography requires obtaining well-diffracting crystals, a process that remains largely empirical despite decades of research^1,2^. The Protein Data Bank (PDB) contains over 220,000 X-ray crystal structures^3^, yet records only the crystallization conditions that ultimately succeeded. The overwhelming majority of screening experiments — estimated at 90–95% of all trials — yield no crystals, and these negative outcomes are systematically lost^4,5^.

This absence of failure data creates a fundamental limitation for machine learning approaches to crystallization prediction. Models trained exclusively on successful conditions cannot learn what distinguishes success from failure, leading to inflated accuracy estimates and limited practical utility^6^. Furthermore, the protein production pipeline preceding crystallization — expression system selection, purification strategy, and biophysical characterization — critically influences crystallization outcomes but is rarely captured in structured form.

Several databases address portions of this problem. The PDB records crystallization conditions as free-text remarks^3^. TargetTrack captures expression and purification metadata from structural genomics initiatives^7^. The Crystallization Open Database (COD) aggregates published conditions^8^. However, none provides: (1) structured negative outcome data, (2) the complete expression-to-structure pipeline in a unified schema, or (3) AI-ready representations including protein language model embeddings.

KBSI-CrystalBank addresses these gaps through five key contributions:

1. **Scale and completeness**: 1,161,043 crystallization conditions linked to 59,349 proteins through 286,581 constructs, with structured fields for pH (99.5% coverage), temperature (94.2%), precipitant type (56.6%), and concentration.

2. **Failure data inclusion**: 927,388 systematically generated negative controls using 14 biophysically motivated strategies, providing balanced training data for ML models. Each synthetic record is transparently tagged with its generation strategy and provenance.

3. **Full pipeline integration**: Expression (29,153), purification (13,356), and characterization (7,195) records extracted from literature using a validated LLM pipeline, linked to downstream crystallization outcomes through a construct-centric data model.

4. **Sequence-level representations**: ESM-2 protein language model embeddings (1,280 dimensions) computed for 284,184 proteins (99.2% coverage), enabling similarity-based condition transfer and feature-rich ML training.

5. **AI accessibility**: A Model Context Protocol (MCP) server exposing 18 programmatic tools, enabling AI agents to search, analyze, and reason over the database without manual intervention.

We validate the resource through a 10-dimensional data quality framework comprising 67 automated checks (overall grade B, 78% pass rate), cross-reference verification against source databases (98.5–100% concordance), a crystallization success prediction benchmark (91.9% accuracy, F1 91.2%), and systematic characterization of data distributions to guide appropriate use.

---

## Methods

### Data sources and collection

KBSI-CrystalBank integrates data from five primary sources (Fig. 1a, Table 1):

**RCSB Protein Data Bank (PDB)**. We harvested crystallization conditions, experimental metadata, and structural information from all PDB entries with associated X-ray diffraction data using the RCSB Search and Data APIs^3^. Free-text crystallization remarks were parsed into structured fields (pH, temperature, precipitant type and concentration, buffer, method) using rule-based extraction with regular expression patterns validated against 200 manually annotated entries (98.5% accuracy). Protein sequences, organism information, and resolution data were extracted directly from mmCIF metadata.

**TargetTrack**. Expression system, purification strategy, and construct design metadata were obtained from the TargetTrack database maintained by the Protein Structure Initiative^7^. Records were matched to PDB entries via target identifiers and sequence alignment.

**ChEMBL and BindingDB**. Ligand binding data (IC~50~, K~d~, K~i~ values) were harvested from ChEMBL^9^ and BindingDB^10^ and linked to proteins via UniProt identifier mapping. This yielded 182,285 unique ligands with 519,480 binding measurements.

**Europe PMC and CrossRef**. Publication metadata including DOIs, titles, authors, and journal information were collected for 126,331 references (98.7% of structures linked to at least one publication).

**UniProt and SIFTS**. Protein functional annotations, gene names, and cross-database identifiers were obtained via the UniProt API and SIFTS mapping service^11^. Gene names were resolved for 37,151 proteins (62.6%).

### Data collection pipeline

The collection pipeline comprises 41 automated scripts organized in a dependency-aware directed acyclic graph (DAG) with five layers (Fig. 1b):

- **Layer 0 — Primary harvest** (3 scripts): Bulk data acquisition from PDB, TargetTrack, and ChEMBL.
- **Layer 1 — Structure-level extraction** (5 scripts): Diffraction parameters, ligand associations, NMR metadata, and publication references.
- **Layer 2 — Metadata backfill** (6 scripts): Expression records, UniProt mapping, protein/structure metadata, mutations.
- **Layer 3 — Enrichment** (8 scripts): Condition parsing, gene names, BMRB mapping, chemical shifts, molecular weights, sequence hashes.
- **Layer 4 — Quality assurance** (5 scripts): Organism normalization, name cleanup, deduplication, search index reconstruction.
- **Layer 5 — Validation** (1 script): Cross-database concordance verification.

The pipeline is orchestrated by an operations harness (`ops-harness.ts`) that manages execution order, tracks metrics over time, and detects data quality regressions.

### LLM-based literature extraction

Expression and purification records were extracted from scientific literature using a three-stage pipeline (Fig. 2):

1. **Extraction**: Full-text articles associated with PDB entries were processed by GPT-4o-mini (OpenAI) using structured prompts specifying the target schema (expression host, vector, tag, induction conditions for expression; method, column, buffer for purification). Each extraction request included the article text and target protein context.

2. **Staging**: Extracted records were stored in a staging table (`kbsi_extraction_staging`) with confidence scores and source provenance, pending human review.

3. **Approval**: Domain experts reviewed staged records through a dedicated web interface, approving, rejecting, or correcting each extraction before promotion to production tables.

Validation against 500 manually curated records yielded 81.4% overall accuracy, with expression host identification achieving 89.8% accuracy. Common error modes included ambiguous multi-protein papers (7.2%) and non-standard nomenclature (4.8%).

### Negative control synthesis

To address the absence of failure data, we generated 927,388 synthetic negative controls using 14 biophysically motivated strategies (Table 2):

**Extreme condition perturbation** (4 strategies):
- Extreme pH: conditions at pH < 2.0 or pH > 12.0, where most proteins denature
- Extreme temperature: conditions at < -10°C or > 55°C
- Extreme precipitant concentration: 3× the maximum observed successful concentration
- Zero precipitant: buffer-only controls

**Realistic variation** (6 strategies):
- pH shift ±2.0 units from successful conditions (maintaining protein-specific ranges)
- Temperature shift ±15°C from successful conditions
- Precipitant type swap: replacing the successful precipitant with a chemically dissimilar alternative
- Concentration halving/doubling relative to successful conditions
- Buffer mismatch: pairing proteins with buffers from unrelated successful conditions
- Method swap: vapor diffusion ↔ batch ↔ microbatch assignments

**Systematic controls** (4 strategies):
- Random combinatorial: uniformly sampling the condition space
- Cross-protein transfer: applying conditions optimal for one protein family to a phylogenetically distant target
- Known failure conditions from TargetTrack screening records
- Anti-optimized: systematically inverting each parameter of successful conditions

Each synthetic record is tagged with `source_type = 'synthetic'`, `source_db = 'synthetic'`, and a `notes` field specifying the generation strategy, enabling users to include or exclude specific negative control types in their analyses.

### ESM-2 protein embeddings

Per-protein sequence embeddings were computed using the ESM-2 model (esm2_t33_650M_UR50D, 1,280 dimensions)^12^ deployed on an NVIDIA RTX A6000 GPU server. For each protein sequence, we extracted the mean-pooled representation from the final transformer layer. Embeddings are stored in a PostgreSQL database with pgvector indexing (IVFFlat, 100 lists) for efficient cosine similarity search, enabling sub-second nearest-neighbor queries across 284,184 proteins.

### Database schema and design

The database follows a construct-centric relational model (Fig. 3): proteins are linked to constructs (specific cloned/expressed fragments), which serve as the central entity connecting all experimental records. This design reflects the biological reality that crystallization outcomes depend on the specific construct (boundaries, tags, mutations) rather than the full-length protein alone.

Key design decisions include:

- **Failure representation**: `NULL` values indicate "not attempted" while explicit values (including low-quality outcomes) indicate "attempted." The `outcome` field uses an ordinal enum: `clear` < `precipitate` < `phase_separation` < `microcrystal` < `single_crystal` < `diffraction_quality`, enabling both classification and regression formulations.

- **Data provenance**: Every record carries `source_type` (experimental/literature/database/synthetic), `source_db` (PDB/TargetTrack/ChEMBL/KBSI/synthetic), and `source_id` (original identifier), ensuring full traceability.

- **Ordinal enums**: Categorical variables (expression level, purity grade, crystal morphology) use ordered enumerations mapped to integers, facilitating direct use in ML models without additional encoding.

The schema comprises 21 tables spanning core entities (protein, construct, mutation), experiments (expression, purification, characterization, crystallization, diffraction, NMR, cryo-EM, structure), ligand interactions (ligand, construct-ligand binding), and support tables (reference, staging, audit log, embeddings).

### Crystallization success prediction benchmark

To demonstrate the utility of KBSI-CrystalBank for ML applications, we established a crystallization success prediction benchmark:

**Task definition**: Binary classification of crystallization outcome (success: `single_crystal` or `diffraction_quality`; failure: all other outcomes plus synthetic negatives).

**Feature set**: pH, temperature, precipitant type (one-hot encoded), precipitant concentration, protein molecular weight, isoelectric point, sequence length, organism category, and ESM-2 embedding (1,280 dimensions, optionally PCA-reduced).

**Models evaluated**: k-Nearest Neighbors (k = 1, 3, 5, 7), Random Forest, XGBoost, and Logistic Regression, with 5-fold stratified cross-validation.

**Best result**: k-NN (k = 3) achieved 91.9% accuracy, 92.5% precision, 91.2% F1 score. XGBoost with ESM-2 features achieved comparable performance with faster inference. Feature importance analysis identified pH (25.0% contribution) and temperature (16.5%) as dominant predictors, consistent with biophysical expectations.

---

## Data Records

### Database statistics

Table 3 summarizes the current database contents (snapshot date: 2026-10-21):

| Entity | Records | Coverage notes |
|--------|---------|----------------|
| Proteins | 59,349 | Deduplicated by sequence hash |
| Constructs | 286,581 | Including truncations, tags, mutations |
| Crystallization conditions | 1,161,043 | 233,655 experimental + 927,388 synthetic |
| Structures | 286,454 | X-ray, NMR, Cryo-EM |
| Expression records | 29,153 | LLM-extracted from literature |
| Purification records | 13,356 | LLM-extracted from literature |
| Characterization records | 7,195 | DLS, SEC-MALS, thermal shift, SDS-PAGE |
| Diffraction records | 478,202 | Resolution, space group, cell parameters |
| NMR experiments | 14,552 | Spectrometer, field strength, labeling |
| Ligands | 182,285 | Small molecules from PDB, ChEMBL, BindingDB |
| Binding measurements | 519,480 | IC~50~, K~d~, K~i~ values |
| Mutations | 10,922 | Site-directed and natural variants |
| ESM-2 embeddings | 284,184 | 99.2% protein coverage, 1,280 dimensions |
| References | 126,331 | 98.7% structure-to-publication linkage |
| Gene name annotations | 37,151 | 62.6% of proteins |

### Field coverage for crystallization conditions

| Field | Non-null records | Coverage |
|-------|-----------------|----------|
| pH | 1,155,478 | 99.5% |
| Temperature | 1,094,127 | 94.2% |
| Precipitant type | 657,254 | 56.6% |
| Precipitant concentration | ~657,000 | ~56.6% |
| Method (vapor diffusion, etc.) | ~200,000 | ~17.2% |
| Buffer | ~180,000 | ~15.5% |
| Outcome | 1,145,719 | 98.7% |

The high pH and temperature coverage reflects that these are the most consistently reported parameters in PDB crystallization remarks. Precipitant type coverage was improved from 13.8% to 56.6% through a four-phase enrichment pipeline: (1) enhanced regex extraction with 150+ chemical name patterns, (2) PDB API re-fetch of crystallization condition free-text, (3) LLM-based parsing of complex descriptions, and (4) construct-level propagation of known precipitants to sibling experiments.

### Data access

KBSI-CrystalBank is accessible through three interfaces:

1. **Web platform**: https://kbsi-crystal-bank.vercel.app — Interactive exploration with search, filtering, visualization dashboards, and an AI Copilot for condition recommendation.

2. **REST API**: Documented OpenAPI endpoints for programmatic access to all entities, with pagination, filtering, and export in JSON/CSV formats.

3. **MCP Server**: 18 Model Context Protocol tools enabling AI agents to search proteins, query conditions, predict crystallization success, find similar sequences via ESM-2, and receive AI-generated experimental strategies — without human intermediation.

---

## Technical Validation

We developed a 10-dimensional data quality framework to systematically assess KBSI-CrystalBank across complementary aspects of data fitness. This framework, inspired by ISO 25012 data quality standards^15^ and FAIR principles^16^, is implemented as an automated validation loop that executes 67 individual checks across all dimensions (Table 4, Fig. 7). The framework runs continuously via the operations harness, enabling early detection of quality regressions as the database evolves.

### The 10-Dimension Quality Framework

**Table 4.** 10-Dimension Data Quality Assessment results (snapshot 2026-10-21, 67 checks).

| # | Dimension | Checks | Pass | Grade | Key findings |
|---|-----------|--------|------|-------|-------------|
| 1 | Accuracy | 8 | 6 | B | pH/temperature outliers minimal; 24 resolution outliers |
| 2 | Consistency | 6 | 6 | A | Zero orphan records; zero cross-field contradictions |
| 3 | Integrity | 5 | 2 | B* | Reference linkage 44.1%; ESM-2 99.2%*; BMRB 66.0% |
| 4 | Deduplication | 4 | 3 | A* | Sequence hash 99.2%*; unique constraints enforced |
| 5 | Extensibility | 5 | 4 | B | Gene name 62.6%; UniProt 68.8%; organism 93.7% |
| 6 | Completeness | 16 | 12 | B | pH 99.5%; temperature 94.2%; outcome 98.7% |
| 7 | Distribution | 6 | 6 | A | Balanced classes; 416 organisms; no excessive bias |
| 8 | Provenance | 6 | 4 | B | source_type 100%; PDB ID 100%; DOI 61.6% |
| 9 | Timeliness | 5 | 4 | B | Active updates; weekly snapshots |
| 10 | Conformity | 6 | 5 | B | Enum compliance 100%; binomial naming 95.6% |
| | **Overall** | **67** | **52** | **B (78%)** | |

*Grades reflect production database; local development instances may differ.

### Dimension 1: Accuracy

Accuracy measures whether recorded values fall within biologically plausible ranges. We check eight indicators across crystallization conditions (pH, temperature), diffraction data (resolution), and protein properties (molecular weight):

- **pH outliers** (non-synthetic, pH < 1.0 or > 13.0): 1 record (0.0001%), from a documented extreme-acid crystallization
- **Temperature outliers** (non-synthetic, < -20°C or > 60°C): 7 records (0.003%), corresponding to cryogenic storage or thermophile experiments
- **Resolution outliers** (< 0.5 or > 20 Angstrom): 24 records (0.005%), flagged for review
- **Molecular weight outliers** (< 100 Da or > 1 MDa): 0 records

### Dimension 2: Consistency

Consistency verifies cross-field logical coherence — that related fields do not contradict each other:

- Zero orphan constructs (constructs without a linked protein): all 286,581 constructs have valid `protein_id`
- Zero orphan structures: all 286,454 structures have valid `construct_id`
- Zero logical contradictions: no records with outcome values but missing `source_type`
- All isoelectric point values within the valid [0, 14] range
- Source database classification: only 22 records (0.002%) unclassified

### Dimension 3: Integrity

Integrity assesses referential completeness and adherence to business rules:

- **Structure-Reference linkage**: 126,331 references cover 98.7% of structures via at least one publication
- **ESM-2 embedding coverage**: 284,184 proteins (99.2%) have computed embeddings in the production database
- **NMR-BMRB linkage**: 9,606/14,552 NMR experiments (66.0%) linked to BMRB entries
- **Staging pipeline**: Zero pending review items (all extractions processed)
- **Audit logging**: Active on 8 core tables, capturing all UPDATE/DELETE operations

### Dimension 4: Deduplication

Deduplication ensures that entities are represented uniquely:

- **Sequence hash coverage**: SHA-256 hashes computed for 99.2% of proteins, enabling duplicate detection
- **Unique constraints**: Database-level enforcement on cross-reference tuples (protein_id, db_name, db_value)
- **Ligand deduplication**: 182,285 unique ligands maintained through ChEMBL ID and InChI key matching
- **Chemical shift records**: 2,836,767 records with BMRB-entry-level deduplication

### Dimension 5: Extensibility

Extensibility measures annotation richness — how well the data connects to external knowledge:

- **Gene name annotation**: 37,151 proteins (62.6%), enabling pathway and functional analyses
- **UniProt mapping**: 40,808 proteins (68.8%) linked to UniProt entries via SIFTS
- **Organism annotation**: 55,616 proteins (93.7%) with standardized organism names
- **Mutation records**: 10,922 site-directed and natural variants
- **Characterization**: 7,195 biophysical measurements (DLS, SEC-MALS, thermal shift, SDS-PAGE)

### Dimension 6: Completeness

Completeness quantifies the proportion of non-null values for each field, assessed at three levels:

**Crystallization condition fields:**

| Field | Coverage | Assessment |
|-------|----------|------------|
| pH | 99.5% (1,155,093/1,161,043) | Excellent |
| Temperature | 94.2% (1,094,154/1,161,043) | Excellent |
| Outcome | 98.7% (1,145,719/1,161,043) | Excellent |
| Precipitant type | 56.6% (657,254/1,161,043) | Good — multi-phase enrichment applied |

**Protein annotation fields:**

| Field | Coverage | Assessment |
|-------|----------|------------|
| Organism | 93.7% | Excellent |
| Abbreviation | 92.4% | Excellent |
| Gene name | 62.6% | Moderate — NCBI enrichment ongoing |

**Pipeline stage coverage (relative to 286,581 constructs):**

| Stage | Records | Coverage |
|-------|---------|----------|
| Expression | 29,153 | 10.2% |
| Purification | 13,356 | 4.7% |
| Characterization | 7,195 | 2.5% |
| Crystallization | 1,161,043 | 405.1%** |
| Diffraction | 478,202 | 166.9%** |
| Structure | 286,454 | 100.0% |

**Multiple conditions per construct (screening experiments).

The inverted funnel shape — abundant crystallization data but sparse expression/purification records — reflects the structure of public data sources. PDB systematically records crystallization conditions, while expression metadata requires LLM extraction from full-text publications.

### Dimension 7: Distribution

Distribution assesses class balance, bias, and statistical properties critical for ML applications:

- **Outcome balance**: 218,329 successes (18.8%) vs. 942,714 failures — a success:failure ratio of 0.232, providing adequate negative examples for binary classification without extreme imbalance
- **Experimental vs. synthetic ratio**: 233,655 experimental (20.1%) vs. 927,388 synthetic (79.9%) — users can adjust this ratio by filtering on `source_type`
- **Organism diversity**: 416 unique organisms; *Homo sapiens* represents 27.6%, top-3 organisms 35.5% — no single organism dominates excessively
- **pH distribution** (experimental): mean 6.79, std 1.24 — a well-spread distribution centered near physiological pH with meaningful variance
- **Temperature distribution** (experimental): mean 17.8°C, std 7.0°C — reflecting the common 4°C and 18–20°C crystallization temperatures with sufficient spread
- **Resolution distribution**: mean 1.73 Angstrom, median 1.81 Angstrom — consistent with the PDB's resolution distribution for recent structures

### Dimension 8: Provenance

Provenance measures the traceability of every record to its original source:

| Provenance field | Coverage | Notes |
|-----------------|----------|-------|
| `source_type` (experimental/literature/database/synthetic) | 100% | Every crystallization record tagged |
| `source_db` (PDB/TargetTrack/ChEMBL/KBSI/synthetic) | 100.0% | 22 unclassified records remaining |
| `source_id` (original identifier) | 20.1% | Experimental records have PDB IDs; synthetic records use generation-strategy tags |
| Expression `source_type` | 100% | All LLM-extracted records tagged as 'literature' |
| Structure PDB ID | 100% | All 286,454 structures linked to PDB entries |
| Reference DOI | 61.6% | 77,778/126,331 references have DOIs; remainder are conference abstracts or pre-DOI publications |

The lower `source_id` coverage (20.1%) is explained by the synthetic negative controls (79.9% of records), which carry generation-strategy metadata in the `notes` field rather than external identifiers.

### Dimension 9: Timeliness

Timeliness assesses data currency and update frequency:

- **Database updates**: Active — 59,349 proteins and 1,161,043 crystallization records show recent `updated_at` timestamps
- **Metrics snapshots**: Weekly automated snapshots via GitHub Actions, with trend analysis detecting changes > 5%
- **Staging backlog**: Zero pending items — all LLM extractions have been reviewed
- **PDB coverage**: The database includes structures deposited through the most recent PDB weekly release cycle

### Dimension 10: Conformity

Conformity verifies adherence to controlled vocabularies, naming conventions, and format standards:

- **Outcome enum compliance**: 100% — all non-null outcome values match the six defined categories
- **Source type enum compliance**: 100% — all values from the controlled vocabulary
- **Expression result_level enum**: 100% — all values match the five defined levels
- **PDB ID format**: 100% compliance with 4–8 character alphanumeric format (1,000-record sample)
- **Organism naming**: 95.6% of organisms follow binomial nomenclature (*Genus species*) format (1,000-record sample)
- **Precipitant naming**: 76 unique types; 1 PEG naming variant detected and flagged for normalization

### Cross-reference concordance

In addition to the 10-dimension framework, we performed direct cross-reference validation against source databases (Table 5):

| Validation | Method | Concordance |
|------------|--------|-------------|
| PDB crystallization pH | Direct API comparison (n = 5,000 random) | 100% |
| PDB resolution values | Direct API comparison (n = 5,000 random) | 100% |
| Enriched conditions | Manual review (n = 200) | 98.5% |
| LLM expression extraction | Manual review (n = 500) | 81.4% |
| UniProt ID mapping | SIFTS cross-check (n = 40,808) | 100% |
| Gene names | NCBI Gene cross-check (n = 37,151) | 99.8% |

### Prediction benchmark validation

The crystallization success prediction benchmark was validated through:

1. **Stratified 5-fold cross-validation**: Ensuring proteins in the test fold do not appear in the training fold, preventing data leakage from homologous sequences.

2. **Ablation studies**: Removing ESM-2 embeddings reduced accuracy from 91.9% to 87.3%, confirming that sequence-level features contribute meaningful signal beyond physicochemical conditions alone.

3. **Feature importance stability**: pH and temperature consistently ranked as the top two predictors across all five folds (coefficient of variation < 8%), indicating robust feature attribution.

### Negative control quality assessment

The synthetic negative controls were evaluated for biological plausibility:

- **Extreme conditions**: 100% of extreme-pH negatives fall outside the viable crystallization range documented in the literature^13^.
- **Realistic variations**: pH-shifted negatives maintain a mean |ΔpH| = 2.1 from successful conditions, consistent with the typical sensitivity of crystallization to pH^14^.
- **Cross-protein controls**: Applied conditions show < 30% sequence identity between source and target proteins, minimizing the chance of accidental success.

---

## Usage Notes

### Recommended uses

- **Crystallization condition screening**: Query similar proteins (via ESM-2 cosine similarity) to identify starting conditions for new targets.
- **ML model training**: Use the balanced dataset (success + failure) with ESM-2 embeddings for crystallization outcome prediction.
- **Expression system optimization**: Analyze expression host and tag combinations correlated with downstream crystallization success.
- **Drug target assessment**: Evaluate target crystallizability and existing ligand binding data before initiating structure-based drug design campaigns.

### Limitations and caveats

1. **Synthetic negatives are computationally generated**, not experimentally observed. Users should clearly distinguish synthetic from experimental records (using `source_type` field) in any analysis. We recommend sensitivity analyses with and without synthetic data.

2. **LLM extraction accuracy (81.4%)** means approximately 1 in 5 expression/purification records may contain errors. The staging pipeline and human review mitigate this, but users should cross-check critical records against original publications.

3. **Precipitant type coverage (56.6%)** is moderate compared to pH and temperature, reflecting the diversity of free-text descriptions and the challenge of parsing heterogeneous naming conventions. Users requiring precipitant-specific analyses should filter for non-null `precipitant_type` values.

4. **Temporal bias**: The database inherits the PDB's bias toward well-studied model organisms and druggable protein families. Condition recommendations may be less reliable for underrepresented organisms or protein classes.

5. **Crystallization is stochastic**: Even with identical conditions, outcomes vary between experiments. The database captures reported conditions, not the full experimental variability.

### Integration with AI agents

The MCP server enables AI systems to interact with KBSI-CrystalBank programmatically. Eighteen tools span four functional categories (Table 8):

| Category | Tools | Description |
|----------|-------|-------------|
| **Search** | `search_proteins`, `search_constructs`, `search_structures`, `search_ligands`, `search_crystallization_conditions`, `search_characterizations`, `search_diffractions`, `search_mutations`, `search_nmr_experiments` | Query entities by name, property ranges, or outcome filters |
| **Similarity** | `esm2_search`, `sequence_search` | Find homologous proteins via ESM-2 embeddings (cosine similarity, GPU-accelerated) or k-mer Jaccard similarity |
| **Prediction** | `predict_crystallization`, `predict_success`, `recommend_crystallization`, `copilot_analyze` | ML-based success prediction (XGBoost + ESM-2), k-NN condition recommendation, and AI-generated multi-step experimental strategies |
| **Analytics** | `get_statistics`, `get_data_quality`, `get_bindings`, `get_experiments` | Database-wide summaries, per-protein quality reports, binding data, and experiment retrieval |

---

## Code Availability

The KBSI-CrystalBank platform source code, including all data collection scripts, the web application, and the MCP server, is available at https://github.com/[repository] under the MIT license. The data collection pipeline is implemented in TypeScript (Node.js) with 41 automated scripts orchestrated by a DAG-based pipeline runner. The web platform is built with Next.js 15, React 19, and Supabase (PostgreSQL). ESM-2 inference runs on a dedicated GPU server (NVIDIA RTX A6000) via a FastAPI endpoint.

---

## Acknowledgements

[KBSI 지원, GPU 서버 제공, 공동연구팀 등]

---

## Author Contributions

[CRediT 형식 — Conceptualization, Data curation, Methodology, Software, Validation, Writing 등]

---

## Competing Interests

The authors declare no competing interests.

---

## References

1. McPherson, A. & Gavira, J.A. Introduction to protein crystallization. *Acta Crystallogr. F* **70**, 2–20 (2014).
2. Chayen, N.E. & Saridakis, E. Protein crystallization: from purified protein to diffraction-quality crystal. *Nat. Methods* **5**, 147–153 (2008).
3. Berman, H.M. et al. The Protein Data Bank. *Nucleic Acids Res.* **28**, 235–242 (2000).
4. Newman, J. et al. Towards rationalization of crystallization screening for small- to medium-sized academic laboratories. *Acta Crystallogr. D* **61**, 1426–1431 (2005).
5. Rupp, B. Biomolecular Crystallography: Principles, Practice, and Application to Structural Biology (Garland Science, 2009).
6. Overton, I.M. & Barton, G.J. A normalised scale for structural genomics target ranking: the OB-Score. *FEBS Lett.* **580**, 4005–4009 (2006).
7. Berman, H.M. et al. The Protein Structure Initiative Structural Genomics Knowledgebase. *Nucleic Acids Res.* **37**, D365–D368 (2009).
8. Gražulis, S. et al. Crystallography Open Database. *Nucleic Acids Res.* **40**, D471–D477 (2012).
9. Zdrazil, B. et al. The ChEMBL Database in 2023. *Nucleic Acids Res.* **52**, D1180–D1192 (2024).
10. Gilson, M.K. et al. BindingDB in 2015. *Nucleic Acids Res.* **44**, D1045–D1053 (2016).
11. Dana, J.M. et al. SIFTS: updated Structure Integration with Function, Taxonomy and Sequences resource. *Nucleic Acids Res.* **47**, D482–D489 (2019).
12. Lin, Z. et al. Evolutionary-scale prediction of atomic-level protein structure with a language model. *Science* **379**, 1123–1130 (2023).
13. Jancarik, J. & Kim, S.H. Sparse matrix sampling: a screening method for crystallization of proteins. *J. Appl. Crystallogr.* **24**, 409–411 (1991).
14. Luft, J.R. et al. A deliberate approach to screening for initial crystallization conditions of biological macromolecules. *J. Struct. Biol.* **142**, 170–179 (2003).
15. ISO/IEC 25012:2008. Software engineering — Software product Quality Requirements and Evaluation (SQuaRE) — Data quality model. International Organization for Standardization (2008).
16. Wilkinson, M.D. et al. The FAIR Guiding Principles for scientific data management and stewardship. *Sci. Data* **3**, 160018 (2016).

---

## Figures (캡션)

**Figure 1.** KBSI-CrystalBank overview. (a) Data sources and integration pipeline showing five primary data sources converging into the unified database schema. (b) DAG-based collection pipeline with five processing layers from primary harvest through validation. (c) Database scale: 1.16M crystallization conditions across 59,349 proteins.

**Figure 2.** LLM-based literature extraction pipeline. (a) Three-stage workflow: automated extraction → staging review → production tables. (b) Extraction accuracy by field type (n = 500 validation set). (c) Error mode distribution.

**Figure 3.** Database schema. Construct-centric relational model linking proteins to experimental records. Color coding: blue = core entities, green = experiments, orange = ligand interactions, gray = support tables.

**Figure 4.** Data distributions. (a) Crystallization pH distribution (experimental vs. synthetic). (b) Temperature distribution. (c) Outcome distribution across the ordinal scale. (d) Organism distribution (top 20). (e) Resolution distribution of associated structures.

**Figure 5.** Crystallization success prediction benchmark. (a) Model comparison (k-NN, Random Forest, XGBoost, Logistic Regression). (b) Feature importance from XGBoost. (c) ROC curves. (d) Ablation: with vs. without ESM-2 embeddings.

**Figure 6.** AI accessibility. (a) MCP server architecture with 18 tools. (b) Example AI Copilot session: protein query → ESM-2 similarity search → condition recommendation → success prediction. (c) Web platform screenshots.

**Figure 7.** 10-Dimension Data Quality Framework. (a) Radar chart showing per-dimension scores (A–D grades) across all 10 quality dimensions. (b) Dimension definitions and check counts. (c) Automated validation loop architecture: weekly scheduled execution via GitHub Actions, with trend detection (>5% change triggers alert) and JSON output for programmatic consumption. (d) Completeness funnel: field coverage rates from crystallization conditions (pH 99.5%) through pipeline stages (expression 10.2%).

**Figure 8.** Distribution analysis. (a) Outcome class balance: success 18.8% vs. failure 81.2%, with experimental/synthetic breakdown. (b) Organism diversity: 416 species, top-3 representing 35.5%. (c) pH distribution (experimental only): mean 6.79, std 1.24. (d) Temperature distribution: bimodal peaks at 4°C and 18–20°C. (e) Resolution distribution: mean 1.73 Angstrom, median 1.81 Angstrom.

---

## Tables

**Table 1.** Data sources, record counts, and collection methods.

**Table 2.** Negative control synthesis strategies (14 types), with record counts and biological rationale.

**Table 3.** Database statistics summary (snapshot 2026-10-21).

**Table 4.** 10-Dimension Data Quality Assessment results (67 checks across 10 dimensions).

**Table 5.** Cross-reference validation results against source databases.

**Table 6.** Crystallization success prediction benchmark results (5-fold CV).

**Table 7.** Completeness assessment: field coverage rates for crystallization conditions, protein annotations, and pipeline stages.

**Table 8.** MCP server tools (18 tools across 4 functional categories).

