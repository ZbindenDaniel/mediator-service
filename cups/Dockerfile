FROM debian:bookworm-slim

# printer-driver-ptouch provides open-source Foomatic/ptouch-ql driver for Brother QL series.
# Covers QL-500/550/560/570/580/700/710W/720NW and others without proprietary .deb packages.
# i386 multiarch kept for optional proprietary Brother LPR .deb packages (additional models).
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        cups \
        cups-client \
        cups-bsd \
        libcups2 \
        libc6:i386 \
        usbutils \
        ca-certificates \
        printer-driver-ptouch \
    && rm -rf /var/lib/apt/lists/*

# Optional: proprietary Brother LPR .deb packages for models not covered by ptouch-ql.
# Download from support.brother.com and place in cups/drivers/ before building.
COPY drivers/ /tmp/drivers/
RUN if ls /tmp/drivers/*.deb 1>/dev/null 2>&1; then \
        dpkg -i /tmp/drivers/*.deb && echo "Brother QL drivers installed"; \
    else \
        echo "No .deb packages found in cups/drivers/ — CUPS will run without Brother QL support"; \
    fi \
    && rm -rf /tmp/drivers/

# Custom PPD overrides — drop modified PPD files (e.g. with extra paper sizes) into
# cups/ppds/. They replace the driver-installed PPDs of the same filename after build.
COPY ppds/ /tmp/ppds/
RUN if ls /tmp/ppds/*.ppd 1>/dev/null 2>&1; then \
        find /usr/share/ppd/ -name "*.ppd" | while read -r f; do \
            base=$(basename "$f"); \
            [ -f "/tmp/ppds/$base" ] && cp "/tmp/ppds/$base" "$f" && echo "PPD override: $base"; \
        done; \
    fi \
    && rm -rf /tmp/ppds

COPY cupsd.conf /etc/cups/cupsd.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 631
ENTRYPOINT ["/entrypoint.sh"]
