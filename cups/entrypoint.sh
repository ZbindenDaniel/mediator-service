#!/bin/bash
set -euo pipefail

# Ensure the CUPS socket directory exists and is world-accessible.
# The mediator container runs as www-data and needs to connect to the Unix socket.
mkdir -p /run/cups
chmod 777 /run/cups

# Start cupsd in background so we can run lpinfo after the socket appears.
# CUPS 2.4 removed CUPS-Get-Devices/CUPS-Get-PPDs from the IPP protocol, so
# lpinfo only works when run directly on the server. We write the output to
# shared files in /run/cups/ that the mediator reads instead.
cupsd -f &
CUPS_PID=$!

# Forward SIGTERM/SIGINT so Docker stop works correctly.
trap 'kill $CUPS_PID 2>/dev/null; exit' SIGTERM SIGINT

# Wait for cupsd socket to appear (up to 15 s).
for i in $(seq 1 30); do
    [ -S /run/cups/cups.sock ] && break
    sleep 0.5
done

refresh_discovery() {
    lpinfo -v > /run/cups/devices.txt 2>/dev/null || :
    lpinfo -m > /run/cups/ppds.txt   2>/dev/null || :
}

# Initial discovery
refresh_discovery

# Refresh every 60 s so newly connected USB devices appear without restarting.
while sleep 60; do
    refresh_discovery
done &

wait $CUPS_PID
