/* Reliable browser boot: CDN scripts can finish after DOMContentLoaded on slow/mobile networks. */
(function () {
  const cfg = window.TROTRO_SUPABASE_CONFIG || {};
  window.TROTRO_SUPABASE = {
    url: cfg.url || "",
    key: cfg.key || "",
    client: null,
    ready: false
  };
  let attempts = 0;
  function boot() {
    if (window.TROTRO_SUPABASE.ready) return true;
    if (!window.supabase || !window.TROTRO_SUPABASE.url || !window.TROTRO_SUPABASE.key) return false;
    try {
      window.TROTRO_SUPABASE.client = window.supabase.createClient(
        window.TROTRO_SUPABASE.url,
        window.TROTRO_SUPABASE.key,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      );
      window.TROTRO_SUPABASE.ready = true;
      document.dispatchEvent(new CustomEvent("trotro:supabase-ready"));
      return true;
    } catch (error) {
      console.error("TrotroMall Supabase initialization failed:", error);
      return false;
    }
  }
  if (boot()) return;
  const retry = setInterval(() => {
    attempts += 1;
    if (boot() || attempts >= 80) clearInterval(retry);
  }, 250);
  window.addEventListener("load", boot, { once: true });
})();
