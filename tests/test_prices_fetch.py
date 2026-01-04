import unittest
from datetime import date
from decimal import Decimal
from textwrap import dedent

import fava_currency_tracker as mod


class TestBeanPriceProcessing(unittest.TestCase):
    def test_filters_by_date_and_base_and_formats(self):
        output = dedent(
            """
            2026-01-01 price EUR 1.2345 USD
            2026-01-01 price BTC 0.0 USD
            2026-01-01 price CAD 1.1111 EUR
            2026-01-02 price EUR 9.9999 USD
            garbage line
            """
        ).strip()

        lines, matched = mod.PriceFetcher.process_output(output, date(2026, 1, 1), "USD")
        self.assertEqual(matched, 5)
        # Note: Zero values are now filtered out, non-matching lines kept
        self.assertEqual(len(lines), 4)
        self.assertIn("2026-01-01 price EUR", lines[0])
        self.assertIn("1.23450000", lines[0])
        self.assertIn("garbage line", lines[3])

    def test_no_base_filter(self):
        output = "2026-01-01 price EUR 1.2345 USD\n2026-01-01 price CAD 1.1111 EUR\n"
        lines, matched = mod.PriceFetcher.process_output(output, date(2026, 1, 1), None)
        self.assertEqual(matched, 2)
        self.assertEqual(len(lines), 2)

    def test_multiplier_applied(self):
        output = dedent(
            """
            2026-01-01 price EUR 100 USD
            2026-01-01 price BTC 50000 USD
            """
        ).strip()

        multipliers = {
            "EUR": Decimal("0.01"),
            "BTC": Decimal("0.001"),
        }

        lines, matched = mod.PriceFetcher.process_output(output, date(2026, 1, 1), "USD", multipliers)
        self.assertEqual(matched, 2)
        self.assertEqual(len(lines), 2)
        # EUR: 100 * 0.01 = 1.00
        self.assertIn("1.00000000", lines[0])
        # BTC: 50000 * 0.001 = 50.00
        self.assertIn("50.00000000", lines[1])

    def test_multiplier_filters_zero_values(self):
        output = "2026-01-01 price EUR 0 USD\n2026-01-01 price BTC 100 USD\n"

        multipliers = {
            "EUR": Decimal("0.01"),
        }

        lines, matched = mod.PriceFetcher.process_output(output, date(2026, 1, 1), "USD", multipliers)
        self.assertEqual(matched, 2)
        # EUR is filtered out (0 * 0.01 = 0), BTC kept
        self.assertEqual(len(lines), 1)
        self.assertIn("BTC", lines[0])


if __name__ == "__main__":
    unittest.main()
