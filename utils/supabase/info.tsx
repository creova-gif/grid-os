/**
 * Supabase configuration with environment variable support.
 * Configured per organization standard (Quotekit/pesa-plan pattern).
 * Overridden by VITE_SUPABASE_PROJECT_ID / VITE_SUPABASE_ANON_KEY in .env.
 */

export const projectId: string =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ||
  (import.meta.env.VITE_SUPABASE_URL
    ? import.meta.env.VITE_SUPABASE_URL.replace(/^https?:\/\/([^.]+).*/, '$1')
    : 'ohswllmovmrgbqavzscf');

export const publicAnonKey: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oc3dsbG1vdm1yZ2JxYXZ6c2NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MTI0MjUsImV4cCI6MjA4OTE4ODQyNX0.XYmIZe37OBv0WhkoRaltrso2BOPUoff7R2W4Bvd5qsQ";
