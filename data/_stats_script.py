
import json, sys
from scipy import stats
import numpy as np

import os
inp = json.loads(open(os.environ.get('STATS_INPUT', '/dev/stdin')).read())
test = inp['test']
d = inp['data']
result = {'p_value': 1.0, 'statistic': 0.0, 'effect_size': 0.0}

if test == 'chi2':
    observed = np.array(d['observed'], dtype=float)
    expected = np.array(d['expected'], dtype=float) if 'expected' in d else None
    if expected is not None:
        mask = expected > 0
        stat, p = stats.chisquare(observed[mask], expected[mask])
    else:
        stat, p = stats.chisquare(observed)
    n = float(np.sum(observed))
    k = len(observed)
    v = np.sqrt(stat / (n * max(k - 1, 1))) if n > 0 else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': float(v)}

elif test == 'chi2_contingency':
    table = np.array(d['table'], dtype=float)
    stat, p, dof, exp = stats.chi2_contingency(table)
    n = float(np.sum(table))
    k = min(table.shape)
    v = np.sqrt(stat / (n * max(k - 1, 1))) if n > 0 else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': float(v)}

elif test == 'ttest':
    a, b = np.array(d['group_a'], dtype=float), np.array(d['group_b'], dtype=float)
    stat, p = stats.ttest_ind(a, b, equal_var=False)
    pooled_std = np.sqrt((np.std(a, ddof=1)**2 + np.std(b, ddof=1)**2) / 2)
    cohens_d = float((np.mean(a) - np.mean(b)) / pooled_std) if pooled_std > 0 else 0
    se = np.sqrt(np.var(a, ddof=1)/len(a) + np.var(b, ddof=1)/len(b))
    diff = float(np.mean(a) - np.mean(b))
    ci_lo = diff - 1.96 * se
    ci_hi = diff + 1.96 * se
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': cohens_d, 'ci_lower': float(ci_lo), 'ci_upper': float(ci_hi)}

elif test == 'mannwhitney':
    a, b = np.array(d['group_a'], dtype=float), np.array(d['group_b'], dtype=float)
    stat, p = stats.mannwhitneyu(a, b, alternative='two-sided')
    r = 1 - (2*stat)/(len(a)*len(b)) if len(a)*len(b) > 0 else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': float(r)}

elif test == 'pearson':
    x, y = np.array(d['x'], dtype=float), np.array(d['y'], dtype=float)
    r, p = stats.pearsonr(x, y)
    n = len(x)
    se = np.sqrt((1 - r**2) / max(n - 2, 1))
    ci_lo = float(np.tanh(np.arctanh(r) - 1.96 / np.sqrt(max(n - 3, 1))))
    ci_hi = float(np.tanh(np.arctanh(r) + 1.96 / np.sqrt(max(n - 3, 1))))
    result = {'p_value': float(p), 'statistic': float(r), 'effect_size': float(r**2), 'ci_lower': ci_lo, 'ci_upper': ci_hi}

elif test == 'spearman':
    x, y = np.array(d['x'], dtype=float), np.array(d['y'], dtype=float)
    r, p = stats.spearmanr(x, y)
    result = {'p_value': float(p), 'statistic': float(r), 'effect_size': float(r**2)}

elif test == 'kruskal':
    groups = [np.array(g, dtype=float) for g in d['groups']]
    stat, p = stats.kruskal(*groups)
    n = sum(len(g) for g in groups)
    k = len(groups)
    eta2 = float((stat - k + 1) / (n - k)) if n > k else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': eta2}

elif test == 'anova':
    groups = [np.array(g, dtype=float) for g in d['groups']]
    stat, p = stats.f_oneway(*groups)
    n = sum(len(g) for g in groups)
    k = len(groups)
    eta2 = float((stat * (k - 1)) / (stat * (k - 1) + (n - k))) if (n > k and stat > 0) else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': eta2}

# Ensure all values are JSON-safe
for key in result:
    v = result[key]
    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
        result[key] = None

print(json.dumps(result))
