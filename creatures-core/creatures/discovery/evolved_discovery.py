"""Discovery engine for evolved genomes.

Analyzes populations of evolved genomes to find statistically significant
patterns that distinguish high-fitness from low-fitness organisms. Runs
six statistical tests per generation snapshot and reports discoveries
with p-values, effect sizes, and confidence scores.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EvolvedDiscovery:
    """A single discovery from evolutionary analysis."""

    title: str
    description: str
    category: str  # hub_preservation, weight_magnitude, connectivity, motifs, ei_balance, genotype_fitness
    evidence: dict[str, Any]
    effect_size: float  # Cohen's d or correlation coefficient
    p_value: float
    confidence: float  # 0-1 composite score
    generation: int

    def to_dict(self) -> dict:
        return asdict(self)


class EvolvedDiscoveryEngine:
    """Analyzes evolved genome populations to discover significant patterns.

    Takes a template genome (the ancestral genome before evolution) and
    compares populations of evolved genomes split by fitness to find
    statistically significant differences.
    """

    def __init__(self, template_genome: Any):
        """Initialize with the template (ancestral) genome.

        Args:
            template_genome: A Genome instance representing the starting point.
        """
        self.template_genome = template_genome
        self._discoveries: list[EvolvedDiscovery] = []

        # Cache template hub neuron IDs for preservation analysis
        connectome = template_genome.to_connectome()
        from creatures.connectome.analysis import hub_neurons
        self._template_hubs = {h["id"] for h in hub_neurons(connectome, top_n=10)}
        self._template_hub_degrees = {
            h["id"]: h["total"] for h in hub_neurons(connectome, top_n=10)
        }

    def analyze_population(
        self,
        genomes: list[Any],
        fitnesses: list[float],
        generation: int,
    ) -> list[EvolvedDiscovery]:
        """Analyze a population, comparing top vs bottom 25% by fitness.

        Args:
            genomes: List of Genome objects from the current population.
            fitnesses: Corresponding fitness values.
            generation: Current generation number.

        Returns:
            List of new EvolvedDiscovery objects found this generation.
        """
        if len(genomes) < 8:
            logger.warning("Population too small for discovery analysis (%d)", len(genomes))
            return []

        arr_fit = np.array(fitnesses, dtype=np.float64)
        sorted_idx = np.argsort(arr_fit)
        n = len(sorted_idx)
        q25 = max(1, n // 4)

        bottom_idx = sorted_idx[:q25]
        top_idx = sorted_idx[-q25:]

        top_genomes = [genomes[i] for i in top_idx]
        bottom_genomes = [genomes[i] for i in bottom_idx]
        top_fit = arr_fit[top_idx]
        bottom_fit = arr_fit[bottom_idx]

        new_discoveries: list[EvolvedDiscovery] = []

        # Run all six tests, each wrapped in try/except for robustness
        tests = [
            ("hub_preservation", self._test_hub_preservation),
            ("weight_magnitude", self._test_weight_magnitude),
            ("connectivity", self._test_connectivity_density),
            ("motifs", self._test_circuit_motifs),
            ("ei_balance", self._test_ei_balance),
            ("genotype_fitness", self._test_genotype_fitness_correlation),
        ]

        for category, test_fn in tests:
            try:
                discovery = test_fn(
                    top_genomes, bottom_genomes, top_fit, bottom_fit,
                    genomes, arr_fit, generation,
                )
                if discovery is not None:
                    new_discoveries.append(discovery)
            except Exception as e:
                logger.debug("Discovery test '%s' failed: %s", category, e)

        self._discoveries.extend(new_discoveries)
        return new_discoveries

    def _test_hub_preservation(
        self,
        top: list, bottom: list,
        top_fit: np.ndarray, bottom_fit: np.ndarray,
        all_genomes: list, all_fit: np.ndarray,
        generation: int,
    ) -> EvolvedDiscovery | None:
        """Test whether high-fitness organisms preserve hub neuron connectivity."""
        from scipy.stats import mannwhitneyu

        def hub_connectivity_score(genome: Any) -> float:
            """Sum of absolute weights on connections involving template hub neurons."""
            hub_indices = set()
            for i, nid in enumerate(genome.neuron_ids):
                if nid in self._template_hubs:
                    hub_indices.add(i)
            if not hub_indices:
                return 0.0
            mask = np.isin(genome.pre_indices, list(hub_indices)) | np.isin(
                genome.post_indices, list(hub_indices)
            )
            return float(np.abs(genome.weights[mask]).sum()) if mask.any() else 0.0

        top_scores = np.array([hub_connectivity_score(g) for g in top])
        bottom_scores = np.array([hub_connectivity_score(g) for g in bottom])

        if top_scores.std() == 0 and bottom_scores.std() == 0:
            return None

        stat, p = mannwhitneyu(top_scores, bottom_scores, alternative="two-sided")
        effect = _cohens_d(top_scores, bottom_scores)
        confidence = _confidence_score(p, abs(effect))

        if p < 0.05:
            direction = "stronger" if top_scores.mean() > bottom_scores.mean() else "weaker"
            return EvolvedDiscovery(
                title=f"Hub neurons have {direction} connectivity in fit organisms",
                description=(
                    f"Top 25% organisms show {direction} total weight on hub neuron "
                    f"connections (mean {top_scores.mean():.2f} vs {bottom_scores.mean():.2f}). "
                    f"Hub neurons from the template connectome are "
                    f"{'preserved' if direction == 'stronger' else 'weakened'} by evolution."
                ),
                category="hub_preservation",
                evidence={
                    "top_mean": float(top_scores.mean()),
                    "bottom_mean": float(bottom_scores.mean()),
                    "U_statistic": float(stat),
                    "hub_neuron_count": len(self._template_hubs),
                },
                effect_size=effect,
                p_value=float(p),
                confidence=confidence,
                generation=generation,
            )
        return None

    def _test_weight_magnitude(
        self,
        top: list, bottom: list,
        top_fit: np.ndarray, bottom_fit: np.ndarray,
        all_genomes: list, all_fit: np.ndarray,
        generation: int,
    ) -> EvolvedDiscovery | None:
        """Test whether high-fitness organisms have different mean absolute weight."""
        from scipy.stats import mannwhitneyu

        top_mag = np.array([float(np.abs(g.weights).mean()) for g in top])
        bottom_mag = np.array([float(np.abs(g.weights).mean()) for g in bottom])

        if top_mag.std() == 0 and bottom_mag.std() == 0:
            return None

        stat, p = mannwhitneyu(top_mag, bottom_mag, alternative="two-sided")
        effect = _cohens_d(top_mag, bottom_mag)
        confidence = _confidence_score(p, abs(effect))

        if p < 0.05:
            direction = "higher" if top_mag.mean() > bottom_mag.mean() else "lower"
            return EvolvedDiscovery(
                title=f"Fit organisms evolve {direction} synaptic weights",
                description=(
                    f"Mean absolute weight is {direction} in top 25% "
                    f"({top_mag.mean():.4f} vs {bottom_mag.mean():.4f}). "
                    f"Evolution {'strengthens' if direction == 'higher' else 'prunes'} "
                    f"synaptic connections in successful organisms."
                ),
                category="weight_magnitude",
                evidence={
                    "top_mean_abs_weight": float(top_mag.mean()),
                    "bottom_mean_abs_weight": float(bottom_mag.mean()),
                    "U_statistic": float(stat),
                },
                effect_size=effect,
                p_value=float(p),
                confidence=confidence,
                generation=generation,
            )
        return None

    def _test_connectivity_density(
        self,
        top: list, bottom: list,
        top_fit: np.ndarray, bottom_fit: np.ndarray,
        all_genomes: list, all_fit: np.ndarray,
        generation: int,
    ) -> EvolvedDiscovery | None:
        """Test whether high-fitness organisms differ in connectivity density."""
        from scipy.stats import mannwhitneyu

        top_density = np.array([g.density for g in top])
        bottom_density = np.array([g.density for g in bottom])

        if top_density.std() == 0 and bottom_density.std() == 0:
            return None

        stat, p = mannwhitneyu(top_density, bottom_density, alternative="two-sided")
        effect = _cohens_d(top_density, bottom_density)
        confidence = _confidence_score(p, abs(effect))

        if p < 0.05:
            direction = "denser" if top_density.mean() > bottom_density.mean() else "sparser"
            return EvolvedDiscovery(
                title=f"Successful organisms have {direction} neural networks",
                description=(
                    f"Connectivity density differs: top 25% = {top_density.mean():.4f}, "
                    f"bottom 25% = {bottom_density.mean():.4f}. Evolution favors "
                    f"{'more connected' if direction == 'denser' else 'more selective'} circuits."
                ),
                category="connectivity",
                evidence={
                    "top_mean_density": float(top_density.mean()),
                    "bottom_mean_density": float(bottom_density.mean()),
                    "U_statistic": float(stat),
                },
                effect_size=effect,
                p_value=float(p),
                confidence=confidence,
                generation=generation,
            )
        return None

    def _test_circuit_motifs(
        self,
        top: list, bottom: list,
        top_fit: np.ndarray, bottom_fit: np.ndarray,
        all_genomes: list, all_fit: np.ndarray,
        generation: int,
    ) -> EvolvedDiscovery | None:
        """Test whether circuit motif counts differ between fit and unfit organisms."""
        from scipy.stats import mannwhitneyu

        from creatures.connectome.analysis import circuit_motifs

        # Sample up to 10 from each group to keep runtime bounded
        top_sample = top[:10]
        bottom_sample = bottom[:10]

        def feedback_count(genome: Any) -> int:
            connectome = genome.to_connectome()
            motifs = circuit_motifs(connectome)
            return motifs.get("feedback", 0)

        top_fb = np.array([feedback_count(g) for g in top_sample], dtype=np.float64)
        bottom_fb = np.array([feedback_count(g) for g in bottom_sample], dtype=np.float64)

        if top_fb.std() == 0 and bottom_fb.std() == 0:
            return None
        if len(top_fb) < 3 or len(bottom_fb) < 3:
            return None

        stat, p = mannwhitneyu(top_fb, bottom_fb, alternative="two-sided")
        effect = _cohens_d(top_fb, bottom_fb)
        confidence = _confidence_score(p, abs(effect))

        if p < 0.05:
            direction = "more" if top_fb.mean() > bottom_fb.mean() else "fewer"
            return EvolvedDiscovery(
                title=f"Fit organisms evolve {direction} feedback loops",
                description=(
                    f"Reciprocal (feedback) motif count differs: top 25% mean = "
                    f"{top_fb.mean():.1f}, bottom 25% mean = {bottom_fb.mean():.1f}. "
                    f"{'Recurrent processing' if direction == 'more' else 'Feed-forward simplicity'} "
                    f"is favored by natural selection."
                ),
                category="motifs",
                evidence={
                    "top_mean_feedback": float(top_fb.mean()),
                    "bottom_mean_feedback": float(bottom_fb.mean()),
                    "U_statistic": float(stat),
                    "sample_size": len(top_sample),
                },
                effect_size=effect,
                p_value=float(p),
                confidence=confidence,
                generation=generation,
            )
        return None

    def _test_ei_balance(
        self,
        top: list, bottom: list,
        top_fit: np.ndarray, bottom_fit: np.ndarray,
        all_genomes: list, all_fit: np.ndarray,
        generation: int,
    ) -> EvolvedDiscovery | None:
        """Test whether excitatory/inhibitory balance differs by fitness."""
        from scipy.stats import mannwhitneyu

        def ei_ratio(genome: Any) -> float:
            """Ratio of excitatory to total weight magnitude."""
            excitatory = genome.weights[genome.weights > 0].sum()
            inhibitory = np.abs(genome.weights[genome.weights < 0].sum())
            total = excitatory + inhibitory
            return float(excitatory / total) if total > 0 else 0.5

        top_ei = np.array([ei_ratio(g) for g in top])
        bottom_ei = np.array([ei_ratio(g) for g in bottom])

        if top_ei.std() == 0 and bottom_ei.std() == 0:
            return None

        stat, p = mannwhitneyu(top_ei, bottom_ei, alternative="two-sided")
        effect = _cohens_d(top_ei, bottom_ei)
        confidence = _confidence_score(p, abs(effect))

        if p < 0.05:
            direction = "more excitatory" if top_ei.mean() > bottom_ei.mean() else "more inhibitory"
            return EvolvedDiscovery(
                title=f"Fit organisms are {direction}",
                description=(
                    f"Excitatory weight fraction: top 25% = {top_ei.mean():.3f}, "
                    f"bottom 25% = {bottom_ei.mean():.3f}. Evolution shifts the E/I balance "
                    f"toward {'excitation' if top_ei.mean() > bottom_ei.mean() else 'inhibition'}."
                ),
                category="ei_balance",
                evidence={
                    "top_mean_ei_ratio": float(top_ei.mean()),
                    "bottom_mean_ei_ratio": float(bottom_ei.mean()),
                    "U_statistic": float(stat),
                },
                effect_size=effect,
                p_value=float(p),
                confidence=confidence,
                generation=generation,
            )
        return None

    def _test_genotype_fitness_correlation(
        self,
        top: list, bottom: list,
        top_fit: np.ndarray, bottom_fit: np.ndarray,
        all_genomes: list, all_fit: np.ndarray,
        generation: int,
    ) -> EvolvedDiscovery | None:
        """Test Spearman correlation between genotype features and fitness."""
        from scipy.stats import spearmanr

        # Use mean absolute weight as genotype summary statistic
        geno_scores = np.array([float(np.abs(g.weights).mean()) for g in all_genomes])
        if geno_scores.std() == 0 or all_fit.std() == 0:
            return None

        rho, p = spearmanr(geno_scores, all_fit)

        if np.isnan(rho) or np.isnan(p):
            return None

        confidence = _confidence_score(p, abs(rho))

        if p < 0.05:
            direction = "positive" if rho > 0 else "negative"
            return EvolvedDiscovery(
                title=f"Weight magnitude has {direction} correlation with fitness",
                description=(
                    f"Spearman rho = {rho:.3f} (p = {p:.4f}) between mean absolute "
                    f"synaptic weight and organism fitness across the full population. "
                    f"{'Stronger' if rho > 0 else 'Weaker'} synapses are associated with "
                    f"{'higher' if rho > 0 else 'higher'} survival."
                ),
                category="genotype_fitness",
                evidence={
                    "spearman_rho": float(rho),
                    "population_size": len(all_genomes),
                },
                effect_size=float(rho),
                p_value=float(p),
                confidence=confidence,
                generation=generation,
            )
        return None

    def get_summary(self) -> str:
        """Return a human-readable summary of all discoveries so far."""
        if not self._discoveries:
            return "No statistically significant discoveries yet."

        lines = [f"=== Evolved Discovery Summary ({len(self._discoveries)} findings) ===\n"]
        # Sort by confidence descending
        sorted_disc = sorted(self._discoveries, key=lambda d: d.confidence, reverse=True)
        for i, d in enumerate(sorted_disc, 1):
            stars = "***" if d.p_value < 0.001 else "**" if d.p_value < 0.01 else "*"
            lines.append(
                f"{i}. [{d.category}] {d.title} {stars}\n"
                f"   Gen {d.generation} | p={d.p_value:.4f} | d={d.effect_size:.2f} | "
                f"conf={d.confidence:.2f}\n"
                f"   {d.description}\n"
            )
        return "\n".join(lines)

    @property
    def discoveries(self) -> list[EvolvedDiscovery]:
        return list(self._discoveries)


def _cohens_d(group1: np.ndarray, group2: np.ndarray) -> float:
    """Compute Cohen's d effect size between two groups."""
    n1, n2 = len(group1), len(group2)
    if n1 < 2 or n2 < 2:
        return 0.0
    var1 = group1.var(ddof=1)
    var2 = group2.var(ddof=1)
    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
    if pooled_std == 0:
        return 0.0
    return float((group1.mean() - group2.mean()) / pooled_std)


def _confidence_score(p_value: float, effect_size: float) -> float:
    """Composite confidence score combining p-value and effect size.

    Returns a value between 0 and 1 where higher is more confident.
    """
    # p-value component: -log10(p) scaled to [0, 1], capped at p=1e-10
    p_component = min(1.0, -np.log10(max(p_value, 1e-10)) / 10.0)
    # Effect size component: |d| scaled to [0, 1], capped at d=2.0
    e_component = min(1.0, abs(effect_size) / 2.0)
    # Weighted combination
    return float(0.6 * p_component + 0.4 * e_component)
