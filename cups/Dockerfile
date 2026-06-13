FROM debian:bookworm-slim

# i386 multiarch required: Brother QL official .deb packages are i386-only on amd64 hosts
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
    && rm -rf /var/lib/apt/lists/*

# Brother QL driver .deb packages — place in cups/drivers/ before building.
# Download from support.brother.com for your QL model (e.g. QL-800):
#   brother-QL800lpr-<ver>.i386.deb
#   cupswrapperQL800-<ver>.i386.deb
# On arm64 hosts, use the ARM .deb or the brother-ql Python backend instead.
COPY drivers/ /tmp/drivers/
RUN if ls /tmp/drivers/*.deb 1>/dev/null 2>&1; then \
        dpkg -i /tmp/drivers/*.deb && echo "Brother QL drivers installed"; \
    else \
        echo "No .deb packages found in cups/drivers/ — CUPS will run without Brother QL support"; \
    fi \
    && rm -rf /tmp/drivers/

COPY cupsd.conf /etc/cups/cupsd.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 631
ENTRYPOINT ["/entrypoint.sh"]
