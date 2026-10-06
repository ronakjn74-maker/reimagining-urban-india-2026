// Fill these two values from Supabase → Project Settings → API.
// The "anon public" key is meant to be public; all data is protected by the database rules.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
  LOGIN_DOMAIN: 'ledger.local', // must match schema.sql (usernames become username@ledger.local)
};
