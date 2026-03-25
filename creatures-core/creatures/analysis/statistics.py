"""Statistical analysis for experiment results.

Provides researcher-grade statistical tests with proper effect sizes,
confidence intervals, and multiple-comparison corrections. Designed to
integrate with the experiment protocol system and produce publication-ready
statistical summaries.

References:
  - Cohen, J. (1988). Statistical Power Analysis for the Behavioral Sciences.
  - Bonferroni correction: Dunn, O.J. (1961). Journal of the American
    Statistical Association, 56(293), 52-64.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats as scipy_stats


@dataclass
class StatisticalResult:
    """Result of a single statistical comparison."""

    test_name: str  # "welch_t_test", "mann_whitney", "paired_t"
    statistic: float
    p_value: float
    effect_size: float  # Cohen's d
    confidence_interval: tuple[float, float]
    significant: bool  # p < alpha
    description: str  # Human-readable summary


def compare_conditions(
    experimental: list[float],
    control: list[float],
    test: str = "auto",
    alpha: float = 0.05,
) -> StatisticalResult:
    """Compare experimental vs control measurements.

    Auto-selects the appropriate statistical test:
    - Welch's t-test for normally distributed data (Shapiro-Wilk p > 0.05)
    - Mann-Whitney U for non-normal data
    - Paired t-test if lengths match and ``test="paired"``

    Args:
        experimental: Measurements from the experimental condition.
        control: Measurements from the control condition.
        test: One of "auto", "welch", "mann_whitney", "paired".
        alpha: Significance threshold (default 0.05).

    Returns:
        StatisticalResult with test name, statistic, p-value, effect size,
        confidence interval for the mean difference, and significance.

    Raises:
        ValueError: If either sample has fewer than 2 observations.
    """
    exp = np.asarray(experimental, dtype=np.float64)
    ctrl = np.asarray(control, dtype=np.float64)

    if len(exp) < 2 or len(ctrl) < 2:
        raise ValueError(
            f"Need at least 2 observations per group "
            f"(got experimental={len(exp)}, control={len(ctrl)})"
        )

    if test == "paired":
        return _paired_t(exp, ctrl, alpha)

    if test == "auto":
        test = _select_test(exp, ctrl)

    if test == "welch":
        return _welch_t(exp, ctrl, alpha)
    elif test == "mann_whitney":
        return _mann_whitney(exp, ctrl, alpha)
    else:
        raise ValueError(f"Unknown test: {test!r}. Use 'auto', 'welch', 'mann_whitney', or 'paired'.")


def compute_effect_size(experimental: list[float], control: list[float]) -> float:
    """Cohen's d effect size for two independent samples.

    Uses the pooled standard deviation as the denominator:
        d = (mean_exp - mean_ctrl) / s_pooled

    Interpretation (Cohen 1988):
        |d| < 0.2  — negligible
        0.2-0.5    — small
        0.5-0.8    — medium
        > 0.8      — large
    """
    exp = np.asarray(experimental, dtype=np.float64)
    ctrl = np.asarray(control, dtype=np.float64)

    n_exp, n_ctrl = len(exp), len(ctrl)
    if n_exp < 2 or n_ctrl < 2:
        return 0.0

    var_exp = np.var(exp, ddof=1)
    var_ctrl = np.var(ctrl, ddof=1)

    # Pooled standard deviation
    pooled_var = ((n_exp - 1) * var_exp + (n_ctrl - 1) * var_ctrl) / (n_exp + n_ctrl - 2)
    s_pooled = np.sqrt(pooled_var)

    if s_pooled == 0:
        return 0.0

    return float((np.mean(exp) - np.mean(ctrl)) / s_pooled)


def compute_confidence_interval(
    data: list[float], confidence: float = 0.95
) -> tuple[float, float]:
    """Confidence interval for the population mean using the t-distribution.

    Args:
        data: Sample observations (must have at least 2 values).
        confidence: Confidence level (default 0.95 for 95% CI).

    Returns:
        (lower, upper) bounds of the confidence interval.
    """
    arr = np.asarray(data, dtype=np.float64)
    n = len(arr)
    if n < 2:
        mean = float(np.mean(arr)) if n == 1 else 0.0
        return (mean, mean)

    mean = float(np.mean(arr))
    se = float(scipy_stats.sem(arr))
    df = n - 1
    t_crit = float(scipy_stats.t.ppf((1 + confidence) / 2, df))
    margin = t_crit * se
    return (mean - margin, mean + margin)


def batch_compare(
    results: dict[str, list[float]],
    control_key: str = "control",
    correction: str = "bonferroni",
) -> dict[str, StatisticalResult]:
    """Compare multiple experimental conditions against a single control.

    Applies multiple-comparison correction to control the family-wise
    error rate.

    Args:
        results: Mapping from condition name to measurements.
            Must include ``control_key``.
        control_key: Which condition to use as the control.
        correction: Correction method — "bonferroni" or "none".

    Returns:
        Mapping from condition name to StatisticalResult (excluding control).
    """
    if control_key not in results:
        raise ValueError(f"Control key {control_key!r} not found in results")

    control = results[control_key]
    conditions = {k: v for k, v in results.items() if k != control_key}
    n_comparisons = len(conditions)

    out: dict[str, StatisticalResult] = {}
    for name, experimental in conditions.items():
        result = compare_conditions(experimental, control, test="auto", alpha=0.05)

        # Apply multiple-comparison correction
        if correction == "bonferroni" and n_comparisons > 1:
            corrected_p = min(result.p_value * n_comparisons, 1.0)
            corrected_sig = corrected_p < 0.05
            result = StatisticalResult(
                test_name=result.test_name,
                statistic=result.statistic,
                p_value=corrected_p,
                effect_size=result.effect_size,
                confidence_interval=result.confidence_interval,
                significant=corrected_sig,
                description=(
                    f"{name} vs {control_key}: {result.test_name}, "
                    f"p={corrected_p:.4f} (Bonferroni-corrected, "
                    f"k={n_comparisons}), d={result.effect_size:.3f}"
                ),
            )
        else:
            result = StatisticalResult(
                test_name=result.test_name,
                statistic=result.statistic,
                p_value=result.p_value,
                effect_size=result.effect_size,
                confidence_interval=result.confidence_interval,
                significant=result.significant,
                description=(
                    f"{name} vs {control_key}: {result.test_name}, "
                    f"p={result.p_value:.4f}, d={result.effect_size:.3f}"
                ),
            )

        out[name] = result

    return out


def generate_stats_report(results: list[StatisticalResult]) -> str:
    """Generate a publication-ready statistics section in markdown.

    Follows APA-style reporting conventions for statistical results.

    Args:
        results: List of statistical comparison results.

    Returns:
        Markdown-formatted string suitable for inclusion in a paper's
        Results section.
    """
    if not results:
        return "No statistical comparisons performed.\n"

    lines: list[str] = []
    lines.append("### Statistical Analysis")
    lines.append("")
    lines.append(
        "All comparisons used two-tailed tests with alpha = 0.05. "
        "Effect sizes are reported as Cohen's d."
    )
    lines.append("")

    # Summary table
    lines.append("| Comparison | Test | Statistic | p-value | Effect Size (d) | 95% CI | Significant |")
    lines.append("|------------|------|-----------|---------|-----------------|--------|-------------|")

    for r in results:
        sig_str = "Yes *" if r.significant else "No"
        ci_str = f"[{r.confidence_interval[0]:.3f}, {r.confidence_interval[1]:.3f}]"
        # Truncate description to just the comparison label
        label = r.description.split(":")[0] if ":" in r.description else r.description
        lines.append(
            f"| {label} | {r.test_name} | {r.statistic:.3f} | "
            f"{r.p_value:.4f} | {r.effect_size:.3f} | {ci_str} | {sig_str} |"
        )

    lines.append("")

    # Prose summary for each significant result
    sig_results = [r for r in results if r.significant]
    if sig_results:
        lines.append("**Significant results:**")
        lines.append("")
        for r in sig_results:
            size_label = _effect_size_label(r.effect_size)
            lines.append(
                f"- {r.description} — {size_label} effect "
                f"(95% CI [{r.confidence_interval[0]:.3f}, {r.confidence_interval[1]:.3f}])"
            )
        lines.append("")
    else:
        lines.append("No statistically significant differences were found.")
        lines.append("")

    return "\n".join(lines)


# ── Private helpers ─────────────────────────────────────────────────


def _select_test(exp: np.ndarray, ctrl: np.ndarray) -> str:
    """Select between Welch's t-test and Mann-Whitney U based on normality.

    Uses the Shapiro-Wilk test on each group. If either group fails
    the normality assumption (p < 0.05) and has enough observations,
    falls back to Mann-Whitney.
    """
    # Shapiro-Wilk requires 3+ samples for a meaningful result
    if len(exp) >= 8 and len(ctrl) >= 8:
        _, p_exp = scipy_stats.shapiro(exp)
        _, p_ctrl = scipy_stats.shapiro(ctrl)
        if p_exp < 0.05 or p_ctrl < 0.05:
            return "mann_whitney"
    return "welch"


def _welch_t(exp: np.ndarray, ctrl: np.ndarray, alpha: float) -> StatisticalResult:
    """Welch's t-test (does not assume equal variances)."""
    stat, p = scipy_stats.ttest_ind(exp, ctrl, equal_var=False)
    d = compute_effect_size(exp.tolist(), ctrl.tolist())
    ci = _ci_mean_diff(exp, ctrl)
    return StatisticalResult(
        test_name="welch_t_test",
        statistic=float(stat),
        p_value=float(p),
        effect_size=d,
        confidence_interval=ci,
        significant=float(p) < alpha,
        description=(
            f"Welch's t-test: t={stat:.3f}, p={p:.4f}, d={d:.3f}"
        ),
    )


def _mann_whitney(exp: np.ndarray, ctrl: np.ndarray, alpha: float) -> StatisticalResult:
    """Mann-Whitney U test (non-parametric)."""
    stat, p = scipy_stats.mannwhitneyu(exp, ctrl, alternative="two-sided")
    d = compute_effect_size(exp.tolist(), ctrl.tolist())
    ci = _ci_mean_diff(exp, ctrl)
    return StatisticalResult(
        test_name="mann_whitney",
        statistic=float(stat),
        p_value=float(p),
        effect_size=d,
        confidence_interval=ci,
        significant=float(p) < alpha,
        description=(
            f"Mann-Whitney U: U={stat:.1f}, p={p:.4f}, d={d:.3f}"
        ),
    )


def _paired_t(exp: np.ndarray, ctrl: np.ndarray, alpha: float) -> StatisticalResult:
    """Paired t-test (requires equal-length samples)."""
    if len(exp) != len(ctrl):
        raise ValueError(
            f"Paired t-test requires equal sample sizes "
            f"(got {len(exp)} vs {len(ctrl)})"
        )
    stat, p = scipy_stats.ttest_rel(exp, ctrl)
    d = compute_effect_size(exp.tolist(), ctrl.tolist())
    ci = _ci_mean_diff(exp, ctrl)
    return StatisticalResult(
        test_name="paired_t",
        statistic=float(stat),
        p_value=float(p),
        effect_size=d,
        confidence_interval=ci,
        significant=float(p) < alpha,
        description=(
            f"Paired t-test: t={stat:.3f}, p={p:.4f}, d={d:.3f}"
        ),
    )


def _ci_mean_diff(
    exp: np.ndarray, ctrl: np.ndarray, confidence: float = 0.95
) -> tuple[float, float]:
    """95% confidence interval for the difference in means.

    Uses Welch-Satterthwaite degrees of freedom for unequal variances.
    """
    diff = float(np.mean(exp) - np.mean(ctrl))
    se_exp = float(np.std(exp, ddof=1) / np.sqrt(len(exp)))
    se_ctrl = float(np.std(ctrl, ddof=1) / np.sqrt(len(ctrl)))
    se_diff = np.sqrt(se_exp**2 + se_ctrl**2)

    if se_diff == 0:
        return (diff, diff)

    # Welch-Satterthwaite degrees of freedom
    num = (se_exp**2 + se_ctrl**2) ** 2
    denom = (se_exp**4 / (len(exp) - 1)) + (se_ctrl**4 / (len(ctrl) - 1))
    df = num / denom if denom > 0 else 1.0

    t_crit = float(scipy_stats.t.ppf((1 + confidence) / 2, df))
    margin = t_crit * se_diff
    return (diff - margin, diff + margin)


def _effect_size_label(d: float) -> str:
    """Human-readable label for Cohen's d magnitude."""
    abs_d = abs(d)
    if abs_d < 0.2:
        return "negligible"
    elif abs_d < 0.5:
        return "small"
    elif abs_d < 0.8:
        return "medium"
    else:
        return "large"
