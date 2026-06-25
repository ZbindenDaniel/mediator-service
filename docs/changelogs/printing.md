# Changelog: Printing

Covers: label printing, CUPS integration, printer queue management, print templates, driver setup, print job dispatch.

---

## 853. ✅ Fix CUPS fd limit (ulimits) and www-data lpinfo Forbidden error
   - **Why:** (1) CUPS crashes on hosts with high/unlimited fd limits — added `ulimits.nofile: 65000/65000` to the cups service in both compose files; CUPS internal calculations assume lower limits and produce an invalid value when the limit is too high, causing EFAULT. (2) www-data (uid 33) in the mediator container gets "Forbidden" from `lpinfo` via the Unix socket — `AuthType None` in cupsd.conf disables credential prompts but CUPS still enforces lpadmin group membership at the socket level; fixed by adding `www-data` to `lpadmin` in `cups/Dockerfile`. USB device passthrough was already handled by docker-compose.usb.yml.
   - **Deferred:** Nothing.

## 850. ✅ Fix OCI runtime exec failure when installing Brother QL driver .debs in Docker
   - **Why:** Brother LPR `.deb` postinst scripts call `systemctl restart cups` after installation. Docker build containers have no systemd, so `dpkg -i` failed with "exec: systemctl: executable file not found". Fixed by stubbing `/usr/local/sbin/systemctl` with a no-op before `dpkg -i` in `cups/Dockerfile`.
   - **Deferred:** Nothing.
