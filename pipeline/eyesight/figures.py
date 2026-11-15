"""Diagnostic figures for the eyesight stage (contracts 5.19)."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

MIN_MARKER, MAX_MARKER = 15.0, 300.0


def eyesight_curve_png(entry: dict, path: Path) -> None:
    """Binned observed rates (marker area proportional to n), fitted curve, bootstrap band, log FRP axis."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(7, 4.5), dpi=150)
    curve = entry["curve"]
    if curve:
        frp = [p["frp_mw"] for p in curve]
        ax.fill_between(frp, [p["lo"] for p in curve], [p["hi"] for p in curve], color="#9ecae1", alpha=0.6,
                        label="5th-95th percentile (year-block bootstrap)")
        ax.plot(frp, [p["p"] for p in curve], color="#08519c", lw=2, label="Fitted eyesight curve")
        c = entry["params"]["c"]
        ax.axhline(c, color="#636363", ls="--", lw=1, label=f"Ceiling c = {c:.2f}")
    if entry["binned"]:
        n = [b["n"] for b in entry["binned"]]
        sizes = [MIN_MARKER + (MAX_MARKER - MIN_MARKER) * v / max(n) for v in n]
        ax.scatter([b["frp_mw"] for b in entry["binned"]], [b["p_obs"] for b in entry["binned"]], s=sizes,
                   color="#e6550d", edgecolor="black", zorder=3, label="Observed share (size = number of cell-days)")
    ax.set_xscale("log")
    ax.set_ylim(0, 1)
    ax.set_xlabel("S-NPP fire radiative power in the cell-day (MW, log scale)")
    ax.set_ylabel("Chance Aqua also detects the cell-day")
    ax.set_title(f"Eyesight curve: {entry['region']} ({entry['status']}, n = {entry['n_celldays']} cell-days)")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def eyesight_by_year_png(entry: dict, by_year: list[dict], path: Path) -> None:
    """One faint curve per fit year behind the pooled curve and its band. A widening fan is information."""
    import numpy as np
    from scipy.special import expit

    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(7, 4.5), dpi=150)
    frp = np.geomspace(0.5, 2000.0, 100)
    cmap = plt.get_cmap("viridis")
    years = [r for r in by_year if r["converged"]]
    for i, r in enumerate(years):
        ax.plot(frp, r["c"] * expit(r["a"] + r["b"] * np.log10(frp)), lw=1, alpha=0.45,
                color=cmap(i / max(len(years) - 1, 1)), label=str(r["year"]))
    curve = entry["curve"]
    ax.fill_between([p["frp_mw"] for p in curve], [p["lo"] for p in curve], [p["hi"] for p in curve],
                    color="#bdbdbd", alpha=0.5)
    ax.plot([p["frp_mw"] for p in curve], [p["p"] for p in curve], color="black", lw=2.5, label="All years")
    skipped = [r["year"] for r in by_year if not r["converged"]]
    title = f"Eyesight curve by year: {entry['region']}"
    if skipped:
        title += f" (did not converge: {', '.join(map(str, skipped))})"
    ax.set_title(title)
    ax.set_xscale("log")
    ax.set_ylim(0, 1)
    ax.set_xlabel("S-NPP fire radiative power in the cell-day (MW, log scale)")
    ax.set_ylabel("Chance Aqua also detects the cell-day")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend(loc="lower right", fontsize=7, ncol=2)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def k_tier1_vs_tier2_png(entry: dict, path: Path) -> None:
    """12 monthly points: Tier 1 k (R3) against Tier 2 k_T2, with the 1:1 line. Two independent routes."""
    pts = [r for r in entry["k_compare"] if r["k_tier1"] is not None and r["k_tier2"] is not None]
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(5, 5), dpi=150)
    if pts:
        lim = max(max(r["k_tier1"] for r in pts), max(r["k_tier2"] for r in pts)) * 1.15
        ax.plot([0, lim], [0, lim], color="#636363", ls="--", lw=1, label="1:1 (the two routes agree)")
        ax.scatter([r["k_tier1"] for r in pts], [r["k_tier2"] for r in pts], color="#08519c", zorder=3,
                   label="One calendar month")
        for r in pts:
            ax.annotate(str(r["month"]), (r["k_tier1"], r["k_tier2"]), textcoords="offset points", xytext=(4, 4),
                        fontsize=7)
        ax.set_xlim(0, lim)
        ax.set_ylim(0, lim)
    ax.set_xlabel("Tier 1 k (Aqua ÷ S-NPP fire cell-days)")
    ax.set_ylabel("Tier 2 k (g × mean eyesight probability)")
    ax.set_title(f"Monthly calibration factor, two routes: {entry['region']}")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
