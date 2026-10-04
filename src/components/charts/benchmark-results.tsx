'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Cell,
} from 'recharts';

// ─── Benchmark data (2026-10-05, 50K balanced dataset: 51.5% success / 48.5% fail) ───
const BINARY_DATA = [
  { k: 3, accuracy: 98.1, precision: 99.4, recall: 97.7, f1: 98.5 },
  { k: 5, accuracy: 98.2, precision: 99.5, recall: 97.8, f1: 98.6 },
  { k: 10, accuracy: 98.3, precision: 99.9, recall: 97.3, f1: 98.6 },
  { k: 15, accuracy: 98.3, precision: 100.0, recall: 97.3, f1: 98.6 },
  { k: 20, accuracy: 98.2, precision: 100.0, recall: 97.3, f1: 98.6 },
];

const MULTICLASS_DATA = [
  { k: 3, exact: 98.1, within1: 98.1, mae: 0.08 },
  { k: 5, exact: 98.2, within1: 98.2, mae: 0.07 },
  { k: 10, exact: 98.3, within1: 98.3, mae: 0.07 },
  { k: 15, exact: 98.3, within1: 98.3, mae: 0.07 },
  { k: 20, exact: 98.2, within1: 98.2, mae: 0.07 },
];

const FEATURE_IMPORTANCE = [
  { feature: 'pH', drop: 50.0, fullMark: 55 },
  { feature: 'Temperature', drop: 4.0, fullMark: 55 },
  { feature: 'Precipitant Type', drop: 0, fullMark: 55 },
  { feature: 'Precipitant Conc.', drop: 0, fullMark: 55 },
  { feature: 'Protein Conc.', drop: 0, fullMark: 55 },
  { feature: 'Additive', drop: 0, fullMark: 55 },
];

const METRICS_COLORS = {
  accuracy: '#3b82f6',
  precision: '#10b981',
  recall: '#f59e0b',
  f1: '#8b5cf6',
};

export function BenchmarkResults() {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <div className="text-3xl font-bold text-blue-600">98.3%</div>
          <div className="text-xs text-muted-foreground mt-1">Binary Accuracy (k=10)</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
          <div className="text-3xl font-bold text-green-600">99.9%</div>
          <div className="text-xs text-muted-foreground mt-1">Precision (k=10)</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <div className="text-3xl font-bold text-amber-600">98.3%</div>
          <div className="text-xs text-muted-foreground mt-1">6-Class Exact Match</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
          <div className="text-3xl font-bold text-purple-600">0.07</div>
          <div className="text-xs text-muted-foreground mt-1">MAE (k=10)</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Binary Classification Metrics */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Binary Classification (Success/Fail) by k</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={BINARY_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="k" tick={{ fontSize: 12 }} label={{ value: 'k', position: 'insideBottom', offset: -2, fontSize: 11 }} />
              <YAxis domain={[70, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="accuracy" name="Accuracy" fill={METRICS_COLORS.accuracy} radius={[2, 2, 0, 0]} />
              <Bar dataKey="precision" name="Precision" fill={METRICS_COLORS.precision} radius={[2, 2, 0, 0]} />
              <Bar dataKey="recall" name="Recall" fill={METRICS_COLORS.recall} radius={[2, 2, 0, 0]} />
              <Bar dataKey="f1" name="F1" fill={METRICS_COLORS.f1} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Feature Importance Radar */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Feature Importance (Ablation Study)</h4>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={FEATURE_IMPORTANCE}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="feature" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis angle={90} domain={[0, 8]} tick={{ fontSize: 9 }} />
              <Radar name="Accuracy Drop (%)" dataKey="drop" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip formatter={(value: number) => `${value}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Multi-class chart */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Multi-class (6-Class Outcome) by k</h4>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={MULTICLASS_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="k" tick={{ fontSize: 12 }} label={{ value: 'k', position: 'insideBottom', offset: -2, fontSize: 11 }} />
            <YAxis domain={[70, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(value: number, name: string) => name === 'MAE' ? value : `${value}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="exact" name="Exact Match" fill="#6366f1" radius={[2, 2, 0, 0]} />
            <Bar dataKey="within1" name="±1 Class" fill="#06b6d4" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Dataset: 50,000 records (balanced: 51.5% success / 48.5% fail)</span>
        <span>Split: Train 45,000 / Test 5,000</span>
        <span>Model: k-NN (weighted inverse distance)</span>
        <span>Features: 6 (normalized min-max)</span>
        <span>Key feature: <strong className="text-red-600">pH (-50%)</strong></span>
        <span>Target: 70% → <strong className="text-green-600">98.3% achieved</strong></span>
      </div>
    </div>
  );
}
