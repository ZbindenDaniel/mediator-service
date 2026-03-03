#!/bin/bash

mirror_dir="${ERP_MEDIA_MIRROR_DIR:-}"
source_dir="${ERP_MEDIA_SOURCE_DIR:-${MEDIA_DIR:-}}"
item_ids_raw="${ERP_SYNC_ITEM_IDS:-}"

image_find_args=(
  -maxdepth 1
  -type f
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.tif' -o -iname '*.tiff' -o -iname '*.avif' -o -iname '*.heic' -o -iname '*.heif' -o -iname '*.svg' \)
)

tmpf_media=$(mktemp)
tmp_discovery=$(mktemp)
tmp_selected_dirs=$(mktemp)

cleanup() {
  rm -f "$tmpf_media"
  rm -f "$tmp_discovery"
  rm -f "$tmp_selected_dirs"
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
  echo "[erp-sync] media_copy_result status=failed reason=item_ids_missing source=$source_dir destination=$mirror_dir" >&2
  exit 1
fi

echo "[erp-sync] media_copy_phase phase=destination_prepare status=start destination=$mirror_dir" >&2
if ! mkdir -p "$mirror_dir" >>"$tmpf_media" 2>&1; then
  echo "[erp-sync] media_copy_error reason=destination_unwritable destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi
echo "[erp-sync] media_copy_phase phase=destination_prepare status=done destination=$mirror_dir" >&2

echo "[erp-sync] media_copy_phase phase=source_discovery status=start source=$source_dir" >&2

selected_dir_count=0
while IFS= read -r raw_item_id; do
  item_id=$(printf '%s' "$raw_item_id" | xargs)
  if [ -z "$item_id" ]; then
    continue
  fi

  item_dir="$source_dir/$item_id"
  if [ ! -d "$item_dir" ]; then
    echo "[erp-sync] media_copy_discovery folder=$item_dir status=missing" >&2
    continue
  fi

  printf '%s\n' "$item_dir" >>"$tmp_selected_dirs"
  selected_dir_count=$((selected_dir_count + 1))
  echo "[erp-sync] media_copy_discovery folder=$item_dir status=selected" >&2
done < <(printf '%s\n' "$item_ids_raw" | tr ',' '\n')

if [ "$selected_dir_count" -eq 0 ]; then
  echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$mirror_dir source_count=0 destination_count=0 flattened=true filename_collisions=0 selected_folder_count=0"
  exit 0
fi

source_count=0
copy_failed=0

while IFS= read -r item_dir; do
  if [ -z "$item_dir" ]; then
    continue
  fi

  if ! find "$item_dir" "${image_find_args[@]}" -print0 >>"$tmp_discovery" 2>>"$tmpf_media"; then
    echo "[erp-sync] media_copy_error reason=folder_discovery_failed folder=$item_dir details_file=$tmpf_media" >&2
    cat "$tmpf_media" >&2
    exit 1
  fi
done <"$tmp_selected_dirs"

echo "[erp-sync] media_copy_phase phase=source_discovery status=done source=$source_dir selected_folder_count=$selected_dir_count" >&2
echo "[erp-sync] media_copy_phase phase=copy status=start source=$source_dir destination=$mirror_dir" >&2

while IFS= read -r -d '' image_path; do
  source_count=$((source_count + 1))
  destination_file="$mirror_dir/$(basename "$image_path")"

  if ! cp -f "$image_path" "$destination_file" >>"$tmpf_media" 2>&1; then
    echo "[erp-sync] media_copy_error reason=copy_failed source=$image_path destination=$destination_file details_file=$tmpf_media" >&2
    cat "$tmpf_media" >&2
    copy_failed=1
    break
  fi
done <"$tmp_discovery"

if [ "$copy_failed" -ne 0 ]; then
  exit 1
fi

echo "[erp-sync] media_copy_phase phase=copy status=done source=$source_dir destination=$mirror_dir source_count=$source_count" >&2

echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$mirror_dir source_count=$source_count destination_count=-1 flattened=true filename_collisions=-1 selected_folder_count=$selected_dir_count"
exit 0
