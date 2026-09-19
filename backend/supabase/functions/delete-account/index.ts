import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function removePrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
) {
  const folder = prefix.replace(/\/+$/, "");
  if (!folder) return;
  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit: 1000,
  });
  if (error || !data?.length) return;
  const files: string[] = [];
  const subfolders: string[] = [];
  for (const row of data) {
    if (!row.name) continue;
    const path = `${folder}/${row.name}`;
    if (row.id == null) subfolders.push(path);
    else files.push(path);
  }
  if (files.length) {
    await admin.storage.from(bucket).remove(files);
  }
  for (const sub of subfolders) {
    await removePrefix(admin, bucket, sub);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Sign in required." });
    }

    const body = (await req.json().catch(() => ({}))) as {
      password?: string;
    };
    const password = body.password ?? "";
    if (password.length < 6) {
      return json(400, { error: "Enter your current password to confirm." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: "Auth service is not configured." });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.id || !user.email) {
      return json(401, { error: "Sign in required." });
    }

    const verify = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: passwordError } = await verify.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (passwordError) {
      return json(400, { error: "Password is incorrect." });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Remove media before deleting the profile row.
    await Promise.allSettled([
      removePrefix(admin, "avatars", user.id),
      removePrefix(admin, "chat-attachments", user.id),
    ]);

    const { error: profileError } = await userClient.rpc("delete_my_account");
    if (profileError) {
      return json(400, {
        error: profileError.message || "Could not delete your account.",
      });
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(
      user.id,
    );
    if (authDeleteError) {
      return json(500, {
        error:
          authDeleteError.message ||
          "Profile removed, but login cleanup failed. Contact support.",
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete the account.";
    return json(500, { error: message });
  }
});
