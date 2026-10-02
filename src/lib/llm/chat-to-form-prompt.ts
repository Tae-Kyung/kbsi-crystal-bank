/**
 * Chat-to-Form: 자연어 실험 메모를 구조화된 폼 데이터로 변환하는 프롬프트
 */

export const CHAT_TO_FORM_SYSTEM_PROMPT = `You are an expert structural biologist assistant.
Parse the researcher's natural language experiment note into structured JSON.
Only extract information explicitly stated — never infer or hallucinate values.
If a value is not mentioned, use null.
Respond ONLY with a valid JSON object. No explanation, no markdown.`;

const FIELD_SCHEMAS: Record<string, string> = {
  expression: `{
  "host": "string or null (e.g. E. coli, Sf9, HEK293)",
  "strain": "string or null (e.g. BL21(DE3), Rosetta)",
  "induction_temp": "number or null (Celsius)",
  "yield_mg_l": "number or null (mg/L)",
  "solubility": "string or null",
  "result_level": "no_expression | insoluble | low | moderate | high | null",
  "conditions": "string or null (protocol summary, e.g. IPTG 0.5mM, 18C, 16h)",
  "notes": "string or null",
  "performed_by": "string or null",
  "performed_on": "string or null (YYYY-MM-DD format if date mentioned)"
}`,
  crystallization: `{
  "stage": "screening | optimization | null",
  "protein_concentration": "number or null (mg/mL)",
  "precipitant_type": "string or null (e.g. PEG 3350, PEG 4000, ammonium sulfate)",
  "precipitant_conc": "number or null",
  "precipitant_unit": "string or null (%, M, mM, w/v — default to % if ambiguous)",
  "buffer_type": "string or null (e.g. HEPES, Tris, Bis-Tris)",
  "ph": "number or null (0-14)",
  "temperature": "number or null (Celsius)",
  "additive": "string or null",
  "drop_ratio": "string or null (e.g. 1:1, 2:1)",
  "outcome": "clear | precipitate | phase_separation | microcrystal | single_crystal | diffraction_quality | null",
  "condition_detail": "string or null (screen kit, plate, well info)",
  "performed_by": "string or null",
  "performed_on": "string or null (YYYY-MM-DD format if date mentioned)"
}`,
  purification: `{
  "method_summary": "string or null (e.g. Ni-NTA -> TEV cleavage -> SEC)",
  "final_purity": "number or null (percentage)",
  "final_yield": "number or null (mg)",
  "result_level": "failed | low | acceptable | high | null",
  "notes": "string or null",
  "performed_by": "string or null",
  "performed_on": "string or null (YYYY-MM-DD format if date mentioned)"
}`,
  characterization: `{
  "method": "DLS_PDI | DLS_Rh | DSC_Tm | SECMALS_MW | MS_mass | UV_A280 | CD | other | null",
  "value_num": "number or null",
  "value_text": "string or null",
  "unit_raw": "string or null (e.g. kDa, nm, C)",
  "notes": "string or null"
}`,
  structure: `{
  "method": "X-ray | NMR | Cryo-EM | null",
  "resolution": "number or null (Angstrom)",
  "pdb_id": "string or null (4-char PDB code, e.g. 6GOD)",
  "emdb_id": "string or null",
  "notes": "string or null"
}`,
};

const EXAMPLES: Record<string, { input: string; output: string }> = {
  expression: {
    input: 'BL21에서 IPTG 0.5mM 넣고 18도 overnight 했는데 yield 25mg/L 나왔어. 결과 좋음',
    output: '{"host":"E. coli","strain":"BL21(DE3)","induction_temp":18,"yield_mg_l":25,"solubility":null,"result_level":"high","conditions":"IPTG 0.5mM, 18C, overnight","notes":null,"performed_by":null,"performed_on":null}',
  },
  crystallization: {
    input: 'BSA 10mg/mL, PEG 4000 20% w/v, pH 7.0, 18도에서 3일만에 single crystal 나왔어',
    output: '{"stage":null,"protein_concentration":10,"precipitant_type":"PEG 4000","precipitant_conc":20,"precipitant_unit":"%","buffer_type":null,"ph":7.0,"temperature":18,"additive":null,"drop_ratio":null,"outcome":"single_crystal","condition_detail":null,"performed_by":null,"performed_on":null}',
  },
  purification: {
    input: 'Ni-NTA로 1차 정제 후 SEC 돌렸더니 purity 95% 나왔고 최종 수율 8mg',
    output: '{"method_summary":"Ni-NTA -> SEC","final_purity":95,"final_yield":8,"result_level":"high","notes":null,"performed_by":null,"performed_on":null}',
  },
  characterization: {
    input: 'DLS 찍었더니 Rh 3.5nm 나옴',
    output: '{"method":"DLS_Rh","value_num":3.5,"value_text":null,"unit_raw":"nm","notes":null}',
  },
  structure: {
    input: 'X-ray로 2.1옹스트롬 resolution 나왔고 PDB에 6GOD로 등록함',
    output: '{"method":"X-ray","resolution":2.1,"pdb_id":"6GOD","emdb_id":null,"notes":null}',
  },
};

export function buildChatToFormPrompt(text: string, experimentType: string): string {
  const schema = FIELD_SCHEMAS[experimentType] || FIELD_SCHEMAS.expression;
  const example = EXAMPLES[experimentType] || EXAMPLES.expression;

  return `Parse the following researcher's experiment note into JSON matching this schema:
${schema}

Example:
Input: "${example.input}"
Output: ${example.output}

Now parse this note:
"${text.trim()}"

Respond ONLY with a valid JSON object.`;
}

export type ExperimentType = keyof typeof FIELD_SCHEMAS;
export const EXPERIMENT_TYPES = Object.keys(FIELD_SCHEMAS) as ExperimentType[];
