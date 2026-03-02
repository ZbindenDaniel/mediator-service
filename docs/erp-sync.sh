#!/bin/bash

# Ein Script, das demonstriert, wie sich CSV-Dateien über die
# Kommandozeile importieren lassen. Dabei gibt es zwei Orte, an denen
# das Script angepasst werden muss. Diese sind entsprechend mit
# Kommentaren versehen.
#
# Der Aufruf erfolgt mit einem Parameter: dem Dateinamen der
# CSV-Datei. Als Ausgabe erscheint bei Erfolg gar nichts (und
# Exit-Code 0). Im Fehlerfall werden eine Meldung und der Name einer
# temporären Datei ausgegeben, in der der HTML-Code der Fehlermeldung
# sichtbar ist. Exit-Code ist dann 2.

# ---- Logindaten und URL anpassen: ----
login='csvimport'
password='B9kc!O-?b*w=i8<'
client_id='1'
url='https://revamp.kivitendo.ch/kivitendo-erp/controller.pl'

function fail {
  echo "$@"
  exit 1
}


resolve_positive_integer_or_default() {
  local raw="$1"
  local fallback="$2"

  if [[ "$raw" =~ ^[0-9]+$ ]] && [ "$raw" -gt 0 ]; then
    echo "$raw"
    return 0
  fi

  echo "$fallback"
}

# TODO(erp-sync-media-copy): Consider checksum-based verification when mirror destinations are remote mounts with delayed writes.

test -z "$1" && fail "Kein CSV-Dateiname angegeben."
test -f "$1" || fail "Datei '$1' nicht gefunden."
file="$1"

function do_curl {
  local action="$1"

  echo "[erp-sync] phase=${action#action_} file=$(basename "$file")" >&2

  local curl_connect_timeout_s
  curl_connect_timeout_s=$(resolve_positive_integer_or_default "${ERP_SYNC_CURL_CONNECT_TIMEOUT_S:-}" "15")
  local curl_max_time_s
  curl_max_time_s=$(resolve_positive_integer_or_default "${ERP_SYNC_CURL_MAX_TIME_S:-}" "240")

  echo "[erp-sync] curl_runtime action=${action#action_} connect_timeout_s=${curl_connect_timeout_s} max_time_s=${curl_max_time_s}" >&2

  # ---- Hier ebenfalls die Parameter anpassen, falls notwendig. ----
  # Die anpassbaren Parameter und ihre Werte sind:

  # Allgemeine Parameter für alle importierbaren Sachen:

  #   "profile.type": zu importierende Objekte: "parts": Artikel;
  #   "customers_vendors": Kunden/Lieferanten; "contacts":
  #   Ansprechpersonen; "addresses": Lieferanschriften

  #   "escape_char": "quote", "singlequote" oder das Escape-Zeichen
  #   selber

  #   "quote_char": die gleichen Optionen wie "escape_char"

  #   "sep_char": "comma", "semicolon", "space", "tab" oder das
  #   Trennzeichen selber

  #   "settings.numberformat": "1.000,00", "1000,00", "1,000.00",
  #   "1000.00"

  #   "settings.charset": Name eines Zeichensatzes. Meist "CP850" oder
  #   "UTF-8".

  #   "settings.duplicates": Doublettencheck; "no_check", "check_csv",
  #   "check_db". Falls angestellt wird, werden weitere Einstellungen
  #   "settings.duplicates_....=1" benötigt, die vom Programm logisch
  #   mit "und" verknüpft werden. Diese Einstellungen sind für jeden
  #   Typ weiter unten beschrieben.

  # Parameter für Artikel:

  #   "settings.default_buchungsgruppe": Standard-Buchungsgruppe;
  #   Datenbank-ID einer Buchungsgruppe

  #   "settings.apply_buchungsgruppe": Buchungsgruppe wo anwenden:
  #   "never", "all", "missing"

  #   "settings.part_type": Artikeltyp: "part", "service", "mixed"

  #   "settings.article_number_policy": Artikel mit existierender
  #   Artikelnummer: "update_prices", "insert_new"

  #   "settings.sellprice_places": Anzahl Nachkommastellen
  #   Verkaufspreise

  #   "settings.sellprice_adjustment": Wert für Verkaufspreisanpassung

  #   "settings.sellprice_adjustment_type": Art der
  #   Verkaufspreisanpassung; "percent", "absolute"

  #   "settings.shoparticle_if_missing": Shopartikel setzen falls
  #   fehlt: "1", "0"

  #   "settings.duplicates_partnumber=1": Doublettencheck nach
  #   Artikelnummer (nur, wenn "settings.duplicates" auch gesetzt
  #   ist).

  #   "settings.duplicates_description=1": Doublettencheck nach
  #   Artikelnummer (nur, wenn "settings.duplicates" auch gesetzt
  #   ist).

  # Parameter für Kunden/Lieferanten:

  #   "settings.table": Zieltabelle: "customer", "vendor"

  #   "settings.duplicates_name=1": Doublettencheck nach
  #   Kunden-/Lieferantennamen (nur, wenn "settings.duplicates" auch
  #   gesetzt ist).

  # Parameter für Ansprechperson:

  #   "settings.duplicates_cp_name=1": Doublettencheck nach Namen der
  #   Ansprechperson (nur, wenn "settings.duplicates" auch gesetzt
  #   ist).

  # Parameter für Lieferanschriten:
  #   Nur die Standard-Parameter von oben

  # Parameter für Projekte:

  #   "settings.duplicates_projectnumber=1": Doublettencheck nach
  #   Projektnummer (nur, wenn "settings.duplicates" auch gesetzt
  #   ist).

  # Spaltenzuordnungen für Benutzerdefinierte Variablen:
  #   Beispiel (Achtung, die Reihenfolge ist wichtig):

  #   "mappings[+].from=vm_product_length"
  #   "mappings[].to=cvar_vm_product_length"
  #   "mappings[+].from=vm_product_width"
  #   "mappings[].to=cvar_vm_product_width"
  #   "mappings[+].from=vm_product_height"
  #   "mappings[].to=cvar_vm_product_height"

  # revamp DB settings
  # settings.default_buchungsgruppe: 453 (test default 192)
  # settings.apply_buchungsgruppe: all
  #

  curl \
    -X 'POST' \
    -H 'Content-Type:multipart/form-data' \
    --insecure \
    --no-progress-meter \
    --connect-timeout "$curl_connect_timeout_s" \
    --max-time "$curl_max_time_s" \
    -F 'action=CsvImport/import' \
    -F "${action}=1" \
    -F 'profile.type=parts' \
    -F 'profile.id=2183' \
    -F 'settings.numberformat=1000.00' \
    -F 'settings.charset=UTF-8' \
    -F 'sep_char=comma' \
    -F 'quote_char=quote' \
    -F 'escape_char=quote' \
    -F 'settings.duplicates=no_check' \
    -F 'settings.article_number_policy=update_parts' \
    -F 'settings.sellprice_places=2' \
    -F 'settings.sellprice_adjustment=0' \
    -F 'settings.sellprice_adjustment_type=percent' \
    -F 'settings.shoparticle_if_missing=1' \
    -F 'settings.part_type=part' \
    -F 'settings.part_classification=2' \
    -F 'settings.default_buchungsgruppe=453' \
    -F 'settings.apply_buchungsgruppe=all' \
    -F 'settings.default_unit=Stck' \
    -F "{AUTH}login=${login}" \
    -F "{AUTH}password=${password}" \
    -F "{AUTH}client_id=${client_id}" \
    -F "file=@${file}" \
    ${url}

  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "${action#action_}-Import CURL-Aufruf fehlgeschlagen." >&2
    exit 2
  fi
}

tmpf=$(mktemp)
do_curl 'action_test'  > $tmpf

# auskommentiert da ausgabe in HTML nicht vorhanden (bug)
#if grep -q -i 'es wurden.*objekte gefunden, von denen.*' $tmpf; then
if grep -q -i 'Ihr Import wird verarbeitet' $tmpf; then
  rm $tmpf
  do_curl 'action_import' > $tmpf
  #if grep -i 'von.*objekten wurden importiert' $tmpf ; then
  if grep -i 'Ihr Import wird verarbeitet' $tmpf ; then
    rm $tmpf
  else
    echo "Import schlug fehl. Ausgabe befindet sich in ${tmpf}"
    exit 2
  fi
else
  echo "Test-Import nicht OK. Ausgabe befindet sich in ${tmpf}"
  exit 2
fi


copy_media_if_configured() {
  local mirror_dir="${ERP_MEDIA_MIRROR_DIR:-}"
  local source_dir="${ERP_MEDIA_SOURCE_DIR:-${MEDIA_DIR:-}}"
  local image_find_args=(
    -mindepth 2
    -maxdepth 2
    -type f
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.tif' -o -iname '*.tiff' -o -iname '*.avif' -o -iname '*.heic' -o -iname '*.heif' -o -iname '*.svg' \)
  )

  if [ -z "$mirror_dir" ]; then
    echo "[erp-sync] media_copy_result status=skipped reason=ERP_MEDIA_MIRROR_DIR_unset"
    return 0
  fi

  if [ -z "$source_dir" ] || [ ! -d "$source_dir" ]; then
    echo "[erp-sync] media_copy_result status=failed reason=source_media_path_unavailable source=${source_dir:-unset} destination=$mirror_dir" >&2
    return 1
  fi

  mkdir -p "$mirror_dir" || {
    echo "[erp-sync] media_copy_result status=failed reason=destination_unwritable destination=$mirror_dir" >&2
    return 1
  }

  local copied_count=0
  local source_count=0
  local collisions=0
  local image_path
  local destination_file
  local destination_exists=0

  echo "[erp-sync] media_copy_phase phase=destination_cleanup status=start destination=$mirror_dir" >&2
  if ! find "$mirror_dir" -mindepth 1 -exec rm -rf {} + >"$tmpf_media" 2>&1; then
    echo "[erp-sync] media_copy_result status=failed reason=destination_cleanup_failed destination=$mirror_dir details_file=$tmpf_media" >&2
    cat "$tmpf_media" >&2
    return 1
  fi
  echo "[erp-sync] media_copy_phase phase=destination_cleanup status=done destination=$mirror_dir" >&2

  echo "[erp-sync] media_copy_phase phase=source_discovery status=start source=$source_dir" >&2
  echo "[erp-sync] media_copy_discovery source=$source_dir depth=parent-only pattern={artikelnummer}/<image>" >&2

  while IFS= read -r -d '' image_path; do
    source_count=$((source_count + 1))
    destination_file="$mirror_dir/$(basename "$image_path")"

    if [ -f "$destination_file" ]; then
      destination_exists=1
    else
      destination_exists=0
    fi

    if ! cp -f "$image_path" "$destination_file" >>"$tmpf_media" 2>&1; then
      echo "[erp-sync] media_copy_result status=failed reason=copy_failed source=$image_path destination=$destination_file details_file=$tmpf_media" >&2
      cat "$tmpf_media" >&2
      return 1
    fi

    if [ "$destination_exists" -eq 1 ]; then
      collisions=$((collisions + 1))
    fi
  done < <(find "$source_dir" "${image_find_args[@]}" -print0)
  echo "[erp-sync] media_copy_phase phase=source_discovery status=done source=$source_dir source_count=$source_count" >&2

  echo "[erp-sync] media_copy_phase phase=final_count status=start destination=$mirror_dir" >&2
  copied_count=$(find "$mirror_dir" -type f | wc -l | tr -d ' ')
  echo "[erp-sync] media_copy_phase phase=final_count status=done destination=$mirror_dir destination_count=$copied_count" >&2
  echo "[erp-sync] media_copy_result status=success source=$source_dir destination=$mirror_dir source_count=$source_count destination_count=$copied_count flattened=true filename_collisions=$collisions"
  return 0
}

tmpf_media=$(mktemp)
if ! copy_media_if_configured; then
  rm -f "$tmpf" "$tmpf_media"
  echo "[erp-sync] media_copy_result status=failed reason=copy_step_failed" >&2
  exit 3
fi
rm -f "$tmpf_media"
