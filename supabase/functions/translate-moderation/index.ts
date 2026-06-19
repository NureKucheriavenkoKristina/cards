import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"] as const;

function looksCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

async function geminiTranslateToUkrainian(text: string, apiKey: string): Promise<string | null> {
  const prompt =
    `Translate the following moderation text to Ukrainian. Keep deck titles in quotes, usernames, and proper nouns unchanged. Output only the translation, no quotes or preamble.\n\n${text}`;

  for (const model of MODELS) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.1 },
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out) return out;
    } catch {
      /* try next model */
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("EXPO_PUBLIC_GEMINI_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!geminiKey?.trim()) {
    return new Response(JSON.stringify({ error: "Gemini not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: adminOk, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !adminOk) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { texts?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawList = Array.isArray(body.texts)
    ? body.texts
    : typeof body.text === "string"
    ? [body.text]
    : [];

  const texts = rawList
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 20);

  if (texts.length === 0) {
    return new Response(JSON.stringify({ translations: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const translations: string[] = [];
  for (const source of texts) {
    if (looksCyrillic(source)) {
      translations.push(source);
      continue;
    }
    const translated = await geminiTranslateToUkrainian(source, geminiKey.trim());
    translations.push(translated && translated !== source ? translated : source);
  }

  return new Response(JSON.stringify({ translations }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
