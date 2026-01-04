import unittest
from datetime import date
from textwrap import dedent

from beancount.core.data import Custom
from beancount.loader import load_string

import fava_currency_tracker as mod


def load_custom_entries(beancount_text: str) -> list[Custom]:
    normalized = dedent(beancount_text).strip() + "\n"
    entries, errors, _options_map = load_string(normalized)
    if errors:
        raise AssertionError(f"Unexpected beancount parse errors: {errors!r}")
    return [e for e in entries if isinstance(e, Custom)]


class TestCurrencyMarkerParsing(unittest.TestCase):
    def test_parses_basic_marker(self):
        entries = load_custom_entries(
            """
            2025-10-01 custom "currency-marker" "EUR" "USD" 1.14 "red" "Some comment"
            """
        )
        markers = list(mod._iter_currency_markers(entries))  # pylint: disable=protected-access
        self.assertEqual(
            markers,
            [
                {
                    "date": date(2025, 10, 1),
                    "currency": "EUR",
                    "base": "USD",
                    "value": 1.14,
                    "color": "red",
                    "comment": "Some comment",
                }
            ],
        )

    def test_parses_tuple_wrapped_values(self):
        # Some Beancount structures represent custom values as (type, value).
        entries = load_custom_entries(
            """
            2025-10-01 custom "currency-marker" "EUR" "USD" 1.5
            """
        )

        markers = list(mod._iter_currency_markers(entries))  # pylint: disable=protected-access
        self.assertEqual(len(markers), 1)
        self.assertEqual(markers[0]["currency"], "EUR")
        self.assertEqual(markers[0]["base"], "USD")
        self.assertEqual(markers[0]["value"], 1.5)
        self.assertIsNone(markers[0]["color"])
        self.assertIsNone(markers[0]["comment"])

    def test_ignores_non_markers_and_invalid(self):
        entries = load_custom_entries(
            """
            2025-10-01 custom "not-a-marker" "EUR" "USD" 1.0
            2025-10-02 custom "currency-marker" "EUR" "USD"
            2025-10-03 custom "currency-marker" "EUR" "USD" "nope"
            """
        )
        markers = list(mod._iter_currency_markers(entries))  # pylint: disable=protected-access
        self.assertEqual(markers, [])


if __name__ == "__main__":
    unittest.main()
