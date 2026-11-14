"""Diagnostic figures for the eyesight stage (contracts 5.19)."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

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
