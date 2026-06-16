#!/bin/bash
set -euo pipefail

# Ensure the CUPS socket directory exists and is world-accessible.
# The mediator container runs as www-data and needs to connect to the Unix socket.
mkdir -p /run/cups
chmod 777 /run/cups

# Run cupsd in foreground — Docker keeps the container alive via this process
exec cupsd -f
