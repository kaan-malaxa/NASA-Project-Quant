from copy import deepcopy

import pytest

from pipeline.common.io import read_json
from pipeline.export.check import SCHEMA_DIR, load_registry, validator_for
from pipeline.export.spatial_check import errors


@pytest.mark.parametrize("row", [[0, 1, 0, 2.5], [0, 1, 0, 2.5, 2., 3.],
                                [True, 1, 0, 2.5], [0, 1.5, 0, 2.5], [0, 1, 0, None],
                                [0, 1, 0], [0, 1, 0, 2., 2., 3., 4.]])
def test_fast_tuple_validation_matches_the_shared_schema(row):
    doc = read_json(SCHEMA_DIR / "examples/spatial.json")
    doc["monthly"] = [row]
    validator = validator_for("spatial", load_registry())
    assert bool(errors(doc, validator)) == bool(list(validator.iter_errors(doc)))


def test_future_schema_constraints_use_the_full_validator():
    doc = read_json(SCHEMA_DIR / "examples/spatial.json")
    doc["monthly"] = [[0, 1, 0, -1.]]
    validator = validator_for("spatial", load_registry())
    schema = deepcopy(validator.schema)
    schema["properties"]["monthly"]["items"]["prefixItems"][3]["minimum"] = 0
    assert errors(doc, validator.evolve(schema=schema))
