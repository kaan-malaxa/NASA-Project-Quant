import numpy as np
import pytest

from pipeline.common import gpu


def numpy_reference(xs, vals):
    left, right = np.triu_indices(xs.shape[1], 1)
    dx = xs[:, right] - xs[:, left]
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.nanmedian(np.where(dx != 0, (vals[:, right] - vals[:, left]) / dx, np.nan), axis=1)


def test_known_answer_and_fallback_contract():
    # Pairs (2003,2004): slope 2; (2003,2005): 1.5; (2004,2005): 1 -> median 1.5. Duplicate years give no slope.
    xs = np.array([[2003.0, 2004.0, 2005.0], [2003.0, 2003.0, 2003.0]])
    vals = np.array([[1.0, 3.0, 4.0], [1.0, 2.0, 3.0]])
    result = gpu.theil_sen_nanmedian(xs, vals)
    if result is None:  # no OpenCL GPU here: callers use NumPy
        assert not gpu.available()
        return
    assert result[0] == 1.5 and np.isnan(result[1])


@pytest.mark.skipif(not gpu.available(), reason="no float64-capable OpenCL GPU")
def test_gpu_equals_numpy_bit_for_bit_up_to_zero_sign():
    rng = np.random.default_rng(7)
    for n in range(2, 24):
        years = np.arange(2003, 2003 + n, dtype=float)
        xs = years[rng.integers(0, n, (300, n))]
        for vals in (rng.integers(0, 3, (300, n)).astype(float), np.round(rng.gamma(2, 50, (300, n)), 2)):
            expected, actual = numpy_reference(xs, vals), gpu.theil_sen_nanmedian(xs, vals)
            assert np.array_equal(expected + 0.0, actual + 0.0, equal_nan=True)


def test_too_many_years_falls_back(monkeypatch):
    xs = np.tile(np.arange(30, dtype=float), (2, 1))
    assert gpu.theil_sen_nanmedian(xs, xs) is None  # 435 pairs exceed the GPU buffer: NumPy path


def test_disabled_by_environment(monkeypatch):
    monkeypatch.setenv("PROMETHEUS_TORCH_GPU", "0")
    monkeypatch.setattr(gpu, "_STATE", {})
    assert not gpu.available()
    assert gpu.theil_sen_nanmedian(np.zeros((1, 3)), np.zeros((1, 3))) is None
