/**
 * Supabase Client Wrapper
 *
 * Provides a configured Supabase client for:
 * - Realtime subscriptions (replacing LiveEvents polling)
 * - Storage (bot avatars, prompt versions, compliance certs)
 * - Row Level Security aware queries
 *
 * Database access still goes through Drizzle ORM via the
 * Supabase connection string — this module handles the
 * non-SQL Supabase features (Realtime, Storage, Auth helpers).
 *
 * @see https://supabase.com/docs/reference/javascript
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

function loadConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
        "Set them in .env or fall back to DATABASE_URL for embedded PGlite mode.",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

// ─── Client Singletons ─────────────────────────────────────────────────────

let _anonClient: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

/**
 * Returns the public (anon-key) Supabase client.
 * Suitable for Realtime subscriptions and Storage reads.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_anonClient) {
    const config = loadConfig();
    _anonClient = createClient(config.url, config.anonKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }
  return _anonClient;
}

/**
 * Returns the service-role Supabase client (bypasses RLS).
 * Use only for server-side operations that need full access
 * (migrations, admin tasks, cross-tenant queries).
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const config = loadConfig();
    if (!config.serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service-role client.");
    }
    _serviceClient = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _serviceClient;
}

/**
 * Check whether Supabase environment is configured.
 * Returns false when running in embedded PGlite mode.
 */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// ─── Realtime Channel Helpers ───────────────────────────────────────────────

export type FleetRealtimeChannel =
  | "fleet-status"
  | "fleet-alerts"
  | "fleet-deployments"
  | "fleet-trust"
  | "fleet-playbooks";

/**
 * Subscribe to a fleet broadcast channel.
 * Falls back to no-op when Supabase is not configured.
 */
export function subscribeToChannel(
  channel: FleetRealtimeChannel,
  onMessage: (payload: { event: string; payload: Record<string, unknown> }) => void,
): { unsubscribe: () => void } {
  if (!isSupabaseConfigured()) {
    return { unsubscribe: () => {} };
  }

  const client = getSupabaseClient();
  const sub = client
    .channel(channel)
    .on("broadcast", { event: "*" }, (payload: { event: string; payload: Record<string, unknown> }) => {
      onMessage(payload as { event: string; payload: Record<string, unknown> });
    })
    .subscribe();

  return {
    unsubscribe: () => {
      sub.unsubscribe();
    },
  };
}

/**
 * Broadcast a message to a fleet channel.
 */
export async function broadcastToChannel(
  channel: FleetRealtimeChannel,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const client = getSupabaseClient();
  await client.channel(channel).send({
    type: "broadcast",
    event,
    payload,
  });
}

// ─── Storage Helpers ────────────────────────────────────────────────────────

export const STORAGE_BUCKETS = {
  BOT_AVATARS: "bot-avatars",
  PROMPT_VERSIONS: "prompt-versions",
  COMPLIANCE_CERTS: "compliance-certs",
  FLEET_EXPORTS: "fleet-exports",
} as const;

/**
 * Upload a file to Supabase Storage.
 * Returns the public URL (for public buckets) or a signed URL.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: Buffer | Blob,
  contentType: string,
): Promise<{ url: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { url: "", error: "Supabase not configured" };
  }

  const client = getSupabaseServiceClient();
  const { error } = await client.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: true,
  });

  if (error) {
    return { url: "", error: error.message };
  }

  // For public buckets, return the public URL
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Get a signed URL for a private storage file.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<{ url: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { url: "", error: "Supabase not configured" };
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    return { url: "", error: error.message };
  }

  return { url: data.signedUrl };
}

/**
 * Build a Supabase-compatible Drizzle connection string.
 * Uses transaction pooler (port 6543) for serverless-friendly connections.
 */
export function getSupabaseConnectionString(): string | null {
  if (!isSupabaseConfigured()) return null;

  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) return null;

  const url = new URL(process.env.SUPABASE_URL!);
  const projectRef = url.hostname.split(".")[0];

  return `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
}
