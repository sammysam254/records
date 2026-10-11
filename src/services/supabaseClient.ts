import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://etgyilosivcxfyjenyfc.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Z3lpbG9zaXZjeGZ5amVueWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2ODQ5NzgsImV4cCI6MjEwNzI2MDk3OH0.2XDm3kLf_dragIqykv3Y7J3YtU0t8zlXjAzIGRJ-4cw';

export function getSupabaseConfig() {
  const url = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey);
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return supabaseInstance;
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem('supabase_url', url.trim());
  localStorage.setItem('supabase_anon_key', anonKey.trim());
  try {
    supabaseInstance = createClient(url.trim(), anonKey.trim());
  } catch (err) {
    console.warn('Error instantiating updated Supabase client:', err);
  }
}
