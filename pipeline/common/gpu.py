"""Optional GPU acceleration (OpenCL, any vendor: AMD, NVIDIA, Intel) with an exact NumPy fallback.

Only float64 kernels whose arithmetic is identical to NumPy's are offloaded, so results do not depend on
whether a GPU was used. Install the optional dependency with `uv sync --extra gpu`; set
PROMETHEUS_TORCH_GPU=0 to force the CPU path. Without pyopencl or a float64-capable device, every
function here returns None and callers use NumPy.
"""
import os

import numpy as np

MAX_PAIRS = 300  # private per-row buffer; 25 years give 300 year pairs
_STATE: dict = {}

_SOURCE = """
#pragma OPENCL EXTENSION cl_khr_fp64 : enable
#define MAX_PAIRS %(max_pairs)d
/* One work-item per bootstrap replicate: Theil-Sen pairwise slopes over the pairs with dx != 0
   (NaN slopes are dropped exactly as numpy.nanmedian drops them), sorted, then the median computed
   as numpy.ma.median does: (low + high) / 2 in float64. */
__kernel void theil_sen_nanmedian(__global const double *xs, __global const double *vals,
                                  const int n, const int rows, __global double *out) {
    int r = get_global_id(0);
    if (r >= rows) return;
    const __global double *x = xs + (long)r * n;
    const __global double *v = vals + (long)r * n;
    double s[MAX_PAIRS];
    int c = 0;
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            double dx = x[j] - x[i];
            if (dx != 0.0) {
                double slope = (v[j] - v[i]) / dx;
                if (!isnan(slope)) s[c++] = slope;
            }
        }
    }
    for (int i = 1; i < c; i++) {          /* insertion sort: exact, no arithmetic */
        double key = s[i];
        int j = i - 1;
        while (j >= 0 && s[j] > key) { s[j + 1] = s[j]; j--; }
        s[j + 1] = key;
    }
    if (c == 0) { out[r] = NAN; return; }
    int h = c / 2;
    double low = (c %% 2 == 1) ? s[h] : s[h - 1];
    out[r] = (low + s[h]) / 2.0;
}
"""


def _runtime():
    """(context, queue, program) on the first float64-capable GPU, or None. Created once per process."""
    if "runtime" in _STATE:
        return _STATE["runtime"]
    _STATE["runtime"] = None
    if os.environ.get("PROMETHEUS_TORCH_GPU", "1") == "0":
        return None
    try:
        import pyopencl as cl

        devices = [device for platform in cl.get_platforms() for device in platform.get_devices()
                   if device.type & cl.device_type.GPU and "cl_khr_fp64" in device.extensions]
        if devices:
            context = cl.Context([devices[0]])
            program = cl.Program(context, _SOURCE % {"max_pairs": MAX_PAIRS}).build()
            kernel = cl.Kernel(program, "theil_sen_nanmedian")
            _STATE["runtime"] = (context, cl.CommandQueue(context), kernel)
    except Exception:  # noqa: BLE001 - any driver/compiler problem means "use the CPU path"
        _STATE["runtime"] = None
    return _STATE["runtime"]


def available() -> bool:
    return _runtime() is not None


def theil_sen_nanmedian(xs: np.ndarray, vals: np.ndarray) -> np.ndarray | None:
    """Per-row nanmedian of Theil-Sen pairwise slopes (pairs i < j); None when the GPU path is unavailable.

    Equals np.nanmedian(np.where(dx != 0, (vals[:, j] - vals[:, i]) / dx, nan), axis=1) bit for bit,
    except that the sign of a zero median may differ (sorting leaves -0.0/+0.0 ties in any order);
    callers canonicalise with `+ 0.0` on both paths.
    """
    runtime = _runtime()
    rows, n = xs.shape
    if runtime is None or rows == 0 or n * (n - 1) // 2 > MAX_PAIRS:
        return None
    import pyopencl as cl

    context, queue, kernel = runtime
    xs = np.ascontiguousarray(xs, dtype=np.float64)
    vals = np.ascontiguousarray(vals, dtype=np.float64)
    out = np.empty(rows, dtype=np.float64)
    flags = cl.mem_flags
    xs_buffer = cl.Buffer(context, flags.READ_ONLY | flags.COPY_HOST_PTR, hostbuf=xs)
    vals_buffer = cl.Buffer(context, flags.READ_ONLY | flags.COPY_HOST_PTR, hostbuf=vals)
    out_buffer = cl.Buffer(context, flags.WRITE_ONLY, out.nbytes)
    kernel(queue, (rows,), None, xs_buffer, vals_buffer, np.int32(n), np.int32(rows), out_buffer)
    cl.enqueue_copy(queue, out, out_buffer)
    queue.finish()
    return out
