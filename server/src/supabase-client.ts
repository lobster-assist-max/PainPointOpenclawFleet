/**
 * Supabase client — optional integration layer.
 *
 * When SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, the Fleet
 * backend can use Supabase for auth, storage (bot avatars), and realtime
 * subscriptions.  When absent, the app falls back to the existing
 * embedded-postgres / local-storage path — nothing breaks.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  anonKey?: string;
}

let _client: SupabaseClient | null = null;

function readConfigFromEnv(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return {
    url,
    serviceRoleKey,
    anonKey: process.env.SUPABASE_ANON_KEY?.trim() || undefined,
  };
}

export function isSupabaseEnabled(): boolean {
  return readConfigFromEnv() !== null;
}

/**
 * Returns the singleton Supabase service-role client.
 * Throws if Supabase is not configured — callers should gate on
 * `isSupabaseEnabled()` first.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const config = readConfigFromEnv();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  _client = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

/**
 * Returns a Supabase client scoped to the anon key (for RLS-aware
 * queries). Falls back to service-role if no anon key is set.
 */
export function getSupabaseAnonClient(): SupabaseClient {
  const config = readConfigFromEnv();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }
  const key = config.anonKey ?? config.serviceRoleKey;
  return createClient(config.url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
