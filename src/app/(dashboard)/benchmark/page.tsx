import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BenchmarkResults } from '@/components/charts/benchmark-results';
import { PredictionResult } from '@/components/charts/prediction-result';
import { FullScatterChart } from '@/components/charts/full-scatter-chart';

export default function BenchmarkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">ML Benchmark & Analysis</h2>
        <p className="text-muted-foreground">
          k-NN 결정화 예측 모델 벤치마크, 실시간 예측 테스트, 전체 데이터 시각화
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Prediction Benchmark (k-NN)</CardTitle></CardHeader>
        <CardContent>
          <BenchmarkResults />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Crystallization Conditions — Full Data (pH vs Temperature)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FullScatterChart />
        </CardContent>
      </Card>

      <PredictionResult />
    </div>
  );
}
