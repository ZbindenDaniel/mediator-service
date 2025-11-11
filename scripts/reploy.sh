#!/bin/bash
# Usage: ./redeploy.sh <container_name> <image_name> [<run_args>]

CONTAINER_NAME=$1
IMAGE_NAME=$2
RUN_ARGS=${@:3}

if [ -z "$CONTAINER_NAME" ] || [ -z "$IMAGE_NAME" ]; then
  echo "Usage: $0 <container_name> <image_name> [<run_args>]"
  exit 1
fi

echo "Stopping container: $CONTAINER_NAME"
docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "Removing container: $CONTAINER_NAME"
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "Pulling image: $IMAGE_NAME"
docker pull "$IMAGE_NAME"

echo "Running new container..."
docker run -d --name "$CONTAINER_NAME"   --restart unless-stopped   --network=host   --env-file /../"$CONTAINER_NAME"/.env   ghcr.io/zbindendaniel/"$IMAGE_NAME":latest

echo "Container redeployed: $CONTAINER_NAME"
