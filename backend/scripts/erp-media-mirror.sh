#!/bin/bash

mirror_dir="${ERP_MEDIA_MIRROR_DIR:-}"
source_dir="${ERP_MEDIA_SOURCE_DIR:-dist/media}"
item_ids_raw="${ERP_SYNC_ITEM_IDS:-}"
# ERP_SYNC_ITEM_IDS must contain explicit media file paths and is parsed newline-delimited only.
# Copy policy: flatten into ERP_MEDIA_MIRROR_DIR by basename (last write wins when names collide).

tmpf_media=$(mktemp)

cleanup() {
  rm -f "$tmpf_media"
}
trap cleanup EXIT

if [ -z "$mirror_dir" ]; then
  echo "[erp-sync] media_copy_result status=skipped reason=ERP_MEDIA_MIRROR_DIR_unset"
  exit 0
fi

if [ -z "$source_dir" ] || [ ! -d "$source_dir" ]; then
  echo "[erp-sync] media_copy_error reason=source_media_path_unavailable source=${source_dir:-unset} destination=$mirror_dir" >&2
  exit 1
fi

if [ -z "$item_ids_raw" ]; then
  echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$mirror_dir source_count=0 destination_count=0 flattened=true selected_file_count=0"
  exit 0
fi

echo "[erp-sync] media_copy_phase phase=destination_prepare status=start destination=$mirror_dir" >&2
if ! mkdir -p "$mirror_dir" >>"$tmpf_media" 2>&1; then
  echo "[erp-sync] media_copy_error reason=destination_unwritable destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi
echo "[erp-sync] media_copy_phase phase=destination_prepare status=done destination=$mirror_dir" >&2

echo "[erp-sync] media_copy_phase phase=copy status=start source=$source_dir destination=$mirror_dir" >&2

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
  destination_file="$mirror_dir/$(basename "$source_path")"

  copy_status="success"
  copy_error=""

  if [ ! -f "$source_path" ]; then
    copy_status="skipped"
    copy_error="source_missing"
  else
    if ! cp -f "$source_path" "$destination_file" >>"$tmpf_media" 2>&1; then
      copy_status="failed"
      copy_error="copy_failed"
    fi
  fi

  if [ "$copy_status" = "success" ]; then
    copied_count=$((copied_count + 1))
  elif [ "$copy_status" = "failed" ]; then
    failed_count=$((failed_count + 1))
  fi

  echo "[erp-sync] media_copy_file source=$source_path destination=$destination_file status=$copy_status error=${copy_error:-none}" >&2
done < <(printf '%s\n' "$item_ids_raw")

if [ "$failed_count" -gt 0 ]; then
  cat "$tmpf_media" >&2
  echo "[erp-sync] media_copy_result status=failed source=$source_dir destination=$mirror_dir source_count=$source_count destination_count=$copied_count flattened=true selected_file_count=$source_count" >&2
  exit 1
fi

echo "[erp-sync] media_copy_phase phase=copy status=done source=$source_dir destination=$mirror_dir source_count=$source_count destination_count=$copied_count" >&2
echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$mirror_dir source_count=$source_count destination_count=$copied_count flattened=true selected_file_count=$source_count"
exit 0
