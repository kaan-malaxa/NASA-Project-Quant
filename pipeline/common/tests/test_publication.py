import pytest

from pipeline.common import publication


def test_failed_publication_restores_all_bytes_and_manifest(tmp_path, monkeypatch):
    destination = tmp_path / "published"
    destination.mkdir()
    for name in ("a.json", "manifest.json"):
        (destination / name).write_bytes(b"old")
    (destination / "obsolete.json").write_bytes(b"obsolete")
    with publication.proposal(destination) as stage:
        (stage / "obsolete.json").unlink()
        for name in ("a.json", "b.json", "manifest.json"):
            (stage / name).write_bytes(b"new")
        original = publication.os.replace
        calls = []

        def fail(source, target):
            calls.append(target.name)
            if target.name == "manifest.json":
                raise OSError("injected failure")
            original(source, target)

        monkeypatch.setattr(publication.os, "replace", fail)
        with pytest.raises(OSError, match="injected"):
            publication.publish_tree(stage, destination)
    assert calls[-1] == "manifest.json"
    assert {file.name: file.read_bytes() for file in destination.iterdir()} == {
        "a.json": b"old", "manifest.json": b"old", "obsolete.json": b"obsolete"}


def test_successful_publication_removes_obsolete_assets(tmp_path):
    destination = tmp_path / "published"
    destination.mkdir()
    (destination / "old.json").write_bytes(b"old")
    with publication.proposal(destination) as stage:
        (stage / "old.json").unlink()
        (stage / "new.json").write_bytes(b"new")
        publication.publish_tree(stage, destination)
    assert {file.name for file in destination.iterdir()} == {"new.json"}
