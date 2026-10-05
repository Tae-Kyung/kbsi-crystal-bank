'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── Benchmark v3 (2026-10-05, 100K realistic dataset: 22% success / 78% fail) ───
const BINARY_DATA = [
  { k: 3, accuracy: 91.9, precision: 88.9, recall: 86.7, f1: 87.8 },
  { k: 5, accuracy: 91.9, precision: 90.1, recall: 85.2, f1: 87.6 },
  { k: 10, accuracy: 90.9, precision: 89.7, recall: 82.3, f1: 85.8 },
  { k: 15, accuracy: 90.6, precision: 88.1, recall: 83.3, f1: 85.6 },
  { k: 20, accuracy: 89.8, precision: 87.8, recall: 80.8, f1: 84.1 },
];

const MULTICLASS_DATA = [
  { k: 3, exact: 88.2, within1: 90.1, mae: 0.37 },
  { k: 5, exact: 87.9, within1: 89.9, mae: 0.36 },
  { k: 10, exact: 87.6, within1: 89.7, mae: 0.37 },
  { k: 15, exact: 86.6, within1: 89.0, mae: 0.39 },
  { k: 20, exact: 85.4, within1: 87.9, mae: 0.43 },
];

const FEATURE_IMPORTANCE = [
  { feature: 'pH', drop: 25.0, fullMark: 30 },
  { feature: 'Temperature', drop: 16.5, fullMark: 30 },
  { feature: 'Precipitant Type', drop: 0.7, fullMark: 30 },
  { feature: 'Precipitant Conc.', drop: 0.4, fullMark: 30 },
  { feature: 'Protein Conc.', drop: 0, fullMark: 30 },
  { feature: 'Additive', drop: 0, fullMark: 30 },
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
          <div className="text-3xl font-bold text-blue-600">91.9%</div>
          <div className="text-xs text-muted-foreground mt-1">Binary Accuracy (k=3)</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
          <div className="text-3xl font-bold text-green-600">88.9%</div>
          <div className="text-xs text-muted-foreground mt-1">Precision (k=3)</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <div className="text-3xl font-bold text-amber-600">88.2%</div>
          <div className="text-xs text-muted-foreground mt-1">6-Class Exact Match</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
          <div className="text-3xl font-bold text-purple-600">0.37</div>
          <div className="text-xs text-muted-foreground mt-1">MAE (k=3)</div>
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

        {/* Feature Importance Horizontal Bar */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Feature Importance (Ablation Study)</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={FEATURE_IMPORTANCE.filter(f => f.drop > 0).sort((a,b) => b.drop - a.drop)} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="feature" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="drop" name="Accuracy Drop" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
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
        <span>Dataset: 100,000 records (realistic: 22% success / 78% fail)</span>
        <span>Split: Train 95,000 / Test 5,000</span>
        <span>Model: k-NN (weighted inverse distance)</span>
        <span>Features: 6 (normalized min-max)</span>
        <span>Key features: <strong className="text-red-600">pH (-25%)</strong> + <strong className="text-orange-600">Temperature (-16.5%)</strong></span>
        <span>Target: 70% → <strong className="text-green-600">91.9% achieved</strong></span>
      </div>
    </div>
  );
}
