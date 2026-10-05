# Adsterra placeholder dimensions — TrotroMall

The site now includes non-network placeholder containers for future Adsterra code. Replace the placeholder contents with the Adsterra script/snippet after your Adsterra publisher account provides it.

## Desktop placements
- Left rail: **300 × 250 px** and **300 × 600 px**.
- Right rail: **300 × 250 px** and **300 × 600 px**.
- These are intentionally sized around standard desktop display placements and have a responsive max-width so they do not overflow.

## Mobile placement
- Side rails collapse into the page flow and the CSS reserves a **320 × 100 px** responsive placeholder where appropriate.
- Do not force a 300px-wide desktop rail onto a 320px mobile viewport.

## Adsterra setup
1. Create the matching ad zone in Adsterra.
2. Copy the exact publisher snippet Adsterra gives you.
3. Replace the contents of the relevant `.adsterra-slot` element while keeping its class.
4. Do not put private API keys or service-role credentials in these HTML files.

The placeholders are not live ads and do not generate revenue until an Adsterra zone/snippet is inserted.
