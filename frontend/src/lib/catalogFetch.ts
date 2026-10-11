import { supabase } from "./supabase";

type ProxyResult = {
  ok?: boolean;
  status?: number;
  data?: unknown;
  error?: string;
};

export async function catalogFetch(
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
): Promise<Response> {
  const direct = async () =>
    fetch(url, {
      headers: init?.headers,
      signal: init?.signal,
    });

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  // Browser/dev can hit catalogs directly. Packaged Tauri often cannot.
  if (!isTauri) {
    try {
      return await direct();
    } catch {
      /* fall through to proxy */
    }
  }

  const { data: invoked, error } = await supabase.functions.invoke<ProxyResult>(
    "catalog-proxy",
    {
      body: { url, headers: init?.headers ?? {} },
    },
  );
  let data = invoked;
  if (error) {
    // The proxy mirrors the catalog's status (e.g. 404), which the client reports as an error.
    const context = (error as { context?: unknown }).context;
    const proxied =
      context instanceof Response
        ? ((await context.json().catch(() => null)) as ProxyResult | null)
        : null;
    if (!proxied || typeof proxied.status !== "number") {
      throw new Error(proxied?.error || error.message || "Catalog lookup failed.");
    }
    data = proxied;
  }
  if (data?.error) throw new Error(data.error);

  const status = data?.status ?? (data?.ok ? 200 : 502);
  const payload = data?.data;
  const body =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? null);
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
