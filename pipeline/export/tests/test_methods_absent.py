from pipeline.export.assemble import eyesight_entry
from pipeline.export.check import load_registry, schema_errors, validator_for


def test_absent_fit_publishes_the_contract_absent_form():
    curve = {"status": "absent", "g": None, "n_celldays": 479, "binned": [], "curve": [], "k_compare": [],
             "params": {key: None for key in ("a", "b", "c", "a_lo", "a_hi", "b_lo", "b_hi", "c_lo", "c_hi")}}
    assert eyesight_entry(curve, "iceland") == {"region": "iceland", "status": "absent"}


def test_months_without_a_tier2_factor_are_left_out_not_zeroed():
    curve = {"status": "exploratory", "k_compare": [{"month": 1, "k_tier1": 0.5, "k_tier2": None},
                                                    {"month": 2, "k_tier1": 0.5, "k_tier2": 0.4}]}
    entry = eyesight_entry(curve, "qatar")
    assert entry["k_compare"] == [{"month": 2, "k_tier1": 0.5, "k_tier2": 0.4}]
    assert entry["region"] == "qatar" and entry["status"] == "exploratory"


def test_absent_entry_validates_inside_methods_eyesight():
    registry = load_registry()
    schema = validator_for("methods", registry).schema["properties"]["eyesight"]["items"]
    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(schema, registry=registry)
    assert schema_errors(eyesight_entry({"status": "absent", "g": None}, "x"), validator) == []


def test_uncomputable_baselines_are_omitted_not_null():
    from pipeline.export.assemble import validation_row

    row = {"region": "x", "test": "loyo_weekly_wape", "baselines": {"raw_viirs": None, "annual_ratio": 0.4}}
    assert validation_row(row)["baselines"] == {"annual_ratio": 0.4}
    assert "baselines" not in validation_row({"region": "x", "baselines": {"raw_viirs": None, "annual_ratio": None}})
    assert validation_row({"region": "x"}) == {"region": "x"}
