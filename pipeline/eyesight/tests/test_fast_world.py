from pipeline.eyesight import stage


def test_fast_mode_applies_to_world_countries_only(monkeypatch, tmp_path):
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(tmp_path))
    monkeypatch.delenv("PROMETHEUS_TORCH_FAST_WORLD", raising=False)
    assert not stage.fast_world("portugal")
    monkeypatch.setenv("PROMETHEUS_TORCH_FAST_WORLD", "1")
    assert stage.fast_world("portugal")
    assert not stage.fast_world("us") and not stage.fast_world("synthland") and not stage.fast_world("nowhere")
    monkeypatch.delenv("PROMETHEUS_TORCH_FAST_WORLD")
    (tmp_path / "fast_world.flag").write_text("on", encoding="utf-8")
    assert stage.fast_world("portugal")
