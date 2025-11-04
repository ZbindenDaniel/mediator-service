# -----------------------------
# DOCKER BUILD / PUSH / PULL
# -----------------------------

# Build image
docker build -t <image>:<tag> .

```
 sudo docker build -t ai-flow-service:latest .
 ```

# Tag for GitHub Container Registry (GHCR)
docker tag <image>:<tag> ghcr.io/<owner>/<image>:<tag>

# Login (Classic PAT, scopes: read:packages, write:packages)
echo '<CLASSIC_PAT>' | docker login ghcr.io -u <lowercase_username> --password-stdin

# Push to GHCR
docker push ghcr.io/<owner_lowercase>/<image>:<tag>

```
$ docker push ghcr.io/zbindendaniel/ai-flow-service:latest
```

# Pull from GHCR
docker pull ghcr.io/<owner_lowercase>/<image>:<tag>

# Run container
docker run -d --name <container> \
  --restart unless-stopped \
  -p <host_port>:<container_port> \
  ghcr.io/<owner>/<image>:<tag>

```
sudo docker run -d   --name ai-flow-svc   --restart unless-stopped   --network=host   --env-file /srv/ai-flow-service/.env   ghcr.io/zbindendaniel/ai-flow-service:latest
```

# -----------------------------
# VERIFY & MAINTAIN
# -----------------------------
docker ps                     # list running containers
docker images                 # list local images
docker logs <container>       # show logs
docker stop <container>       # stop container
docker rm <container>         # remove container
docker rmi <image>            # remove image
docker system prune -a        # cleanup
