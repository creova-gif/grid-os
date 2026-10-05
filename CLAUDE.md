# CLAUDE.md — grid-os

## Project Overview
Energy-sector product. React/Vite frontend.

## Known Issue — Do Not Build On Top Of This Silently
This repo's Supabase client references project ID `ohswllmovmrgbqavzscf`, which does not exist in the organization's Supabase account (verified against the full project list). Any Supabase-backed feature is currently broken, not degraded. Before adding new backend-dependent features, flag this and get direction on whether to reconnect to a real project or migrate to an environment-variable-based config (see Quotekit/pesa-plan in this org for that pattern).

## Technology Stack
React, Vite, TypeScript, Supabase client (currently pointing to a nonexistent project).

## CI
Build-only (`npm ci && npm run build`). No lint/test scripts exist yet.

## AI Agent Rules
- Do not assume the Supabase connection works. Verify before building any feature that depends on it.
- Do not silently "fix" the project ID by guessing a replacement — this needs an explicit decision.

## Definition of Done
Build passes. New backend-dependent work is not added without first resolving or explicitly flagging the broken Supabase reference.
