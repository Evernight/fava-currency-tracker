import functools
import re
import traceback
from dataclasses import dataclass
from datetime import date
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Iterable
from typing import Optional
from typing import TypedDict

from beancount.core.data import Custom
from fava.beans.abc import Directive
from fava.beans.abc import Price
from fava.context import g
from fava.ext import FavaExtensionBase
from fava.ext import extension_endpoint
from fava.helpers import FavaAPIError
from flask import request

from .price_fetcher import PriceFetcher


def api_response(func):
    """Return {success: true, data: ...} or {success: false, error: ...}."""

    @functools.wraps(func)
    def decorator(*args, **kwargs):
        try:
            data = func(*args, **kwargs)
            return {"success": True, "data": data}
        except FavaAPIError as e:
            return {"success": False, "error": e.message}, 500
        except Exception as e:  # pylint: disable=broad-exception-caught
            traceback.print_exception(e)
            return {"success": False, "error": str(e)}, 500

    return decorator


@dataclass(frozen=True)
class SeriesPoint:
    d: str
    v: float


@dataclass(frozen=True)
class SeriesMarker:
    d: str
    v: float
    color: Optional[str] = None
    comment: Optional[str] = None


@dataclass(frozen=True)
class AvailabilityDay:
    d: str
    n: int
    directives: list[str]


class CurrencyMarkerEntry(TypedDict):
    date: date
    currency: str
    base: str
    value: float
    color: Optional[str]
    comment: Optional[str]


def _iter_prices(entries: Iterable[Directive]) -> Iterable[Price]:
    for e in entries:
        if isinstance(e, Price):
            yield e


def _iter_currency_markers(entries: Iterable[Directive]) -> Iterable[CurrencyMarkerEntry]:
    for e in entries:
        if not isinstance(e, Custom):
            continue
        if getattr(e, "type", None) != "currency-marker":
            continue

        raw_values = list(getattr(e, "values", []))
        values = [v.value for v in raw_values]
        if len(values) < 3:
            continue

        currency = str(values[0]).strip().upper()
        base = str(values[1]).strip().upper()
        try:
            value = float(values[2])  # supports Decimal
        except Exception:  # pylint: disable=broad-exception-caught
            continue

        color = str(values[3]).strip() if len(values) > 3 and values[3] is not None else None
        comment = str(values[4]).strip() if len(values) > 4 and values[4] is not None else None

        yield {
            "date": e.date,
            "currency": currency,
            "base": base,
            "value": value,
            "color": color,
            "comment": comment,
        }


def _clamp_to_date_range(
    prices: Iterable[Price],
    begin: Optional[date],
    end_exclusive: Optional[date],
) -> list[Price]:
    out: list[Price] = []
    for p in prices:
        if begin and p.date < begin:
            continue
        if end_exclusive and p.date >= end_exclusive:
            continue
        out.append(p)
    return out


def _get_filtered_date_range() -> tuple[Optional[date], Optional[date]]:
    if g.filtered.date_range:
        return g.filtered.date_range.begin, g.filtered.date_range.end
    return None, None


def _last_price_per_day(prices: list[Price]) -> list[Price]:
    # Keep last price for each date (prices are in ledger order).
    by_day: dict[date, Price] = {}
    for p in prices:
        by_day[p.date] = p
    return [by_day[d] for d in sorted(by_day)]


def _format_price_directive(p: Price) -> str:
    # A compact representation suitable for tooltips.
    return f"price {p.currency} {p.amount.number} {p.amount.currency}"


def _get_series_markers(
    currency: str,
    base: str,
    begin: Optional[date],
    end_exclusive: Optional[date],
) -> list[SeriesMarker]:
    marker_entries = list(_iter_currency_markers(g.filtered.entries_with_all_prices))
    if begin or end_exclusive:
        marker_entries = [
            m
            for m in marker_entries
            if (not begin or m["date"] >= begin) and (not end_exclusive or m["date"] < end_exclusive)
        ]

    markers: list[SeriesMarker] = []
    for m in marker_entries:
        if m["currency"] == currency and m["base"] == base:
            markers.append(
                SeriesMarker(
                    d=m["date"].isoformat(),
                    v=m["value"],
                    color=m["color"],
                    comment=m["comment"],
                )
            )
            continue

        # If the marker was declared for the inverse pair, include it too (with inverted value).
        if m["currency"] == base and m["base"] == currency:
            if m["value"] == 0:
                continue
            markers.append(
                SeriesMarker(
                    d=m["date"].isoformat(),
                    v=1.0 / m["value"],
                    color=m["color"],
                    comment=m["comment"],
                )
            )

    return markers


class FavaCurrencyTracker(FavaExtensionBase):
    report_title = "Currency Tracker"
    has_js_module = True

    def _get_commodity_multipliers(self) -> dict[str, Decimal]:
        """Extract price_fetch_multiplier metadata from commodity directives."""
        multipliers: dict[str, Decimal] = {}

        for commodity in self.ledger.all_entries_by_type.Commodity:
            multiplier = commodity.meta.get("price_fetch_multiplier")
            if multiplier is not None:
                try:
                    multipliers[commodity.currency] = Decimal(str(multiplier))
                except Exception:  # pylint: disable=broad-exception-caught
                    # Ignore invalid multiplier values
                    pass

        return multipliers

    def _get_commodity_price_config(self, currency: str) -> Optional[dict[str, str]]:
        """Extract price metadata from commodity directive.

        Returns a dict with 'base' and 'source' keys if found, None otherwise.
        The price metadata format is: "BASE:source/symbol"
        Example: "USD:pricehist.beanprice.yahoo/EURUSD=X"
        """
        for commodity in self.ledger.all_entries_by_type.Commodity:
            if commodity.currency != currency:
                continue

            price_meta = commodity.meta.get("price")
            if not price_meta:
                continue

            # Parse format: "CURRENCY:source/symbol"
            # Match currency code (3+ uppercase letters/numbers)
            # https://beancount.github.io/docs/fetching_prices_in_beancount.html
            match = re.match(r"^([A-Z][A-Z0-9]{2,}):(.+)$", str(price_meta))
            if match:
                base_currency = match.group(1)
                source_part = match.group(2)
                return {
                    "base": base_currency,
                    "source": source_part,
                }

        return None

    @extension_endpoint("config")
    @api_response
    def api_config(self) -> dict[str, object]:
        operating_currencies = list(self.ledger.options.get("operating_currency", []))

        begin, end_exclusive = _get_filtered_date_range()
        prices = list(_iter_prices(g.filtered.entries_with_all_prices))
        prices = _clamp_to_date_range(prices, begin, end_exclusive)

        currencies: set[str] = set(operating_currencies)
        for p in prices:
            currencies.add(p.currency)
            currencies.add(p.amount.currency)

        currencies_list = sorted(currencies)

        default_base = ""
        if operating_currencies:
            default_base = operating_currencies[0]
        elif currencies_list:
            default_base = currencies_list[0]

        default_currency = next((c for c in currencies_list if c and c != default_base), default_base)

        filter_first = begin.isoformat() if begin else None
        filter_last = None
        if end_exclusive:
            filter_last = (end_exclusive - timedelta(days=1)).isoformat()

        return {
            "currencies": currencies_list,
            "defaultCurrency": default_currency,
            "defaultBaseCurrency": default_base,
            # Parsed by Fava from the current `time` filter (if any), inclusive bounds.
            "filterFirst": filter_first,
            "filterLast": filter_last,
        }

    @extension_endpoint("series")
    @api_response
    def api_series(self) -> dict[str, object]:
        currency = request.args.get("currency", "").strip().upper()
        base = request.args.get("base", "").strip().upper()

        begin, end_exclusive = _get_filtered_date_range()
        all_prices = list(_iter_prices(g.filtered.entries_with_all_prices))
        all_prices = _clamp_to_date_range(all_prices, begin, end_exclusive)

        direct = [p for p in all_prices if p.currency == currency and p.amount.currency == base]
        inverted = False
        if not direct:
            inverse = [p for p in all_prices if p.currency == base and p.amount.currency == currency]
            direct = inverse
            inverted = True

        direct = _last_price_per_day(direct)
        points: list[SeriesPoint] = []
        for p in direct:
            val = float(p.amount.number)
            if inverted:
                if val == 0:
                    continue
                val = 1.0 / val
            points.append(SeriesPoint(d=p.date.isoformat(), v=val))

        markers = _get_series_markers(currency, base, begin, end_exclusive)

        return {
            "currency": currency,
            "base": base,
            "inverted": inverted,
            "points": [pt.__dict__ for pt in points],
            "markers": [mk.__dict__ for mk in markers],
        }

    @extension_endpoint("availability")
    @api_response
    def api_availability(self) -> dict[str, object]:
        currency = request.args.get("currency", "").strip().upper() or None
        base = request.args.get("base", "").strip().upper() or None

        begin, end_exclusive = _get_filtered_date_range()
        prices = list(_iter_prices(g.filtered.entries))
        prices = _clamp_to_date_range(prices, begin, end_exclusive)
        if base:
            prices = [p for p in prices if p.amount.currency == base]
        if currency:
            prices = [p for p in prices if p.currency == currency]

        by_day: dict[date, list[Price]] = {}
        for p in prices:
            by_day.setdefault(p.date, []).append(p)

        days: list[AvailabilityDay] = []
        for d in sorted(by_day):
            day_prices = by_day[d]
            directives = [_format_price_directive(p) for p in day_prices]
            days.append(AvailabilityDay(d=d.isoformat(), n=len(day_prices), directives=directives))

        date_range: Optional[list[str]] = None
        # Ensure the frontend calendar always covers Fava's currently selected date range,
        # even when there are no price directives at the edges (or none at all).
        if begin and end_exclusive:
            end_inclusive = end_exclusive - timedelta(days=1)
            date_range = [begin.isoformat(), end_inclusive.isoformat()]
        elif days:
            date_range = [days[0].d, days[-1].d]

        return {
            "base": base,
            "range": date_range,
            "days": [day.__dict__ for day in days],
        }

    @extension_endpoint("prices_preview")
    @api_response
    def api_prices_preview(self) -> dict[str, object]:
        date_s = request.args.get("date", "").strip()
        if not date_s:
            raise FavaAPIError("Missing date query parameter")
        try:
            target_date = date.fromisoformat(date_s)
        except ValueError as e:
            raise FavaAPIError("Invalid date format (expected YYYY-MM-DD)") from e

        base = request.args.get("base", "").strip().upper() or None
        commodity_multipliers = self._get_commodity_multipliers()
        fetcher = PriceFetcher(
            str(self.ledger.beancount_file_path),
            commodity_multipliers=commodity_multipliers,
        )
        return fetcher.preview(target_date, base)

    @extension_endpoint("prices_save", methods=["POST"])
    @api_response
    def api_prices_save(self) -> dict[str, object]:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            raise FavaAPIError("Invalid JSON body")

        date_s = str(payload.get("date", "")).strip()
        content = str(payload.get("content", ""))
        if not date_s:
            raise FavaAPIError("Missing date")
        if not content.strip():
            raise FavaAPIError("Nothing to save (empty content)")

        try:
            target_date = date.fromisoformat(date_s)
        except ValueError as e:
            raise FavaAPIError("Invalid date format (expected YYYY-MM-DD)") from e

        fetcher = PriceFetcher(str(self.ledger.beancount_file_path))
        filename = fetcher.save(target_date, content)

        # Tell Fava to reload/recompute derived data.
        #
        # `FavaLedger.changed()` only reloads if the watcher reports a change in
        # already-watched paths. When this endpoint creates a brand-new file,
        # the default watcher backend may not be watching it yet. Explicitly
        # notify the watcher so the reload is triggered reliably.
        g.ledger.watcher.notify(Path(filename))
        g.ledger.changed()

        return {"filename": filename}

    @extension_endpoint("prices_preview_range")
    @api_response
    def api_prices_preview_range(self) -> dict[str, object]:
        """Preview prices for a date range using the commodity's price metadata configuration."""
        currency = request.args.get("currency", "").strip().upper()
        start_date_s = request.args.get("startDate", "").strip()
        end_date_s = request.args.get("endDate", "").strip()

        if not currency:
            raise FavaAPIError("Missing currency query parameter")
        if not start_date_s:
            raise FavaAPIError("Missing startDate query parameter")
        if not end_date_s:
            raise FavaAPIError("Missing endDate query parameter")

        try:
            start_date = date.fromisoformat(start_date_s)
            end_date = date.fromisoformat(end_date_s)
        except ValueError as e:
            raise FavaAPIError("Invalid date format (expected YYYY-MM-DD)") from e

        if start_date > end_date:
            raise FavaAPIError("startDate must be before or equal to endDate")

        # Get price configuration from commodity metadata
        price_config = self._get_commodity_price_config(currency)
        if not price_config:
            raise FavaAPIError(
                f"No 'price' metadata found for commodity {currency}. "
                "Please add a commodity directive with price metadata, e.g.:\n"
                f"  commodity {currency}\n"
                f'    price: "USD:yahoo/{currency}USD=X"'
            )

        base = price_config["base"]
        source = price_config["source"]

        commodity_multipliers = self._get_commodity_multipliers()
        fetcher = PriceFetcher(
            str(self.ledger.beancount_file_path),
            commodity_multipliers=commodity_multipliers,
        )
        return fetcher.preview_range(currency, base, start_date, end_date, source)

    @extension_endpoint("prices_save_range", methods=["POST"])
    @api_response
    def api_prices_save_range(self) -> dict[str, object]:
        """Save prices from a date range fetch."""
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            raise FavaAPIError("Invalid JSON body")

        currency = str(payload.get("currency", "")).strip().upper()
        start_date_s = str(payload.get("startDate", "")).strip()
        end_date_s = str(payload.get("endDate", "")).strip()
        content = str(payload.get("content", ""))

        if not currency:
            raise FavaAPIError("Missing currency")
        if not start_date_s:
            raise FavaAPIError("Missing startDate")
        if not end_date_s:
            raise FavaAPIError("Missing endDate")
        if not content.strip():
            raise FavaAPIError("Nothing to save (empty content)")

        try:
            start_date = date.fromisoformat(start_date_s)
            end_date = date.fromisoformat(end_date_s)
        except ValueError as e:
            raise FavaAPIError("Invalid date format (expected YYYY-MM-DD)") from e

        # Get base currency from commodity metadata for filename
        price_config = self._get_commodity_price_config(currency)
        base = price_config["base"] if price_config else "UNKNOWN"

        fetcher = PriceFetcher(str(self.ledger.beancount_file_path))
        filename = fetcher.save_range(currency, base, start_date, end_date, content)

        # Tell Fava to reload/recompute derived data.
        g.ledger.watcher.notify(Path(filename))
        g.ledger.changed()

        return {"filename": filename}
