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

 const prompt = `Tu es un analyste de veille presse. Analyse cette capture d'article pour le client "${client}".
Contexte : ${context || "Non précisé"}.

Tâches :
1. Lis attentivement le texte sur l'image.
2. Identifie le titre réel, la source et la date.
3. Résume l'article en 2 phrases concises.
4. Évalue la pertinence (forte, moyenne ou faible).

Réponds UNIQUEMENT avec un objet JSON brut valide, sans balises markdown :
{
 "titre": "",
 "source": "",
 "date": "",
 "sujet": "",
 "resume": "",
 "pertinence_client": "forte|moyenne|faible",
 "angle_client": "",
 "qualite_lecture": "bonne|moyenne|faible",
 "points_a_verifier": []
}`;

 const modelName = "qwen/qwen3.6-27b";

 let groqData = null;
 let attempts = 0;
 const maxAttempts = 3;

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
 reasoning_effort: "none", // DÉSACTIVE TOTALEMENT LE MODE <think>
 reasoning_format: "hidden", // MASQUE LES PENSÉES
 response_format: { type: "json_object" }, // FORCE UN JSON STRICT ET VALIDE
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

 // Gestion du Rate Limit (429) avec attente dynamique
 if (groqRes.status === 429 || groqData?.error?.code === "rate_limit_exceeded") {
 if (attempts < maxAttempts) {
 const retryAfter = parseInt(groqRes.headers.get("retry-after") || "4", 10);
 await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 3500)));
 continue;
 }
 }
 break;
 }

 if (groqData?.error) {
 return response(500, {
 error: `Erreur Groq API: ${groqData.error.message || JSON.stringify(groqData.error)}`
 });
 }

 let raw = groqData?.choices?.[0]?.message?.content || "{}";
 raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json/gi, "").replace(/```/g, "").trim();

 const firstBrace = raw.indexOf("{");
 const lastBrace = raw.lastIndexOf("}");
 let cleaned = (firstBrace !== -1 && lastBrace !== -1) ? raw.substring(firstBrace, lastBrace + 1) : raw;

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
