#!/bin/bash
set -euo pipefail

mkdir -p /run/cups
chmod 777 /run/cups

cupsd -f &
CUPS_PID=$!

for i in $(seq 1 30); do
    [ -S /run/cups/cups.sock ] && break
    sleep 0.5
done

if [ ! -S /run/cups/cups.sock ]; then
    echo "[cups] ERROR: cupsd failed to create socket after 15s" >&2
    kill $CUPS_PID 2>/dev/null
    exit 1
fi

refresh_discovery() {
    lpinfo -v > /run/cups/devices.txt 2>/dev/null || :
    lpinfo -m > /run/cups/ppds.txt   2>/dev/null || :
    date -u +%s > /run/cups/discovery-ts.txt 2>/dev/null || :
}

refresh_discovery

# Poll every 2s: run immediately when mediator writes /run/cups/refresh-now,
# otherwise refresh periodically every 60s (30 × 2s).
counter=0
while sleep 2; do
    counter=$((counter + 1))
    if [ -f /run/cups/refresh-now ] || [ $counter -ge 30 ]; then
        rm -f /run/cups/refresh-now 2>/dev/null || :
        refresh_discovery
        counter=0
    fi
done &
DISCOVERY_PID=$!

trap 'kill $CUPS_PID $DISCOVERY_PID 2>/dev/null; exit' SIGTERM SIGINT

wait $CUPS_PID
