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
Tu es un analyste de veille presse en agence de communication.

Client : ${client}
Contexte client : ${context || "Non précisé"}

Analyse cette capture d'article de presse.

Objectifs :
1. Lire le contenu visible.
2. Identifier titre, source et date si visibles.
3. Déterminer le sujet principal.
4. Produire une synthèse en 3 à 5 lignes maximum.
5. Évaluer la pertinence pour le client.
6. Ne jamais inventer d'information absente de l'image.
7. Si une information est illisible, écrire "non détecté".

Retourne uniquement un JSON valide avec ce format exact :
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
 temperature: 0.2,
 response_format: { type: "json_object" },
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
 // Si Groq indique combien de temps attendre (retry-after), on l'utilise, sinon on attend 4s puis 7s
 const retryAfter = parseInt(groqRes.headers.get("retry-after") || "4", 10);
 const waitTime = Math.max(retryAfter * 1000, attempts * 3500);
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
 const cleaned = raw.replace(/```json|```/g, "").trim();

 let parsed;
 try {
 parsed = JSON.parse(cleaned);
 } catch {
 parsed = {
 titre: "À vérifier",
 source: "non détecté",
 date: "non détecté",
 sujet: "non détecté",
 resume: cleaned,
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
