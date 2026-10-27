"""Checks for trends.py that need nothing installed.

    python -m unittest discover -s tools/trends
"""
import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path

import trends


class HiddenWeeks(unittest.TestCase):
    def test_a_hidden_week_counts_as_one_to_four(self):
        self.assertEqual(trends.span([10, None, 0]), (11, 14))
        self.assertEqual(trends.say(*trends.span([10, None, 0])), "between 11 and 14")

    def test_weeks_all_shown_give_one_number(self):
        self.assertEqual(trends.say(*trends.span([5, 7, 0])), "12")

    def test_the_invented_numbers_keep_the_database_rule(self):
        for row in trends.demo_rows(52):
            for measure, _ in trends.MEASURES:
                value = row[measure]
                self.assertTrue(value is None or value == 0 or value >= 5, (measure, value))

    def test_the_csv_says_fewer_than_5_and_never_a_small_number(self):
        rows = [{"church": "Test Chapel", "week_starting": date(2026, 10, 19),
                 **{m: None for m, _ in trends.MEASURES}}]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "weekly.csv"
            trends.write_csv(rows, path)
            with path.open(encoding="utf-8") as fh:
                body = list(csv.reader(fh))
        self.assertEqual(set(body[1][2:]), {"fewer than 5"})


class Trend(unittest.TestCase):
    def test_a_rising_measure(self):
        self.assertAlmostEqual(trends.slope([5, 6, 7, 8, 9, 10]), 1.0)
        self.assertEqual(trends.trend_words(1.0), "rising by about 1.0 a week")

    def test_steady_is_measured_against_the_usual_week(self):
        self.assertEqual(trends.trend_words(0.5, usual=100), "steady")
        self.assertEqual(trends.trend_words(0.5, usual=3), "rising by about 0.5 a week")

    def test_no_line_through_too_few_shown_weeks(self):
        self.assertIsNone(trends.slope([5, None, None, 9, None, 12]))
        self.assertEqual(trends.trend_words(None), "too few weeks shown to say")

    def test_the_summary_gives_ranges_and_never_a_forecast(self):
        text = trends.summary(trends.demo_rows(26))
        self.assertIn("not a forecast", text)
        self.assertIn("Grace Demo Church", text)


if __name__ == "__main__":
    unittest.main()
