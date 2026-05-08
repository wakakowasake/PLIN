#!/bin/zsh

set -euo pipefail
export NODE_NO_WARNINGS=1

ROOT_DIR="${ROOT_DIR:-$(pwd)}"
INPUT_CSV="${INPUT_CSV:-public/static/images/trip-destinations/destination-image-file-list.csv}"
IMAGE_DIR="${IMAGE_DIR:-public/static/images/trip-destinations}"
ATTRIBUTION_CSV="${ATTRIBUTION_CSV:-public/static/images/trip-destinations/destination-image-attribution.csv}"
ATTRIBUTION_JSON="${ATTRIBUTION_JSON:-public/static/images/trip-destinations/destination-image-attribution.json}"
START_ORDER="${START_ORDER:-1}"
LIMIT="${LIMIT:-315}"
DELAY_MS="${DELAY_MS:-150}"
mkdir -p "$IMAGE_DIR"

WORKLIST_FILE="$(mktemp)"
RESULTS_JSONL_FILE="$(mktemp)"
FAILURES_JSONL_FILE="$(mktemp)"
HTML_FILE="$(mktemp)"

cleanup() {
  rm -f "$WORKLIST_FILE" "$HTML_FILE"
}
trap cleanup EXIT

node "$ROOT_DIR/scripts/unsplash-trip-image-helper.mjs" \
  --mode worklist \
  --input "$INPUT_CSV" \
  --start-order "$START_ORDER" \
  --limit "$LIMIT" > "$WORKLIST_FILE"

TOTAL_COUNT="$(wc -l < "$WORKLIST_FILE" | tr -d ' ')"
if [[ "$TOTAL_COUNT" == "0" ]]; then
  echo "No destinations to process"
  exit 1
fi

CURRENT_INDEX=0
while IFS=$'\t' read -r POPULARITY_ORDER DESTINATION_ID DESTINATION_NAME FILENAME DESTINATION_SCOPE DESTINATION_CATEGORY_ID DESTINATION_COUNTRY_CODE SEARCH_QUERY SEARCH_PATH; do
  if [[ -z "${DESTINATION_ID:-}" ]]; then
    continue
  fi

  CURRENT_INDEX=$((CURRENT_INDEX + 1))
  SEARCH_URL="https://unsplash.com/s/photos/${SEARCH_PATH}"
  OUTPUT_FILE_PATH="$IMAGE_DIR/$FILENAME"

  if ! curl -sS \
    "$SEARCH_URL" \
    -o "$HTML_FILE"; then
    printf '{"popularityOrder":%s,"id":"%s","filename":"%s","error":"search_fetch_failed"}\n' \
      "$POPULARITY_ORDER" "$DESTINATION_ID" "$FILENAME" >> "$FAILURES_JSONL_FILE"
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: search_fetch_failed"
    continue
  fi

  if ! SELECTED_JSON="$(node "$ROOT_DIR/scripts/unsplash-trip-image-helper.mjs" \
    --mode select-html \
    --destination-id "$DESTINATION_ID" \
    --search-query "$SEARCH_QUERY" \
    --html-file "$HTML_FILE")"; then
    printf '{"popularityOrder":%s,"id":"%s","filename":"%s","error":"candidate_select_failed"}\n' \
      "$POPULARITY_ORDER" "$DESTINATION_ID" "$FILENAME" >> "$FAILURES_JSONL_FILE"
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: candidate_select_failed"
    continue
  fi

  IMAGE_URL="$(printf '%s' "$SELECTED_JSON" | node --input-type=module -e "let input=''; process.stdin.on('data',(chunk)=>input+=chunk); process.stdin.on('end',()=>{ const data=JSON.parse(input); console.log(data.imageUrl || ''); });")"
  if [[ -z "$IMAGE_URL" ]]; then
    printf '{"popularityOrder":%s,"id":"%s","filename":"%s","error":"missing_image_url"}\n' \
      "$POPULARITY_ORDER" "$DESTINATION_ID" "$FILENAME" >> "$FAILURES_JSONL_FILE"
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: missing_image_url"
    continue
  fi

  if ! curl -sS -L \
    "$IMAGE_URL" \
    -o "$OUTPUT_FILE_PATH"; then
    printf '{"popularityOrder":%s,"id":"%s","filename":"%s","error":"image_download_failed"}\n' \
      "$POPULARITY_ORDER" "$DESTINATION_ID" "$FILENAME" >> "$FAILURES_JSONL_FILE"
    echo "[$CURRENT_INDEX/$TOTAL_COUNT] failed $FILENAME: image_download_failed"
    continue
  fi

  printf '%s' "$SELECTED_JSON" | node --input-type=module -e "
    let input = '';
    process.stdin.on('data', (chunk) => input += chunk);
    process.stdin.on('end', () => {
      const selected = JSON.parse(input);
      const record = {
        popularityOrder: Number(process.argv[1]),
        id: process.argv[2],
        name: process.argv[3],
        filename: process.argv[4],
        scope: process.argv[5],
        categoryId: process.argv[6],
        countryCode: process.argv[7],
        searchQuery: process.argv[8],
        selectionConfidence: selected.selectionConfidence,
        selectionScore: selected.selectionScore,
        unsplashPhotoId: selected.unsplashPhotoId,
        unsplashPhotoSlug: selected.unsplashPhotoSlug,
        unsplashPhotoUrl: selected.unsplashPhotoUrl,
        photographerName: selected.photographerName,
        photographerUsername: selected.photographerUsername,
        photographerProfileUrl: selected.photographerProfileUrl,
        imageUrl: selected.imageUrl,
        downloadedAt: new Date().toISOString(),
        failed: false
      };
      process.stdout.write(JSON.stringify(record));
    });
  " "$POPULARITY_ORDER" "$DESTINATION_ID" "$DESTINATION_NAME" "$FILENAME" "$DESTINATION_SCOPE" "$DESTINATION_CATEGORY_ID" "$DESTINATION_COUNTRY_CODE" "$SEARCH_QUERY" >> "$RESULTS_JSONL_FILE"
  printf '\n' >> "$RESULTS_JSONL_FILE"

  CONFIDENCE="$(printf '%s' "$SELECTED_JSON" | node --input-type=module -e "let input=''; process.stdin.on('data',(chunk)=>input+=chunk); process.stdin.on('end',()=>{ const data=JSON.parse(input); console.log(data.selectionConfidence || ''); });")"
  SCORE="$(printf '%s' "$SELECTED_JSON" | node --input-type=module -e "let input=''; process.stdin.on('data',(chunk)=>input+=chunk); process.stdin.on('end',()=>{ const data=JSON.parse(input); console.log(data.selectionScore ?? ''); });")"
  PHOTOGRAPHER="$(printf '%s' "$SELECTED_JSON" | node --input-type=module -e "let input=''; process.stdin.on('data',(chunk)=>input+=chunk); process.stdin.on('end',()=>{ const data=JSON.parse(input); console.log(data.photographerName || ''); });")"

  echo "[$CURRENT_INDEX/$TOTAL_COUNT] saved $FILENAME <- $PHOTOGRAPHER ($CONFIDENCE, score=$SCORE)"

  if [[ "$DELAY_MS" -gt 0 ]]; then
    python3 - <<PY
import time
time.sleep(${DELAY_MS} / 1000)
PY
  fi
done < "$WORKLIST_FILE"

node "$ROOT_DIR/scripts/unsplash-trip-image-helper.mjs" \
  --mode finalize \
  --results-jsonl "$RESULTS_JSONL_FILE" \
  --failures-jsonl "$FAILURES_JSONL_FILE" \
  --csv-path "$ATTRIBUTION_CSV" \
  --json-path "$ATTRIBUTION_JSON"
