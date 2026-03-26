# Engineering update

Applied on the current release baseline without changing the approved visual result.

## What was stabilized
1. Replaced timeline slot positioning based on `:nth-child()` with explicit modifier classes so the approved composition no longer depends on document order alone.
2. Consolidated active CSS overrides for dress-code boards, footer contact spacing and the `48rem` responsive layer to reduce cascade fragility.
3. Kept the existing section reveal effect, but aligned the codebase around the current scroll + `requestAnimationFrame` model and removed stale reduced-motion tail selectors from unused reveal variants.
4. Reduced event-date drift risk by making the hero date the canonical machine-readable source for countdown logic.

## Files changed
- `index.html`
- `css/styles.css`
- `js/main.js`
- `ENGINEERING_UPDATE.md`
- `TECH_REPORT.md`

## Intentionally not changed
- section composition
- typography and decorative styling
- RSVP transport/backend behavior
- secondary production enhancements outside the stabilization scope


## Additional stabilization pass
5. Removed the production-inactive horizontal overflow debug hook from runtime JS so release behavior is no longer mixed with leftover console diagnostics.
6. Decoupled countdown/reveal initialization from `document.fonts.ready`; fonts readiness now only affects the `fonts-ready` marker and no longer gates core page behavior.
7. Finished the timeline slot stabilization on mobile by replacing the remaining odd/even alignment dependency with explicit slot-based alignment.
