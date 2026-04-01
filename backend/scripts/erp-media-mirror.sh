#!/bin/bash

webdav_url="${ERP_WEBDAV_SHOPBILDER_URL:-}"
webdav_user="${ERP_WEBDAV_USERNAME:-}"
webdav_pass="${ERP_WEBDAV_PASSWORD:-}"
source_dir="${ERP_MEDIA_SOURCE_DIR:-dist/media}"
item_ids_raw="${ERP_SYNC_ITEM_IDS:-}"
# ERP_SYNC_ITEM_IDS must contain explicit media file paths and is parsed newline-delimited only.
# Upload policy: PUT each file to WebDAV by basename (last write wins when names collide).

tmpf_media=$(mktemp)

cleanup() {
  rm -f "$tmpf_media"
}
trap cleanup EXIT

if [ -z "$webdav_url" ]; then
  echo "[erp-sync] media_copy_result status=skipped reason=ERP_WEBDAV_SHOPBILDER_URL_unset"
  exit 0
fi

if [ -z "$source_dir" ] || [ ! -d "$source_dir" ]; then
  echo "[erp-sync] media_copy_error reason=source_media_path_unavailable source=${source_dir:-unset} destination=$webdav_url" >&2
  exit 1
fi

if [ -z "$item_ids_raw" ]; then
  echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$webdav_url source_count=0 destination_count=0 flattened=true selected_file_count=0"
  exit 0
fi

echo "[erp-sync] media_copy_phase phase=copy status=start source=$source_dir destination=$webdav_url" >&2

source_count=0
copied_count=0
failed_count=0
parser_entry_count=$(printf '%s\n' "$item_ids_raw" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')

echo "[erp-sync] media_copy_parser mode=newline-delimited entries=$parser_entry_count" >&2

while IFS= read -r raw_entry; do
  source_path=$(printf '%s' "$raw_entry" | xargs)
  if [ -z "$source_path" ]; then
    continue
  fi

  source_count=$((source_count + 1))
  filename="$(basename "$source_path")"
  target_url="${webdav_url%/}/${filename}"

  copy_status="success"
  copy_error=""

  if [ ! -f "$source_path" ]; then
    copy_status="skipped"
    copy_error="source_missing"
  else
    if ! curl --upload-file "$source_path" "$target_url" \
         --user "${webdav_user}:${webdav_pass}" \
         --insecure \
         --no-progress-meter \
         --connect-timeout 15 \
         --max-time 30 \
         >>"$tmpf_media" 2>&1; then
      copy_status="failed"
      copy_error="webdav_put_failed"
    fi
  fi

  if [ "$copy_status" = "success" ]; then
    copied_count=$((copied_count + 1))
  elif [ "$copy_status" = "failed" ]; then
    failed_count=$((failed_count + 1))
  fi

  echo "[erp-sync] media_copy_file source=$source_path destination=$target_url status=$copy_status error=${copy_error:-none}" >&2
done < <(printf '%s\n' "$item_ids_raw")

if [ "$failed_count" -gt 0 ]; then
  cat "$tmpf_media" >&2
  echo "[erp-sync] media_copy_result status=failed source=$source_dir destination=$webdav_url source_count=$source_count destination_count=$copied_count flattened=true selected_file_count=$source_count" >&2
  exit 1
fi

echo "[erp-sync] media_copy_phase phase=copy status=done source=$source_dir destination=$webdav_url source_count=$source_count destination_count=$copied_count" >&2
echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$webdav_url source_count=$source_count destination_count=$copied_count flattened=true selected_file_count=$source_count"
exit 0
