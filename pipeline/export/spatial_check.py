"""Validate large numeric tuples without repeated JSON Schema interpreter overhead.

The fast path is enabled only for the exact tuple schema below. Any contract change automatically
uses the ordinary validator, so new constraints can never be silently omitted.
"""
from copy import copy

TUPLE_SCHEMA = {"type": "array", "prefixItems": [{"type": kind} for kind in
                ("integer", "integer", "integer", "number", "number", "number")],
                "minItems": 4, "maxItems": 6, "items": False}


def errors(doc, validator, limit=3):
    schema = validator.schema
    if not isinstance(doc, dict) or any(schema["properties"][grain].get("items") != TUPLE_SCHEMA
                                        for grain in ("monthly", "weekly")):
        return [error.message for error in validator.iter_errors(doc)][:limit]
    small = copy(doc)
    for grain in ("monthly", "weekly"):
        if isinstance(small.get(grain), list):
            small[grain] = []
    problems = [error.message for error in validator.iter_errors(small)][:limit]
    if problems:
        return problems
    for grain in ("monthly", "weekly"):
        for index, row in enumerate(doc[grain]):
            if not isinstance(row, list) or not 4 <= len(row) <= 6:
                problems.append(f"{grain}/{index}: expected a numeric tuple of length 4 to 6")
            elif any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in row):
                problems.append(f"{grain}/{index}: tuple values must be numbers")
            elif any(isinstance(value, float) and not value.is_integer() for value in row[:3]):
                problems.append(f"{grain}/{index}: tuple indexes must be integers")
            if len(problems) >= limit:
                return problems
    return problems
