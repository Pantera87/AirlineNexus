# Aircraft Images

Drop aircraft photos in this folder (`public/images/aircraft/`). Files are served at `/images/aircraft/<name>.jpg`.

## Naming convention

The filename (without extension) must match the aircraft's `imageKey`:

- **Fleet Management / Quick Purchase** uses `AIRCRAFT_DATABASE` from `src/data/aircraft.ts` → use each entry's `imageKey`, e.g. `crj200.jpg`, `e175.jpg`, `a320neo.jpg`.
- **Marketplace cards / detail modal** resolve via the aircraft `id`, e.g. `boeing-737-max-8.jpg` (ids are already lowercase with hyphens).

> Tip: keep filenames lowercase, no spaces, only `[a-z0-9-]`. The helper in `src/utils/aircraftImages.ts` normalizes keys the same way.

## Fallback

If a matching image file is missing (or fails to load), the components automatically show a generic plane icon — so the UI never breaks while you're still populating this folder.
