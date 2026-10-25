#!/usr/bin/env python3
"""
Generate publication-ready figures for the KBSI Protein Crystallization paper.

Outputs:
  - paper/figures/fig5_benchmark.png   (model comparison + feature importance)
  - paper/figures/fig8_distribution_analysis.png  (pH, temp, precipitant, outcome)
"""

import json
import os
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
METRICS_PATH = os.path.join(ROOT, "data", "model_metrics_d5.json")
FIG5_PATH = os.path.join(ROOT, "paper", "figures", "fig5_benchmark.png")
FIG8_PATH = os.path.join(ROOT, "paper", "figures", "fig8_distribution_analysis.png")

# ── Style ────────────────────────────────────────────────────────────────────
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.labelsize": 10,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    "legend.fontsize": 9,
    "figure.dpi": 300,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "axes.spines.top": False,
    "axes.spines.right": False,
})

# Professional color palette (blues/greens)
COLORS = ["#2C73D2", "#0CA789", "#5B8DB8", "#7BC8A4"]


def generate_fig5():
    """Fig 5: Model benchmark comparison + feature importance."""
    with open(METRICS_PATH, "r") as f:
        data = json.load(f)

    results = data["results"]
    models = ["LightGBM-Optuna", "XGBoost-Optuna", "LightGBM-Base", "MLP"]
    metrics = ["Accuracy", "Precision", "Recall", "F1", "AUC-ROC"]
    metric_keys = ["accuracy", "precision", "recall", "f1", "auc_roc"]

    # Build values matrix
    values = np.array([
        [results[m][k] for k in metric_keys] for m in models
    ])

    # Top 10 features
    top_features = data["top_features"][:10]
    feat_names = [f["name"] for f in top_features]
    feat_imp = [f["importance"] for f in top_features]

    # ── Create figure ────────────────────────────────────────────────────
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5),
                                    gridspec_kw={"width_ratios": [1.4, 1]})
    fig.suptitle("Crystallization Outcome Prediction Benchmark",
                 fontsize=13, fontweight="bold", y=1.02)
    fig.text(0.5, 0.98, "50K Balanced (25K+ / 25K\u2212)",
             ha="center", fontsize=10, color="#555555")

    # ── (a) Grouped bar chart ────────────────────────────────────────────
    x = np.arange(len(metrics))
    n_models = len(models)
    bar_width = 0.18
    offsets = np.arange(n_models) - (n_models - 1) / 2

    for i, model in enumerate(models):
        bars = ax1.bar(x + offsets[i] * bar_width, values[i],
                       bar_width, label=model, color=COLORS[i],
                       edgecolor="white", linewidth=0.5, zorder=3)
        # Value labels on top
        for bar in bars:
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width() / 2, height + 0.3,
                     f"{height:.1f}", ha="center", va="bottom",
                     fontsize=7, color="#333333")

    ax1.set_xticks(x)
    ax1.set_xticklabels(metrics)
    ax1.set_ylabel("Score (%)")
    ax1.set_ylim(70, 100)
    ax1.set_title("(a) Model Performance Comparison", fontsize=11, pad=10)
    ax1.legend(loc="lower left", frameon=True, framealpha=0.9,
               edgecolor="#cccccc", ncol=2)
    ax1.yaxis.set_major_locator(mticker.MultipleLocator(5))
    ax1.grid(axis="y", alpha=0.3, linestyle="--", zorder=0)

    # ── (b) Feature importance ───────────────────────────────────────────
    y_pos = np.arange(len(feat_names))
    # Reverse for top-down display
    feat_names_rev = feat_names[::-1]
    feat_imp_rev = feat_imp[::-1]

    # Gradient colors
    imp_colors = plt.cm.YlGnBu(np.linspace(0.3, 0.85, len(feat_names)))

    bars2 = ax2.barh(y_pos, feat_imp_rev, color=imp_colors,
                     edgecolor="white", linewidth=0.5, zorder=3)
    ax2.set_yticks(y_pos)
    ax2.set_yticklabels(feat_names_rev, fontsize=9)
    ax2.set_xlabel("Importance (Gain)")
    ax2.set_title("(b) Top 10 Feature Importance (LightGBM)", fontsize=11, pad=10)
    ax2.grid(axis="x", alpha=0.3, linestyle="--", zorder=0)

    # Value labels
    for bar, val in zip(bars2, feat_imp_rev):
        ax2.text(bar.get_width() + 0.0005, bar.get_y() + bar.get_height() / 2,
                 f"{val:.4f}", ha="left", va="center", fontsize=8, color="#333333")

    ax2.set_xlim(0, max(feat_imp) * 1.25)

    plt.tight_layout()
    fig.savefig(FIG5_PATH, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"[OK] Saved {FIG5_PATH}")


def generate_fig8():
    """Fig 8: Distribution analysis (pH, temperature, precipitant, outcome)."""
    import psycopg2

    conn = psycopg2.connect(
        host="203.255.78.89",
        port=15432,
        dbname="kbsi_crystal_bank",
        user="kbsi_app",
        password="SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg",
        sslmode="require",
    )
    cur = conn.cursor()

    # 1) pH distribution
    cur.execute("""
        SELECT ph FROM kbsi_crystallization
        WHERE ph IS NOT NULL AND ph BETWEEN 1 AND 14
    """)
    ph_values = [r[0] for r in cur.fetchall()]
    print(f"  pH values: {len(ph_values):,}")

    # 2) Temperature distribution
    cur.execute("""
        SELECT temperature FROM kbsi_crystallization
        WHERE temperature IS NOT NULL AND temperature BETWEEN -20 AND 80
    """)
    temp_values = [r[0] for r in cur.fetchall()]
    print(f"  Temperature values: {len(temp_values):,}")

    # 3) Precipitant type top 10
    cur.execute("""
        SELECT precipitant_type, COUNT(*) as cnt
        FROM kbsi_crystallization
        WHERE precipitant_type IS NOT NULL
        GROUP BY precipitant_type
        ORDER BY cnt DESC
        LIMIT 10
    """)
    precip_rows = cur.fetchall()
    precip_names = [r[0] for r in precip_rows]
    precip_counts = [r[1] for r in precip_rows]
    print(f"  Precipitant types: {len(precip_rows)}")

    # 4) Outcome distribution
    cur.execute("""
        SELECT outcome, COUNT(*) as cnt
        FROM kbsi_crystallization
        WHERE outcome IS NOT NULL
        GROUP BY outcome
        ORDER BY cnt DESC
    """)
    outcome_rows = cur.fetchall()
    outcome_labels = [r[0] for r in outcome_rows]
    outcome_counts = [r[1] for r in outcome_rows]
    print(f"  Outcome categories: {len(outcome_rows)}")

    cur.close()
    conn.close()

    # ── Create figure ────────────────────────────────────────────────────
    fig, axes = plt.subplots(2, 2, figsize=(12, 5))
    fig.suptitle("Crystallization Data Distribution Analysis",
                 fontsize=13, fontweight="bold", y=1.02)

    # Color palette
    hist_color = "#2C73D2"
    bar_color_map = plt.cm.YlGnBu(np.linspace(0.3, 0.85, 10))
    pie_colors = ["#2C73D2", "#0CA789", "#5B8DB8", "#7BC8A4",
                  "#A8D5BA", "#FFD166", "#EF476F", "#118AB2",
                  "#06D6A0", "#073B4C"]

    # (a) pH distribution
    ax = axes[0, 0]
    ax.hist(ph_values, bins=52, range=(1, 14), color=hist_color,
            edgecolor="white", linewidth=0.3, alpha=0.85, zorder=3)
    ax.set_xlabel("pH")
    ax.set_ylabel("Count")
    ax.set_title("(a) pH Distribution", fontsize=11, pad=8)
    ax.grid(axis="y", alpha=0.3, linestyle="--", zorder=0)
    mean_ph = np.mean(ph_values)
    ax.axvline(mean_ph, color="#EF476F", linestyle="--", linewidth=1.2, zorder=4)
    ax.text(mean_ph + 0.15, ax.get_ylim()[1] * 0.9,
            f"mean={mean_ph:.1f}", fontsize=8, color="#EF476F")
    # Format y-axis with K suffix for large numbers
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(
        lambda v, _: f"{v/1000:.0f}K" if v >= 1000 else f"{v:.0f}"))

    # (b) Temperature distribution
    ax = axes[0, 1]
    ax.hist(temp_values, bins=60, range=(-5, 55), color="#0CA789",
            edgecolor="white", linewidth=0.3, alpha=0.85, zorder=3)
    ax.set_xlabel("Temperature (\u00b0C)")
    ax.set_ylabel("Count")
    ax.set_title("(b) Temperature Distribution", fontsize=11, pad=8)
    ax.grid(axis="y", alpha=0.3, linestyle="--", zorder=0)
    mean_temp = np.mean(temp_values)
    ax.axvline(mean_temp, color="#EF476F", linestyle="--", linewidth=1.2, zorder=4)
    ax.text(mean_temp + 1, ax.get_ylim()[1] * 0.9,
            f"mean={mean_temp:.1f}\u00b0C", fontsize=8, color="#EF476F")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(
        lambda v, _: f"{v/1000:.0f}K" if v >= 1000 else f"{v:.0f}"))

    # (c) Precipitant type top 10
    ax = axes[1, 0]
    # Shorten long names
    short_names = []
    for n in precip_names:
        if len(n) > 25:
            short_names.append(n[:22] + "...")
        else:
            short_names.append(n)
    y_pos = np.arange(len(short_names))
    bars = ax.barh(y_pos[::-1], precip_counts, color=bar_color_map,
                   edgecolor="white", linewidth=0.5, zorder=3)
    ax.set_yticks(y_pos[::-1])
    ax.set_yticklabels(short_names, fontsize=8)
    ax.set_xlabel("Count")
    ax.set_title("(c) Top 10 Precipitant Types", fontsize=11, pad=8)
    ax.grid(axis="x", alpha=0.3, linestyle="--", zorder=0)
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(
        lambda v, _: f"{v/1000:.0f}K" if v >= 1000 else f"{v:.0f}"))

    # (d) Outcome distribution
    ax = axes[1, 1]
    n_outcomes = len(outcome_labels)
    # Merge small categories if too many
    if n_outcomes > 8:
        top_labels = outcome_labels[:7]
        top_counts = outcome_counts[:7]
        other_count = sum(outcome_counts[7:])
        top_labels.append("Other")
        top_counts.append(other_count)
        outcome_labels = top_labels
        outcome_counts = top_counts
        n_outcomes = len(outcome_labels)

    wedges, texts, autotexts = ax.pie(
        outcome_counts, labels=None,
        autopct=lambda pct: f"{pct:.1f}%" if pct > 3 else "",
        colors=pie_colors[:n_outcomes],
        startangle=90, pctdistance=0.78,
        wedgeprops={"edgecolor": "white", "linewidth": 1.5},
    )
    for t in autotexts:
        t.set_fontsize(7)
        t.set_color("white")
        t.set_fontweight("bold")
    ax.legend(outcome_labels, loc="center left", bbox_to_anchor=(1.0, 0.5),
              fontsize=7, frameon=False)
    ax.set_title("(d) Outcome Distribution", fontsize=11, pad=8)

    plt.tight_layout()
    fig.savefig(FIG8_PATH, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"[OK] Saved {FIG8_PATH}")


if __name__ == "__main__":
    print("=== Generating Fig 5: Benchmark Comparison ===")
    generate_fig5()
    print()
    print("=== Generating Fig 8: Distribution Analysis ===")
    generate_fig8()
    print()
    print("Done.")
