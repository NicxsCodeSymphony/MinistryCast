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

  const { data, error } = await supabase.functions.invoke<ProxyResult>(
    "catalog-proxy",
    {
      body: { url, headers: init?.headers ?? {} },
    },
  );
  if (error) throw new Error(error.message || "Catalog lookup failed.");
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
