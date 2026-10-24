# CLAUDE.md — grid-os

## Project Overview
Energy-sector product. React/Vite frontend.

## Known Issue & Resolution
This repo's Supabase client originally referenced legacy project ID `ohswllmovmrgbqavzscf`, which did not exist in the organization's Supabase account. The codebase has now been migrated to an environment-variable-based config per the Quotekit/pesa-plan pattern (`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env.example`). When no credentials are provided or when the backend is unreachable, the application gracefully degrades to local simulation/cache instead of throwing unhandled exceptions. To attach a live Supabase project, supply `VITE_SUPABASE_PROJECT_ID` in `.env`.

## Technology Stack
React, Vite, TypeScript, Tailwind CSS, Supabase client (environment-variable driven).

## CI
Branch pipeline runs `pnpm install --frozen-lockfile && pnpm run test && pnpm run build` via GitHub Actions (`.github/workflows/ci-validate.yml`).

## Testing
Run unit tests locally with `pnpm run test` (powered by Vitest). Tests cover local telemetry simulation, API resilience, and offline field agent payment/lookup logic.

## AI Agent Rules
- Do not assume the Supabase connection works. Verify before building any feature that depends on it.
- Do not silently "fix" the project ID by guessing a replacement — this needs an explicit decision.

## Definition of Done
Build passes. New backend-dependent work is not added without first resolving or explicitly flagging the broken Supabase reference.
