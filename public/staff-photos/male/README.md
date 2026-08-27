# Male staff photo bank

Drop portrait images into this folder. The hiring generator picks a random
file from here for every male candidate.

## Naming convention

- Zero-padded 1-based index, `.png`: `01.png`, `02.png`, … `36.png`
- Square images work best (they are rendered with `object-cover` in small squares).
- The game requests indices up to `PHOTO_BANK_SIZE` (36) — see
  `src/utils/staffEngine.ts`. Add or remove images freely: if a numbered file
  is missing, the UI silently shows the candidate's initials instead.
