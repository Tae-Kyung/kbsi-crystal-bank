'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { Beaker, CheckCircle, AlertCircle } from 'lucide-react';

const COMMON_PRECIPITANTS = [
  'PEG 3350', 'PEG 4000', 'PEG 6000', 'PEG 8000', 'PEG 400',
  'Ammonium Sulfate', 'Sodium Chloride', 'Lithium Sulfate',
  'MPD', 'Isopropanol', 'Sodium Citrate', 'Sodium Acetate',
];

const OUTCOMES = [
  { value: 'clear', label: 'Clear (투명)', color: 'bg-gray-100 text-gray-700', desc: '결정 없음, 투명한 드롭' },
  { value: 'precipitate', label: 'Precipitate (침전)', color: 'bg-red-100 text-red-700', desc: '즉각적 또는 점진적 침전' },
  { value: 'phase_separation', label: 'Phase Sep. (상분리)', color: 'bg-orange-100 text-orange-700', desc: '두 상으로 분리' },
  { value: 'microcrystal', label: 'Microcrystal (미세결정)', color: 'bg-yellow-100 text-yellow-700', desc: '작은 결정 관찰' },
  { value: 'single_crystal', label: 'Single Crystal (단결정)', color: 'bg-green-100 text-green-700', desc: '단일 결정 성장' },
  { value: 'diffraction_quality', label: 'Diffraction Quality (회절급)', color: 'bg-emerald-100 text-emerald-700', desc: '회절 가능한 품질' },
];

export default function QuickEntryPage() {
  const router = useRouter();
  const [step, setStep] = useState<'protein' | 'condition' | 'done'>('protein');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Protein/Construct
  const [proteinSearch, setProteinSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProtein, setSelectedProtein] = useState<any>(null);
  const [selectedConstruct, setSelectedConstruct] = useState<any>(null);
  const [constructs, setConstructs] = useState<any[]>([]);

  // Step 2: Conditions
  const [form, setForm] = useState({
    ph: '', temperature: '18', precipitant_type: '', precipitant_conc: '',
    precipitant_unit: '%', protein_concentration: '', additive: '',
    outcome: 'precipitate', notes: '',
  });

  const [savedCount, setSavedCount] = useState(0);

  const supabase = createClient();

  // Protein 검색
  async function handleSearch() {
    if (!proteinSearch.trim()) return;
    const { data } = await supabase
      .from('kbsi_protein')
      .select('id, full_name, abbreviation, organism')
      .or(`full_name.ilike.%${proteinSearch}%,abbreviation.ilike.%${proteinSearch}%,gene_name.ilike.%${proteinSearch}%`)
      .limit(10);
    setSearchResults(data || []);
  }

  // Protein 선택 → Construct 로드
  async function selectProtein(protein: any) {
    setSelectedProtein(protein);
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, name, construct_type')
      .eq('protein_id', protein.id)
      .limit(20);
    setConstructs(data || []);
    if (data && data.length === 1) {
      setSelectedConstruct(data[0]);
      setStep('condition');
    }
  }

  // Construct 선택
  function selectConstruct(construct: any) {
    setSelectedConstruct(construct);
    setStep('condition');
  }

  // 저장
  async function handleSave() {
    if (!selectedConstruct) return;
    setLoading(true);
    setError('');

    const record: any = {
      construct_id: selectedConstruct.id,
      outcome: form.outcome,
      source_type: 'experimental',
      source_db: 'KBSI',
    };
    if (form.ph) record.ph = parseFloat(form.ph);
    if (form.temperature) record.temperature = parseFloat(form.temperature);
    if (form.precipitant_type) record.precipitant_type = form.precipitant_type;
    if (form.precipitant_conc) {
      record.precipitant_conc = parseFloat(form.precipitant_conc);
      record.precipitant_unit = form.precipitant_unit;
    }
    if (form.protein_concentration) record.protein_concentration = parseFloat(form.protein_concentration);
    if (form.additive) record.additive = form.additive;
    if (form.notes) record.notes = form.notes;

    const { error: err } = await supabase.from('kbsi_crystallization').insert(record);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setSavedCount(prev => prev + 1);
    setStep('done');
    setLoading(false);
  }

  // 추가 입력
  function addAnother() {
    setForm(prev => ({
      ...prev,
      ph: '', precipitant_conc: '', additive: '', notes: '',
      outcome: 'precipitate',
    }));
    setStep('condition');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Beaker className="h-6 w-6" />
          Quick Entry
        </h2>
        <p className="text-muted-foreground mt-1">
          결정화 실험 결과를 빠르게 기록합니다. 성공과 실패 모두 소중한 데이터입니다.
        </p>
        {savedCount > 0 && (
          <Badge className="mt-2 bg-green-100 text-green-700">이번 세션: {savedCount}건 저장됨</Badge>
        )}
      </div>

      {/* Step 1: Protein/Construct 선택 */}
      {step === 'protein' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. 단백질 & Construct 선택</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="단백질명, 유전자명 검색 (예: KRAS, EGFR)..."
                value={proteinSearch}
                onChange={(e) => setProteinSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch}>검색</Button>
            </div>

            {searchResults.length > 0 && !selectedProtein && (
              <div className="space-y-2">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => selectProtein(p)}
                    className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <div className="font-medium">{p.abbreviation || p.full_name}</div>
                    <div className="text-xs text-muted-foreground">{p.full_name} · <span className="italic">{p.organism}</span></div>
                  </button>
                ))}
              </div>
            )}

            {selectedProtein && (
              <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 p-3">
                <div className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedProtein.abbreviation || selectedProtein.full_name}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400">{selectedProtein.organism}</div>
                <button onClick={() => { setSelectedProtein(null); setSelectedConstruct(null); setConstructs([]); }}
                  className="text-xs text-blue-500 underline mt-1">변경</button>
              </div>
            )}

            {selectedProtein && constructs.length > 1 && !selectedConstruct && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Construct 선택:</p>
                {constructs.map(c => (
                  <button key={c.id} onClick={() => selectConstruct(c)}
                    className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <span className="font-medium">{c.name}</span>
                    {c.construct_type && <Badge variant="outline" className="ml-2 text-xs">{c.construct_type}</Badge>}
                  </button>
                ))}
              </div>
            )}

            {selectedProtein && constructs.length === 0 && (
              <p className="text-sm text-muted-foreground">Construct가 없습니다. 먼저 Construct를 등록해주세요.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: 결정화 조건 입력 */}
      {step === 'condition' && selectedConstruct && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. 결정화 조건 입력
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {selectedProtein?.abbreviation || selectedProtein?.full_name} / {selectedConstruct.name}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Outcome 선택 (가장 중요) */}
            <div>
              <label className="text-sm font-medium block mb-2">결과 (Outcome) *</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {OUTCOMES.map(o => (
                  <button key={o.value} onClick={() => setForm(f => ({ ...f, outcome: o.value }))}
                    className={`rounded-lg border p-2.5 text-left transition-all ${form.outcome === o.value ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}>
                    <div className="text-sm font-medium">{o.label}</div>
                    <div className="text-[10px] text-muted-foreground">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 핵심 조건 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">pH</label>
                <Input type="number" step="0.1" min="1" max="13" placeholder="7.0"
                  value={form.ph} onChange={(e) => setForm(f => ({ ...f, ph: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Temperature (°C)</label>
                <Input type="number" step="1" placeholder="18"
                  value={form.temperature} onChange={(e) => setForm(f => ({ ...f, temperature: e.target.value }))} />
              </div>
            </div>

            {/* 침전제 */}
            <div>
              <label className="text-sm font-medium block mb-1">침전제 (Precipitant)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_PRECIPITANTS.map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, precipitant_type: p }))}
                    className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${form.precipitant_type === p ? 'bg-blue-100 border-blue-500 text-blue-700' : 'hover:bg-muted'}`}>
                    {p}
                  </button>
                ))}
              </div>
              <Input placeholder="기타 침전제 직접 입력..."
                value={COMMON_PRECIPITANTS.includes(form.precipitant_type) ? '' : form.precipitant_type}
                onChange={(e) => setForm(f => ({ ...f, precipitant_type: e.target.value }))} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">침전제 농도</label>
                <Input type="number" step="0.1" placeholder="20"
                  value={form.precipitant_conc} onChange={(e) => setForm(f => ({ ...f, precipitant_conc: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">단위</label>
                <select value={form.precipitant_unit} onChange={(e) => setForm(f => ({ ...f, precipitant_unit: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                  <option value="%">%</option>
                  <option value="M">M</option>
                  <option value="mM">mM</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">단백질 농도 (mg/mL)</label>
                <Input type="number" step="0.1" placeholder="10"
                  value={form.protein_concentration} onChange={(e) => setForm(f => ({ ...f, protein_concentration: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">첨가제 (Additive, 선택)</label>
              <Input placeholder="glycerol 5%, DTT 1mM..."
                value={form.additive} onChange={(e) => setForm(f => ({ ...f, additive: e.target.value }))} />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">메모 (선택)</label>
              <textarea placeholder="즉시 침전 발생, 3일 후 미세결정 관찰..."
                value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={() => setStep('protein')} variant="outline">이전</Button>
              <Button onClick={handleSave} disabled={loading} className="flex-1">
                {loading ? '저장 중...' : '저장'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 완료 */}
      {step === 'done' && (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h3 className="text-xl font-bold">저장 완료!</h3>
            <p className="text-muted-foreground">
              {selectedProtein?.abbreviation || selectedProtein?.full_name}의 결정화 데이터가 기록되었습니다.
            </p>
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={addAnother}>같은 단백질 추가 입력</Button>
              <Button onClick={() => { setStep('protein'); setSelectedProtein(null); setSelectedConstruct(null); }} variant="outline">다른 단백질</Button>
              <Button onClick={() => router.push('/dashboard')} variant="ghost">대시보드로</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 안내 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong>왜 실패 데이터가 중요한가요?</strong> — AI 모델은 &quot;이 조건에서 성공&quot;과
            &quot;이 조건에서 실패&quot; 모두를 학습해야 정확히 예측합니다.
            모든 결과(clear, precipitate 포함)를 기록해주세요. 데이터가 쌓일수록 예측 정확도가 향상됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
