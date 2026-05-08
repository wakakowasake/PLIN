#!/bin/zsh

set -euo pipefail
export NODE_NO_WARNINGS=1

ROOT_DIR="${ROOT_DIR:-$(pwd)}"
OVERRIDES_JSON="${OVERRIDES_JSON:-scripts/unsplash-trip-destination-manual-overrides.json}"
IMAGE_DIR="${IMAGE_DIR:-public/static/images/trip-destinations}"
ATTRIBUTION_CSV="${ATTRIBUTION_CSV:-public/static/images/trip-destinations/destination-image-attribution.csv}"
ATTRIBUTION_JSON="${ATTRIBUTION_JSON:-public/static/images/trip-destinations/destination-image-attribution.json}"

mkdir -p "$IMAGE_DIR"

WORKLIST_FILE="$(mktemp)"
RESULTS_JSONL_FILE="$(mktemp)"
HTML_FILE="$(mktemp)"

cleanup() {
  rm -f "$WORKLIST_FILE" "$RESULTS_JSONL_FILE" "$HTML_FILE"
}
trap cleanup EXIT

node --input-type=module - "$ROOT_DIR/$OVERRIDES_JSON" <<'NODE' > "$WORKLIST_FILE"
import fs from 'fs';
const overrides = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const row of overrides) {
  process.stdout.write([
    row.popularityOrder,
    row.destinationId,
    row.filename,
    row.searchQuery,
    row.photoUrl
  ].join('\t'));
  process.stdout.write('\n');
}
NODE

TOTAL_COUNT="$(wc -l < "$WORKLIST_FILE" | tr -d ' ')"
CURRENT_INDEX=0

while IFS=$'\t' read -r POPULARITY_ORDER DESTINATION_ID FILENAME SEARCH_QUERY PHOTO_URL; do
  if [[ -z "${DESTINATION_ID:-}" ]]; then
    continue
  fi

  CURRENT_INDEX=$((CURRENT_INDEX + 1))
  OUTPUT_FILE_PATH="$IMAGE_DIR/$FILENAME"

  if ! curl -sS "$PHOTO_URL" -o "$HTML_FILE"; then
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: photo_page_fetch_failed"
    continue
  fi

  if ! PARSED_JSON="$(node "$ROOT_DIR/scripts/unsplash-trip-image-helper.mjs" \
    --mode photo-page \
    --destination-id "$DESTINATION_ID" \
    --filename "$FILENAME" \
    --popularity-order "$POPULARITY_ORDER" \
    --search-query "$SEARCH_QUERY" \
    --photo-url "$PHOTO_URL" \
    --html-file "$HTML_FILE")"; then
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: photo_page_parse_failed"
    continue
  fi

  IMAGE_URL="$(printf '%s' "$PARSED_JSON" | node --input-type=module -e "let input=''; process.stdin.on('data',(chunk)=>input+=chunk); process.stdin.on('end',()=>{ const data=JSON.parse(input); console.log(data.imageUrl || ''); });")"
  if [[ -z "$IMAGE_URL" ]]; then
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: missing_image_url"
    continue
  fi

  if ! curl -sS -L "$IMAGE_URL" -o "$OUTPUT_FILE_PATH"; then
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: image_download_failed"
    continue
  fi

  printf '%s\n' "$PARSED_JSON" >> "$RESULTS_JSONL_FILE"
  PHOTOGRAPHER="$(printf '%s' "$PARSED_JSON" | node --input-type=module -e "let input=''; process.stdin.on('data',(chunk)=>input+=chunk); process.stdin.on('end',()=>{ const data=JSON.parse(input); console.log(data.photographerName || ''); });")"
  echo "[$CURRENT_INDEX/$TOTAL_COUNT] saved $FILENAME <- $PHOTOGRAPHER"
done < "$WORKLIST_FILE"

node "$ROOT_DIR/scripts/unsplash-trip-image-helper.mjs" \
  --mode merge-attribution \
  --existing-json "$ATTRIBUTION_JSON" \
  --manual-results-jsonl "$RESULTS_JSONL_FILE" \
  --csv-path "$ATTRIBUTION_CSV" \
  --json-path "$ATTRIBUTION_JSON"
