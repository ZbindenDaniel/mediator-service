#!/bin/bash

mirror_dir="${ERP_MEDIA_MIRROR_DIR:-}"
source_dir="${ERP_MEDIA_SOURCE_DIR:-${MEDIA_DIR:-}}"

image_find_args=(
  -mindepth 2
  -maxdepth 2
  -type f
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.tif' -o -iname '*.tiff' -o -iname '*.avif' -o -iname '*.heic' -o -iname '*.heif' -o -iname '*.svg' \)
)

tmpf_media=$(mktemp)
tmp_discovery=$(mktemp)
tmp_destination_count=$(mktemp)

cleanup() {
  rm -f "$tmpf_media"
  rm -f "$tmp_discovery"
  rm -f "$tmp_destination_count"
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

echo "[erp-sync] media_copy_phase phase=destination_prepare status=start destination=$mirror_dir" >&2
if ! mkdir -p "$mirror_dir" >>"$tmpf_media" 2>&1; then
  echo "[erp-sync] media_copy_error reason=destination_unwritable destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi
echo "[erp-sync] media_copy_phase phase=destination_prepare status=done destination=$mirror_dir" >&2

echo "[erp-sync] media_copy_phase phase=destination_cleanup status=start destination=$mirror_dir" >&2
if ! find "$mirror_dir" -mindepth 1 -exec rm -rf {} + >>"$tmpf_media" 2>&1; then
  echo "[erp-sync] media_copy_error reason=destination_cleanup_failed destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi
echo "[erp-sync] media_copy_phase phase=destination_cleanup status=done destination=$mirror_dir" >&2

echo "[erp-sync] media_copy_phase phase=source_discovery status=start source=$source_dir" >&2
echo "[erp-sync] media_copy_discovery source=$source_dir depth=parent-only pattern={artikelnummer}/<image>" >&2

if ! find "$source_dir" "${image_find_args[@]}" -print0 >"$tmp_discovery" 2>>"$tmpf_media"; then
  echo "[erp-sync] media_copy_error reason=source_discovery_failed source=$source_dir destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi

copied_count=0
source_count=0
collisions=0
image_path=''
destination_file=''
destination_exists=0

echo "[erp-sync] media_copy_phase phase=copy status=start source=$source_dir destination=$mirror_dir" >&2
copy_failed=0
if ! while IFS= read -r -d '' image_path; do
  source_count=$((source_count + 1))
  destination_file="$mirror_dir/$(basename "$image_path")"

  if [ -f "$destination_file" ]; then
    destination_exists=1
  else
    destination_exists=0
  fi

  if ! cp -f "$image_path" "$destination_file" >>"$tmpf_media" 2>&1; then
    echo "[erp-sync] media_copy_error reason=copy_failed source=$image_path destination=$destination_file details_file=$tmpf_media" >&2
    cat "$tmpf_media" >&2
    copy_failed=1
    break
  fi

  if [ "$destination_exists" -eq 1 ]; then
    collisions=$((collisions + 1))
  fi
done <"$tmp_discovery"; then
  exit 1
fi

if [ "$copy_failed" -ne 0 ]; then
  exit 1
fi

echo "[erp-sync] media_copy_phase phase=source_discovery status=done source=$source_dir source_count=$source_count" >&2

echo "[erp-sync] media_copy_phase phase=copy status=done source=$source_dir destination=$mirror_dir source_count=$source_count" >&2

echo "[erp-sync] media_copy_phase phase=final_count status=start destination=$mirror_dir" >&2
if ! find "$mirror_dir" -type f -print0 >"$tmp_destination_count" 2>>"$tmpf_media"; then
  echo "[erp-sync] media_copy_error reason=final_count_failed source=$source_dir destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi

if ! copied_count=$(tr -cd '\0' <"$tmp_destination_count" | wc -c | tr -d ' '); then
  echo "[erp-sync] media_copy_error reason=final_count_failed source=$source_dir destination=$mirror_dir details_file=$tmpf_media" >&2
  cat "$tmpf_media" >&2
  exit 1
fi
echo "[erp-sync] media_copy_phase phase=final_count status=done destination=$mirror_dir destination_count=$copied_count" >&2

echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$mirror_dir source_count=$source_count destination_count=$copied_count flattened=true filename_collisions=$collisions"
exit 0
