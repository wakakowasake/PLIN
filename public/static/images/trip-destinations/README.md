Static image slots for curated popular trip destinations.

- URL shape: `/images/trip-destinations/<destination-id>.jpg`
- `default.jpg` is the shared fallback for auto-expanded destinations and any missing curated asset.
- Current curated files are seeded from `public/images/default-cover.jpg` so the app can ship with owned, stable assets.
- Replace any `<destination-id>.jpg` file in this directory with a destination-specific licensed image to upgrade that card without changing code.
