"""Entry point for `python -m chaos` and `python -m chaos.runner`."""

from __future__ import annotations

import sys

from .runner import run_from_cli

if __name__ == "__main__":
    sys.exit(run_from_cli(sys.argv[1:]))
