import re
import subprocess
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Optional

from fava.helpers import FavaAPIError


class PriceFetcher:
    def __init__(
        self,
        ledger_file_path: str,
        timeout_s: float = 90,
        commodity_multipliers: Optional[dict[str, Decimal]] = None,
    ) -> None:
        self.ledger_file_path = ledger_file_path
        self.ledger_dir = Path(ledger_file_path).resolve().parent
        self.timeout_s = timeout_s
        self.commodity_multipliers = commodity_multipliers or {}

    @classmethod
    def process_output(
        cls,
        output: str,
        target_date: date,
        commodity_multipliers: Optional[dict[str, Decimal]] = None,
    ) -> tuple[list[str], int]:
        """Parse bean-price output and apply commodity multipliers if configured."""
        _ = (cls, target_date)
        commodity_multipliers = commodity_multipliers or {}

        out_lines = []
        matched_count = 0

        for line in output.splitlines():
            line = line.rstrip("\r")
            matched_count += 1

            # Try to parse price directive:
            # YYYY-MM-DD price COMMODITY VALUE CURRENCY
            match = re.search(
                r"^([\d-]+)\s+price\s+([\w-]+)\s+([\d\\.]+)\s+([\w-]+)",
                line,
            )

            if match:
                price_date = match.group(1)
                commodity = match.group(2)
                value = match.group(3)
                currency = match.group(4)

                updated_value = Decimal(value)

                # Apply multiplier if configured for this commodity
                if commodity in commodity_multipliers:
                    updated_value *= commodity_multipliers[commodity]

                # Ignore zero or negative values
                if updated_value > 0:
                    formatted = f"{updated_value:.8f}"
                    out_lines.append(f"{price_date} price {commodity:20} {formatted} {currency}")

        return out_lines, matched_count

    def _default_prices_dir(self) -> Path:
        preferred = self.ledger_dir / "prices"
        if preferred.exists() and preferred.is_dir():
            return preferred
        return self.ledger_dir

    def output_path(self, target_date: date) -> Path:
        out_dir = self._default_prices_dir()
        filename = f"prices-{target_date.isoformat()}.gen.bean"
        out_path = (out_dir / filename).resolve()

        # Never allow writing outside of the ledger directory.
        parent_check = self.ledger_dir not in out_path.parents
        if parent_check and out_path.parent != self.ledger_dir:
            msg = "Refusing to write outside of the ledger directory"
            raise FavaAPIError(msg)

        return out_path

    def output_path_range(self, currency: str, base: str, start_date: date, end_date: date) -> Path:
        """Generate output path for range-based price fetching."""
        out_dir = self._default_prices_dir()
        filename = f"pricehist-{currency}-to-{base}-{start_date.isoformat()}-to-{end_date.isoformat()}.bean"
        out_path = (out_dir / filename).resolve()

        # Never allow writing outside of the ledger directory.
        parent_check = self.ledger_dir not in out_path.parents
        if parent_check and out_path.parent != self.ledger_dir:
            msg = "Refusing to write outside of the ledger directory"
            raise FavaAPIError(msg)

        return out_path

    def run_bean_price(self, target_date: date) -> tuple[list[str], str]:
        cmd = [
            "bean-price",
            self.ledger_file_path,
            "-i",
            "-c",
            f"--date={target_date.isoformat()}",
        ]
        try:
            # noqa: S603,S607
            out = subprocess.check_output(cmd, timeout=self.timeout_s)
        except FileNotFoundError as e:
            raise FavaAPIError("bean-price executable not found on PATH") from e
        except subprocess.CalledProcessError as e:
            raise FavaAPIError(f"bean-price failed: {e}") from e
        except subprocess.TimeoutExpired as e:
            raise FavaAPIError("bean-price timed out") from e
        return cmd, out.decode("utf-8", errors="replace")

    def _build_preview_response(
        self,
        cmd: list[str],
        raw_output: str,
        out_path: Path,
        process_date: date,
        base: Optional[str],
    ) -> dict[str, object]:
        """Build common preview response structure.

        Args:
            cmd: The command that was executed
            raw_output: Raw output from the command
            out_path: Path where the output would be saved
            process_date: Date to use for processing output

        Returns:
            Dictionary with command, filename, content, and matchedLines
        """
        lines, matched = self.process_output(raw_output, process_date, self.commodity_multipliers)
        content = ("\n".join(lines) + ("\n" if lines else "")).replace("\r\n", "\n")

        return {
            "command": " ".join(cmd),
            "filename": str(out_path),
            "content": content,
            "matchedLines": matched,
        }

    def preview(self, target_date: date, base: Optional[str]) -> dict[str, object]:
        """Preview prices for a single date using bean-price."""
        cmd, raw = self.run_bean_price(target_date)
        out_path = self.output_path(target_date)
        return self._build_preview_response(cmd, raw, out_path, target_date, base)

    def save(self, target_date: date, content: str) -> str:
        out_path = self.output_path(target_date)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(content.replace("\r\n", "\n"), encoding="utf-8")
        return str(out_path)

    def run_pricehist(
        self, currency: str, base: str, start_date: date, end_date: date, source: Optional[str] = None
    ) -> tuple[list[str], str]:
        """Run pricehist command to fetch prices for a date range.

        Args:
            currency: The currency to fetch prices for
            base: The base currency
            start_date: Start date for price range
            end_date: End date for price range
            source: Optional source specification from price metadata (e.g., "pricehist.beanprice.yahoo/EURUSD=X")
                   If provided, will be parsed to extract the source module and symbol.
                   Format: "module/symbol" where module can be like "yahoo" or "pricehist.beanprice.yahoo"
        """
        if source:
            # Parse source specification: "module/symbol"
            # Examples: "yahoo/EURUSD=X", "pricehist.beanprice.yahoo/EURUSD=X"
            parts = source.split("/", 1)
            if len(parts) == 2:
                source_module = parts[0]
                symbol = parts[1]

                # Extract just the source name (e.g., "yahoo" from "pricehist.beanprice.yahoo")
                source_parts = source_module.split(".")
                source_name = source_parts[-1] if source_parts else "yahoo"
            else:
                # Fallback to default if parsing fails
                source_name = "yahoo"
                symbol = f"{currency}{base}=X"
        else:
            # Default behavior
            source_name = "yahoo"
            symbol = f"{currency}{base}=X"

        cmd = [
            "pricehist",
            "fetch",
            source_name,
            symbol,
            "-s",
            start_date.isoformat(),
            "-e",
            end_date.isoformat(),
            "-o",
            "beancount",
            "--fmt-base",
            currency,
            "--fmt-quote",
            base,
        ]
        try:
            out = subprocess.check_output(cmd, timeout=self.timeout_s, stderr=subprocess.STDOUT)
        except FileNotFoundError as e:
            raise FavaAPIError("pricehist executable not found on PATH") from e
        except subprocess.CalledProcessError as e:
            error_msg = e.output.decode("utf-8", errors="replace") if e.output else str(e)
            raise FavaAPIError(f"pricehist failed: {error_msg}") from e
        except subprocess.TimeoutExpired as e:
            raise FavaAPIError("pricehist timed out") from e
        return cmd, out.decode("utf-8", errors="replace")

    def preview_range(
        self, currency: str, base: str, start_date: date, end_date: date, source: str
    ) -> dict[str, object]:
        """Preview prices for a date range using pricehist with the configured source."""
        cmd, raw = self.run_pricehist(currency, base, start_date, end_date, source)
        out_path = self.output_path_range(currency, base, start_date, end_date)
        return self._build_preview_response(cmd, raw, out_path, start_date, base)

    def save_range(self, currency: str, base: str, start_date: date, end_date: date, content: str) -> str:
        """Save prices from a date range fetch."""
        out_path = self.output_path_range(currency, base, start_date, end_date)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(content.replace("\r\n", "\n"), encoding="utf-8")
        return str(out_path)
