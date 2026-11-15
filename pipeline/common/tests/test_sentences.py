from pipeline.common.sentences import Estimate, ruler_sentence, verdict_sentence


def test_known_generated_sentence_and_unavailable_trend():
    assert "2.5 times" in ruler_sentence("Test", 2.5)
    assert verdict_sentence("unclear", Estimate(None, None, None, "too few years"),
                            Estimate(0, -1, 1)) == "Trend unavailable: too few years."
