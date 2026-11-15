/**
 * Sample-data detection (contracts 6.14): the SAMPLE banner shows when manifest.contains_sample is true
 * OR any loaded object has kind "sample". fetchJson reports here; SampleProvider subscribes.
 * Kept outside React so non-React loaders (fetchJson, csv) can report without a provider in scope.
 */

let isSample = false;
const reasons = new Set();
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

/** Mark the session as showing sample data. `reason` is a file path or "manifest". */
export function markSample(reason) {
  reasons.add(reason);
  if (!isSample) {
    isSample = true;
    emit();
  }
}

export function getSampleState() {
  return isSample;
}

export function getSampleReasons() {
  return [...reasons];
}

export function subscribeSample(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test helper: forget everything. */
export function resetSample() {
  isSample = false;
  reasons.clear();
  emit();
}

/**
 * True if any object anywhere in `value` has kind === "sample".
 * Arrays of primitives (daily.json columns) are skipped quickly.
 */
export function containsSampleKind(value) {
  const stack = [value];
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      if (v.length && (v[0] === null || typeof v[0] !== "object") && (v.at(-1) === null || typeof v.at(-1) !== "object")) {
        // columnar numbers / strings: no objects inside by contract
        continue;
      }
      for (const item of v) stack.push(item);
      continue;
    }
    if (v.kind === "sample") return true;
    for (const key in v) {
      const child = v[key];
      if (child !== null && typeof child === "object") stack.push(child);
    }
  }
  return false;
}
