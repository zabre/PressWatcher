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

 const prompt = `Tu es analyste veille presse. Analyse cette image d'article pour le client "${client}".
Contexte : ${context || "Non précisé"}.

TÂCHE : Extrais les informations réelles de l'image.
Réponds EXCLUSIVEMENT avec un JSON brut valide, sans balise de code, sans aucun texte autour :
{
 "titre": "vrai titre extrait de l'article",
 "source": "nom du média ou non détecté",
 "date": "date ou non détecté",
 "sujet": "sujet principal",
 "resume": "résumé en 2 phrases simples",
 "pertinence_client": "forte",
 "angle_client": "explication courte",
 "qualite_lecture": "bonne",
 "points_a_verifier": []
}`;

 // meta-llama/llama-4-scout-17b-16e-instruct : Pas de pensées <think>, pas de tronquage
 const modelName = "meta-llama/llama-4-scout-17b-16e-instruct";

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

 if (groqRes.status === 429 || groqData?.error?.code === "rate_limit_exceeded") {
 if (attempts < maxAttempts) {
 await new Promise((resolve) => setTimeout(resolve, 3000));
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

 // Nettoyage Markdown
 raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

 // Extraction du JSON
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
