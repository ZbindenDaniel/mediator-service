# WebDAV Mounts – Migration Guide

**Purpose:** Recreate the WebDAV mounts when migrating to a new server.

How this connects to the service: the host mounts the kivitendo WebDAV shares under `/mnt`, and
`docker-compose.prod.yaml` bind-mounts the host's `/mnt` into the container at `/app/dist/backend/webDav`.
`MEDIA_ROOT_DIR` points at that container path; the service derives `<root>/shopbilder` (ERP read root)
and `<root>/shopbilder-import` (ERP mirror target) from it — see [media-storage.md](media-storage.md)
and [`docs/ENVIRONMENT.md`](../ENVIRONMENT.md). If a mount is missing on the host, the container sees an
empty directory and the admin status shows **WebDAV fehlt**.

## 1. WebDAV mount configuration

The mounts are configured in `/etc/fstab` using `davfs2` and systemd automount.

Add the following entries to `/etc/fstab`:

```fstab
https://revamp.kivitendo.ch/edit/shopbilder/  /mnt/shopbilder  davfs  _netdev,x-systemd.automount,x-systemd.requires=network-online.target,x-systemd.after=network-online.target,uid=33  0  0

https://revamp.kivitendo.ch/edit/shopbilder-import/  /mnt/shopbilder-import  davfs  _netdev,x-systemd.automount,x-systemd.requires=network-online.target,x-systemd.after=network-online.target,uid=33,gid=33,file_mode=0664,dir_mode=0775,use_locks=0  0  0

https://revamp.kivitendo.ch/edit/artikeldokumente/  /mnt/artikeldokumente  davfs  _netdev,x-systemd.automount,x-systemd.requires=network-online.target,x-systemd.after=network-online.target,uid=33,gid=33,file_mode=0664,dir_mode=0775,use_locks=0  0  0
```

## 2. Install davfs2

On the new server:

```bash
sudo apt update
sudo apt install davfs2
```

## 3. Migrate credentials

Credentials are stored in:

```text
/etc/davfs2/secrets
```

Copy this file from the old server to the new server.

The entries typically look like:

```text
https://revamp.kivitendo.ch/edit/shopbilder/ USER PASSWORD
https://revamp.kivitendo.ch/edit/shopbilder-import/ USER PASSWORD
https://revamp.kivitendo.ch/edit/artikeldokumente/ USER PASSWORD
```

Set correct permissions:

```bash
sudo chown root:root /etc/davfs2/secrets
sudo chmod 600 /etc/davfs2/secrets
```

Also check whether `/etc/davfs2/davfs2.conf` contains custom settings on the old server.

## 4. Create mount directories

```bash
sudo mkdir -p /mnt/shopbilder
sudo mkdir -p /mnt/shopbilder-import
sudo mkdir -p /mnt/artikeldokumente
```

## 5. Check user and group IDs

The mounts use UID/GID 33 (typically `www-data`).

Verify:

```bash
id www-data
```

## 6. Activate configuration

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Access the directories to trigger the automounts:

```bash
ls -la /mnt/shopbilder
ls -la /mnt/shopbilder-import
ls -la /mnt/artikeldokumente
```

## 7. Verify mounts

```bash
findmnt -t davfs
```

All three WebDAV mounts should appear.

## Important notes

- DNS/network connectivity to `revamp.kivitendo.ch` must work.
- The WebDAV credentials must be valid.
- `/etc/fstab` and `/etc/davfs2/secrets` are both required.
- `x-systemd.automount` means mounts are triggered on first access, not necessarily during boot.
- Preserve the trailing slashes in the WebDAV URLs.
- UID/GID 33 is important for applications running as `www-data`.

---

**Migration checklist:**

- [ ] Install `davfs2`
- [ ] Copy `/etc/fstab` entries
- [ ] Copy `/etc/davfs2/secrets`
- [ ] Check `/etc/davfs2/davfs2.conf`
- [ ] Create `/mnt` directories
- [ ] Verify UID/GID 33
- [ ] Reload systemd
- [ ] Trigger and verify all three mounts
