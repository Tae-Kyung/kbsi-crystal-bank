import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function ExperimentsPage() {
  const supabase = await createClient();

  const [
    { count: exprCount },
    { count: purCount },
    { count: crystCount },
    { count: charCount },
    { count: diffCount },
    { count: structCount },
  ] = await Promise.all([
    supabase.from('kbsi_expression').select('*', { count: 'exact', head: true }),
    supabase.from('kbsi_purification').select('*', { count: 'exact', head: true }),
    supabase.from('kbsi_crystallization').select('*', { count: 'exact', head: true }),
    supabase.from('kbsi_characterization').select('*', { count: 'exact', head: true }),
    supabase.from('kbsi_diffraction').select('*', { count: 'exact', head: true }),
    supabase.from('kbsi_structure').select('*', { count: 'exact', head: true }),
  ]);

  const categories = [
    { name: 'Expression', desc: '발현 실험', count: exprCount ?? 0, color: 'bg-green-100 text-green-800' },
    { name: 'Purification', desc: '정제 실험', count: purCount ?? 0, color: 'bg-blue-100 text-blue-800' },
    { name: 'Crystallization', desc: '결정화 실험', count: crystCount ?? 0, color: 'bg-purple-100 text-purple-800' },
    { name: 'Characterization', desc: '특성분석', count: charCount ?? 0, color: 'bg-orange-100 text-orange-800' },
    { name: 'Diffraction', desc: '회절 실험', count: diffCount ?? 0, color: 'bg-red-100 text-red-800' },
    { name: 'Structure', desc: '구조결정', count: structCount ?? 0, color: 'bg-cyan-100 text-cyan-800' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Experiments</h2>
        <p className="text-muted-foreground">
          실험 데이터는 각 Construct의 상세 페이지에서 관리합니다.
          아래에서 전체 실험 데이터 현황을 확인하세요.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Card key={cat.name}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{cat.name}</h3>
                  <p className="text-sm text-muted-foreground">{cat.desc}</p>
                </div>
                <Badge className={cat.color}>{cat.count}건</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-2">실험 데이터 입력 방법</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>
              <Link href="/constructs" className="text-primary hover:underline">Constructs</Link> 페이지에서 Construct를 선택합니다.
            </li>
            <li>상세 페이지의 &quot;Experiments&quot; 탭으로 이동합니다.</li>
            <li>Expression, Purification, Crystallization 등 각 탭에서 실험 결과를 입력합니다.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
