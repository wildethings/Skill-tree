import type { Backend } from './adapter'
import { createLocalBackend } from './local'
import { createSupabaseBackend, supabaseConfigured } from './supabase'

/** Supabase when it is configured, otherwise this device. */
export const backend: Backend = supabaseConfigured ? createSupabaseBackend() : createLocalBackend()
export { supabaseConfigured }
