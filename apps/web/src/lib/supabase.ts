export function supabaseConfig(): { configured: boolean } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ""
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ""
  return { configured: url.length > 0 && anon.length > 0 }
}
