const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MODEL = "gpt-4.1-mini";

function corsHeaders(origin, allowedOrigins) {
  const allowed = (allowedOrigins || "").split(",").map(v => v.trim()).filter(Boolean);
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function validImageDataUrl(value) {
  if (typeof value !== "string") return false;
  if (value.length > MAX_BODY_BYTES * 1.4) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env.ALLOWED_ORIGINS);
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
    if (request.method === "OPTIONS") {
      if (origin && !allowed.includes(origin)) return new Response("Origin not allowed", { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/analyze") return json({ error: "Not found. POST to /analyze." }, 404, headers);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, headers);
    if (!origin || !allowed.includes(origin)) return json({ error: "This website is not allowed to use the plate scanner. Check ALLOWED_ORIGINS in Worker settings." }, 403, headers);
    if (!env.OPENAI_API_KEY) return json({ error: "AI backend is missing its OPENAI_API_KEY secret." }, 503, headers);
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "Photo request is too large. Choose a smaller image." }, 413, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Request must contain valid JSON." }, 400, headers); }
    if (!validImageDataUrl(body.image)) return json({ error: "Send a JPEG, PNG or WebP image. The image must be resized before upload." }, 400, headers);

    const prompt = `You are estimating food from a meal photograph for a personal food diary in South Africa. Identify only foods that are reasonably visible; South African dishes may include pap (maize meal porridge), chakalaka, samp and beans, boerewors, amasi, amadumbe, bunny chow, vetkoek, mogodu, rice, stews and braai foods. Do not claim certainty where the image is ambiguous. Estimate edible cooked portion weights in grams based on visual cues, but explain that photo portion sizes are uncertain. For each ingredient estimate nutrient values PER 100 GRAMS of that food as served. Include: kcal; protein, carbs, fat, fibre and sugars in grams; sodium in milligrams; salt in grams; calcium, iron, potassium and vitamin C in milligrams; vitamin A in micrograms RAE; vitamin D and vitamin B12 in micrograms. These are photo-based estimates, not verified laboratory data. Micronutrients are especially difficult to infer from an image: only provide a numeric estimate when it is reasonably supported by the identified food and typical food-composition knowledge; otherwise use null. Never fill missing values with zero and never imply the photo measured nutrient content. Include confidence as low, medium, or high. Return JSON only matching this structure: {"mealName":"short descriptive name","notes":"short uncertainty note","ingredients":[{"name":"food name and preparation","grams":150,"confidence":"medium","nutritionPer100g":{"kcal":130,"protein":3,"carbs":28,"fat":0.3,"fibre":0.4,"sugars":1,"sodium":20,"salt":0.05,"calcium":10,"iron":0.5,"potassium":100,"vitaminC":2,"vitaminA":10,"vitaminD":null,"vitaminB12":null}}]}. Limit to at most 12 visible ingredients. If no food is visible, return an empty ingredients array and explain in notes. Do not infer hidden oil, sauces, sugar or ingredients unless visible; mention uncertainty in notes. Nutrition values must be non-negative numbers or null.`;

    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_output_tokens: 2800,
          input: [{ role: "user", content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: body.image, detail: "high" }
          ] }],
          text: { format: { type: "json_object" } }
        })
      });
    } catch {
      return json({ error: "Could not reach the AI service. Try again when your connection is stable." }, 502, headers);
    }
    const raw = await upstream.text();
    if (!upstream.ok) {
      let message = "AI service request failed.";
      try { const parsed = JSON.parse(raw); message = parsed.error?.message || message; } catch {}
      // Avoid returning provider details that could expose operational information.
      return json({ error: upstream.status === 401 ? "The backend API key was rejected. Check the OPENAI_API_KEY Worker secret." : upstream.status === 429 ? "AI usage limit reached. Check the API account's billing and limits." : `AI service error (${upstream.status}). Please try again later.` }, upstream.status === 429 ? 429 : 502, headers);
    }
    let result;
    try {
      const response = JSON.parse(raw);
      const textOutput = (response.output || []).flatMap(item => item.content || []).find(part => part.type === "output_text")?.text || response.output_text;
      result = JSON.parse(textOutput);
    } catch {
      return json({ error: "The AI returned an unreadable result. Try another photo." }, 502, headers);
    }
    if (!Array.isArray(result.ingredients)) return json({ error: "The AI result did not contain an ingredient list." }, 502, headers);
    const ingredients = result.ingredients.slice(0, 12).map(item => {
      const n = item.nutritionPer100g || {};
      const safeNum = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(value, 10000) : null;
      return {
        name: String(item.name || "Unknown food").slice(0, 100),
        grams: Math.max(1, Math.min(5000, safeNum(item.grams) || 100)),
        confidence: ["low", "medium", "high"].includes(String(item.confidence).toLowerCase()) ? String(item.confidence).toLowerCase() : "low",
        nutritionPer100g: { kcal: safeNum(n.kcal), protein: safeNum(n.protein), carbs: safeNum(n.carbs), fat: safeNum(n.fat), fibre: safeNum(n.fibre), sugars: safeNum(n.sugars), sodium: safeNum(n.sodium), salt: safeNum(n.salt), calcium: safeNum(n.calcium), iron: safeNum(n.iron), potassium: safeNum(n.potassium), vitaminC: safeNum(n.vitaminC), vitaminA: safeNum(n.vitaminA), vitaminD: safeNum(n.vitaminD), vitaminB12: safeNum(n.vitaminB12) }
      };
    });
    return json({ mealName: String(result.mealName || "Scanned meal").slice(0, 120), notes: String(result.notes || "Photo-based nutrition estimates; verify ingredients and portions.").slice(0, 500), ingredients }, 200, headers);
  }
};
