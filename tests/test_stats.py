from app.services.stats import adjusted_ms, average, compute_stats, PLUS_TWO_MS


def test_adjusted_ms_plus_two():
    assert adjusted_ms(12000, "PLUS_TWO") == 12000 + PLUS_TWO_MS
    assert adjusted_ms(12000, "NONE") == 12000


def test_average_simple():
    solves = [(10000, "NONE"), (12000, "NONE"), (14000, "NONE"), (16000, "NONE"), (18000, "NONE")]
    avg = average(solves, 5)
    assert avg.ms == 14000
    assert avg.dnf is False


def test_average_trim_and_dnf():
    solves = [(10000, "NONE"), (20000, "NONE"), (15000, "NONE"), (16000, "DNF"), (18000, "NONE")]
    avg = average(solves, 5)
    # the DNF is the dropped worst; only the best (10000) is also dropped
    # -> mean of [15000, 18000, 20000]
    assert avg.ms == round((15000 + 18000 + 20000) / 3)
    assert avg.dnf is False


def test_average_two_dnf_is_dnf():
    solves = [(10000, "DNF"), (20000, "DNF"), (15000, "NONE"), (16000, "NONE"), (18000, "NONE")]
    avg = average(solves, 5)
    assert avg.dnf is True
    assert avg.ms is None


def test_average_insufficient():
    assert average([(10000, "NONE")], 5).ms is None


def test_compute_stats():
    solves = [(10000, "NONE"), (20000, "NONE"), (15000, "NONE"), (16000, "DNF"), (18000, "NONE")]
    stats = compute_stats(solves)
    assert stats["count"] == 5
    assert stats["dnf_count"] == 1
    assert stats["best_ms"] == 10000
    assert stats["worst_ms"] == 20000
    assert stats["current_ao5"].dnf is False
