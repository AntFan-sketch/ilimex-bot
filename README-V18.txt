IlimexBot V18 overlay - 27 August 2026

Changes:
- Makes trial/contact handoff deterministic across poultry, mushroom and general enquiries.
- Uses recent conversation context to keep sector-specific handoff guidance correct.
- Strengthens mushroom commercial qualification while keeping the ~17% yield result as observed trial evidence, not a guarantee.
- Preserves specific UK geography from the conversation when the enquiry form only says UK (e.g. Northern Ireland, UK).
- Keeps estimated_annual_value as recurring annual service value and records indicative hardware + installation opportunity separately in crm_leads.strategic_fit_notes.

Validation:
- TypeScript check passed: tsc --noEmit
- Full Next.js build could not be completed in the sandbox because Next attempted to download the Linux SWC package from npm, and internet access is disabled. Run npm run build locally before committing.

Copy the CONTENTS of this folder over the root of your local ilimex-bot repository and allow the four files to overwrite.
