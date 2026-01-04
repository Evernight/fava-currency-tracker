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
        base: Optional[str],
        commodity_multipliers: Optional[dict[str, Decimal]] = None,
    ) -> tuple[list[str], int]:
        """Parse bean-price output and apply commodity multipliers if configured."""
        _ = (cls, target_date, base)
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
            else:
                # Keep non-price lines as-is (comments, errors, etc.)
                out_lines.append(line)

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

    def preview(self, target_date: date, base: Optional[str]) -> dict[str, object]:
        cmd, raw = self.run_bean_price(target_date)
        lines, matched = self.process_output(raw, target_date, base, self.commodity_multipliers)
        out_path = self.output_path(target_date)
        content = ("\n".join(lines) + ("\n" if lines else "")).replace("\r\n", "\n")

        return {
            "date": target_date.isoformat(),
            "base": base,
            "command": " ".join(cmd),
            "filename": str(out_path),
            "content": content,
            "matchedLines": matched,
        }

    def save(self, target_date: date, content: str) -> str:
        out_path = self.output_path(target_date)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(content.replace("\r\n", "\n"), encoding="utf-8")
        return str(out_path)
