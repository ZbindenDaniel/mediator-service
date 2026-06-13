#!/bin/bash
set -euo pipefail

# Ensure the CUPS socket directory exists (may be a named Docker volume mount)
mkdir -p /run/cups

# Run cupsd in foreground — Docker keeps the container alive via this process
exec cupsd -f
