// Which Supabase project Cloud Sync talks to. Both values are safe to publish:
// the anon key only identifies the project - what a person can actually read or
// change is decided by who is signed in (see supabase-setup.sql).
//
// Fill these in once (Supabase > Project Settings > API) and every device offers
// "Sign in with email" straight away. Left blank, a device that already had a
// saved connection keeps using it, and the Advanced section of the Cloud Sync
// menu lets you paste the two values on a new device.
window.CLOUD_CONFIG = {
  url: '',      // e.g. 'https://abcdefgh.supabase.co'
  anonKey: ''   // the "anon public" key
};
