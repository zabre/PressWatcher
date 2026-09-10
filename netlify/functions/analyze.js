export async function handler(event) {
 try {
 if (event.httpMethod !== "POST") {
 return response(405, { error: "Method not allowed" });
 }

 const { client, context, image, filename } = JSON.parse(event.body || "{}");

 if (!image || !client) {
 return response(400, { error: "Image et client requis." });
 }

 const clientApiKey = event.headers["x-groq-api-key"] || event.headers["authorization"];
 const apiKey = clientApiKey ? (clientApiKey.startsWith("Bearer ") ? clientApiKey.substring(7) : clientApiKey) : process.env.GROQ_API_KEY;

 if (!apiKey) {
 return response(400, { error: "Clé API Groq manquante. Veuillez la configurer dans l'application." });
 }

 const prompt = `
Tu es un analyste de veille presse.

Client : ${client}
Contexte : ${context || "Non précisé"}

Analyse cette capture d'article de presse.
Consignes :
- Sois très concis et synthétique.
- Si une info est illisible, mets "non détecté".
- Réponds UNIQUEMENT avec un objet JSON brut, sans texte avant ou après.

Format JSON obligatoire :
{
 "titre": "titre de l'article",
 "source": "nom du média",
 "date": "date ou non détecté",
 "sujet": "sujet principal en une phrase",
 "resume": "synthèse en 2 ou 3 phrases courtes",
 "pertinence_client": "forte",
 "angle_client": "explication courte",
 "qualite_lecture": "bonne",
 "points_a_verifier": []
}
`;

 const modelName = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";

 let groqData = null;
 let attempts = 0;
 const maxAttempts = 4;

 while (attempts < maxAttempts) {
 attempts++;
 const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
 method: "POST",
 headers: {
 "Authorization": `Bearer ${apiKey}`,
 "Content-Type": "application/json"
 },
 body: JSON.stringify({
 model: modelName,
 temperature: 0.1,
 max_completion_tokens: 750,
 messages: [
 {
 role: "user",
 content: [
 { type: "text", text: prompt },
 { type: "image_url", image_url: { url: image } }
 ]
 }
 ]
 })
 });

 groqData = await groqRes.json();

 // Si erreur 429 (Rate limit)
 if (groqRes.status === 429 || groqData?.error?.code === "rate_limit_exceeded") {
 if (attempts < maxAttempts) {
 const retryAfter = parseInt(groqRes.headers.get("retry-after") || "5", 10);
 const waitTime = Math.max(retryAfter * 1000, attempts * 4000);
 await new Promise((resolve) => setTimeout(resolve, waitTime));
 continue;
 }
 }
 break;
 }

 if (groqData?.error) {
 const errMsg = groqData.error.message || JSON.stringify(groqData.error);
 return response(500, {
 error: `Erreur Groq API: ${errMsg}`
 });
 }

 const raw = groqData?.choices?.[0]?.message?.content || "{}";

 // Extraction robuste du JSON même si entouré de balises markdown ou de texte
 let jsonMatch = raw.match(/\{[\s\S]*\}/);
 let cleaned = jsonMatch ? jsonMatch[0] : raw;

 let parsed;
 try {
 parsed = JSON.parse(cleaned);
 } catch {
 parsed = {
 titre: "À vérifier",
 source: "non détecté",
 date: "non détecté",
 sujet: "non détecté",
 resume: raw.slice(0, 300),
 pertinence_client: "moyenne",
 angle_client: "",
 qualite_lecture: "faible",
 points_a_verifier: ["Réponse IA non structurée", filename]
 };
 }

 return response(200, parsed);
 } catch (error) {
 return response(500, {
 error: `Erreur analyse: ${error.message}`
 });
 }
}

function response(statusCode, body) {
 return {
 statusCode,
 headers: {
 "Content-Type": "application/json"
 },
 body: JSON.stringify(body)
 };
}
