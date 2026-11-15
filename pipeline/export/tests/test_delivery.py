from pipeline.export.delivery import documents


def test_documents_copy_published_sentences_and_limits_without_inventing_results():
    payload = {"regions.json": {"regions": [{"id": "test", "synthetic": False}]},
               "methods.json": {"validation": [], "limitations": ["A measured limitation."], "sources": [
                   {"text": "Verified source.", "url": "https://example.org", "checked": "2026-11-15"}]}}
    for name in ("ruler", "trend", "nowcast"):
        payload[f"test/{name}.json"] = {"sentence": f"Published {name} answer 7.25."}
    rendered = documents(payload.get, "- planted truth passed: 2 of 3")
    assert len(rendered) == 5
    for file in ("README.md", "docs/submission.md", "docs/slides/deck.md"):
        assert "Published trend answer 7.25." in rendered[file]
        assert "A measured limitation." in rendered[file]
        assert "test/trend.json#/sentence" in rendered[file]
        assert "[Verified source.](https://example.org)" in rendered[file]
