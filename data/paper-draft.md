# KBSI Protein Crystallization Bank: A Million-Scale Dataset of Crystallization Conditions Including Systematic Failure Data

## Target Journal: Nature Scientific Data

---

## Abstract

We present the KBSI Protein Crystallization Bank, a comprehensive dataset of 1.16 million protein crystallization records spanning 70,023 proteins, 286,580 constructs, and 286,454 experimentally determined structures. Unlike existing databases such as the Protein Data Bank (PDB) which only archive successful structure determinations, our dataset uniquely includes 927,000 systematically generated negative control records representing crystallization failures across 14 perturbation strategies. Each record contains structured crystallization condition parameters (pH, temperature, precipitant type/concentration, buffer, salt, additives) with ordinal outcome labels. A baseline k-nearest neighbors model achieves 91.9% binary classification accuracy and 88.2% five-class exact match on realistic test data. The dataset is freely accessible via REST API, Model Context Protocol (MCP) for AI agents, Python SDK, and bulk CSV/JSON export, enabling machine learning research for crystallization condition prediction and structure-based drug design.

## Background & Summary

### The Crystallization Bottleneck
Protein crystallization remains the primary bottleneck in X-ray crystallography-based structure determination. Despite decades of screening kit development and robotic automation, success rates for initial crystallization screens remain below 30%. A major limitation in developing predictive models is the absence of systematic failure data — published literature and databases overwhelmingly report only successful conditions due to publication bias.

### Gap in Existing Resources
- **RCSB PDB**: Archives ~208,000 X-ray structures but records only the final successful crystallization conditions
- **TargetTrack/PepcDB**: Contains crystallization protocols but primarily from successful structure determination pipelines
- **BMCD**: ~17,000 crystallization conditions, success-only

No existing database systematically records **why crystallization failed** under specific conditions.

### Our Contribution
The KBSI Protein Crystallization Bank addresses this gap by:
1. Aggregating crystallization conditions from PDB (234K records), TargetTrack (80 records), and KBSI experimental data
2. Generating 927,000 negative control records using 14 scientifically-motivated perturbation strategies
3. Providing structured, ML-ready data with full source provenance tracking
4. Offering programmatic access via REST API, MCP, and Python SDK

## Methods

### Data Collection
(See dataset-metadata.json for detailed methodology)

#### Source 1: RCSB PDB (234,000 records)
- Automated harvesting using RCSB Search API
- X-ray diffraction (226K), Cryo-EM (4.4K), NMR (2.7K)
- Extracted: pH, temperature (K→°C conversion), crystallization method details
- Expression system and organism metadata from polymer entity records

#### Source 2: TargetTrack (80 records)
- XML dump processing with LLM (GPT-4o-mini) parsing
- Free-text crystallization protocols → structured JSON fields

#### Source 3: ChEMBL (7,942 binding records)
- 20 major drug targets (KRAS, EGFR, ABL1, CDK2, HIV-1 PR, etc.)
- IC50, Kd, Ki values with SMILES structures

#### Source 4: KBSI Experimental (3 records)
- Seed data: KRAS, EGFR, GFP with full pipeline data

### Negative Control Generation

#### Extreme Perturbation Strategies (602K records)
| Strategy | Perturbation | Expected Outcome |
|----------|-------------|-----------------|
| Extreme pH Low | pH 3.0-4.0 | precipitate |
| Extreme pH High | pH 10.0-11.0 | precipitate |
| No Precipitant | concentration = 0 | clear |
| Excess Precipitant | 2.5× original | precipitate |
| Low Precipitant | 0.2× original | clear |
| High Temperature | 37°C | precipitate |
| High Salt | 5× original | precipitate |

#### Realistic Perturbation Strategies (325K records)
| Strategy | Perturbation | Expected Outcome |
|----------|-------------|-----------------|
| pH Shift Down | pH −1 to −2 | precipitate |
| pH Shift Up | pH +1 to +2 | clear |
| Temp Shift High | +8 to +15°C | precipitate |
| Temp Shift Low | −10 to −15°C | clear |
| Combined pH+Temp | Both shifted | precipitate |
| Near-Success | pH ±0.3, Temp ±2 | microcrystal |
| Phase Separation | pH +0.5 to +1.5 | phase_separation |

### Condition Enrichment
- LLM (GPT-4o-mini) parsing of `condition_detail` free-text
- Extracts: precipitant_type, precipitant_conc, buffer_type, salt_type, protein_concentration, additive
- 12,000+ records enriched (ongoing)

### Source Tracking
- `source_db` column: PDB, TargetTrack, ChEMBL, KBSI, synthetic
- `source_id` column: Original database identifier (e.g., PDB ID, ChEMBL ID)

## Data Records

### File Format
Available as JSON and CSV via API endpoint:
```
GET https://kbsi-crystal-bank.vercel.app/api/export/benchmark-dataset?format=csv
```

### Record Schema
| Field | Type | Description |
|-------|------|-------------|
| protein_name | string | Protein full name |
| organism | string | Source organism |
| construct_name | string | Construct identifier |
| expression_system | string | Expression host |
| ph | float | Crystallization pH |
| temperature | float | Temperature (°C) |
| precipitant_type | string | Precipitant name |
| precipitant_conc | float | Precipitant concentration |
| precipitant_unit | string | %, M, mM |
| buffer_type | string | Buffer name |
| salt_type | string | Salt name |
| salt_conc | float | Salt concentration (mM) |
| protein_concentration | float | Protein (mg/mL) |
| additive | string | Additive |
| outcome | enum | clear/precipitate/phase_separation/microcrystal/single_crystal/diffraction_quality |
| outcome_binary | int | 0=fail, 1=success (single_crystal+) |
| source_type | enum | experimental/literature/database/synthetic |
| source_db | string | PDB/TargetTrack/ChEMBL/KBSI/synthetic |

## Technical Validation

### Baseline Model (k-NN)
- **Binary classification**: 91.9% accuracy (k=3, 100K test)
- **5-class classification**: 88.2% exact match
- **Feature importance**: pH (−25%), Temperature (−16.5%)

### Data Quality
- pH anomalies (< 1 or > 13): 3 records (negligible)
- Temperature anomalies (> 60°C): 3 records (negligible)
- Kelvin→Celsius conversion verified

## Usage Notes

### Programmatic Access
```python
from kbsi_protein import KBSIClient
client = KBSIClient()
dataset = client.export_benchmark_dataset(format="json")
```

### MCP Integration (AI Agents)
```
MCP Server URL: https://kbsi-crystal-bank.vercel.app/api/mcp
```

### Interactive API
```
Swagger UI: https://kbsi-crystal-bank.vercel.app/api-docs
```

## Code Availability
- Repository: https://github.com/Tae-Kyung/kbsi-crystal-bank
- Web Platform: https://kbsi-crystal-bank.vercel.app
- Python SDK: `pip install kbsi-protein`

## Acknowledgements
Korea Basic Science Institute (KBSI)

## Author Contributions
[To be filled]

## Competing Interests
The authors declare no competing interests.
