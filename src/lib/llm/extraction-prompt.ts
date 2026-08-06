/**
 * LLM 논문 추출 프롬프트
 * 논문 텍스트에서 단백질 발현/정제/결정화 조건을 구조화하여 추출
 */

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert structural biologist extracting experimental data from scientific papers.
Extract protein expression, purification, and crystallization conditions into structured JSON.
Only extract information explicitly stated in the text — never infer or hallucinate.
For each extracted value, include the source sentence from the paper.`;

export function buildExtractionPrompt(text: string, targetTable: string) {
  const schemas: Record<string, string> = {
    kbsi_expression: `{
  "protein_name": "string",
  "host": "string (e.g. E. coli BL21(DE3))",
  "strain": "string",
  "vector": "string",
  "tag": "string (e.g. His6, GST)",
  "induction_temp": "number (Celsius)",
  "yield_mg_l": "number",
  "result_level": "no_expression | insoluble | low | moderate | high",
  "conditions": "string (full protocol summary)",
  "source_snippet": "string (exact sentence from paper)"
}`,
    kbsi_crystallization: `{
  "protein_name": "string",
  "protein_concentration": "number (mg/mL)",
  "precipitant_type": "string (e.g. PEG 3350)",
  "precipitant_conc": "number",
  "precipitant_unit": "string (%, M, mM)",
  "buffer_type": "string",
  "ph": "number",
  "temperature": "number (Celsius)",
  "additive": "string or null",
  "space_group": "string or null",
  "resolution": "number (Angstrom) or null",
  "outcome": "clear | precipitate | phase_separation | microcrystal | single_crystal | diffraction_quality",
  "source_snippet": "string (exact sentence from paper)"
}`,
    kbsi_purification: `{
  "protein_name": "string",
  "method_summary": "string (e.g. Ni-NTA -> TEV cleavage -> SEC)",
  "final_purity": "number (%) or null",
  "final_yield": "number (mg) or null",
  "result_level": "failed | low | acceptable | high",
  "source_snippet": "string (exact sentence from paper)"
}`,
  };

  const schema = schemas[targetTable] || schemas.kbsi_expression;

  return `Extract all ${targetTable.replace('kbsi_', '')} data from the following paper text.
Return a JSON array of objects matching this schema:
${schema}

If multiple conditions/experiments are described, return one object per experiment.
If a value is not mentioned, use null.
Always include source_snippet with the exact sentence where you found each piece of data.

Paper text:
---
${text.slice(0, 15000)}
---

Respond ONLY with a valid JSON array. No explanation.`;
}
