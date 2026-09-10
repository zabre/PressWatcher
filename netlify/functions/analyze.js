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

 const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
 method: "POST",
 headers: {
 "Authorization": `Bearer ${apiKey}`,
 "Content-Type": "application/json"
 },
 body: JSON.stringify({
 model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
 temperature: 0.2,
 response_format: { type: "json_object" },
 messages: [
 {
 role: "user",
 content: [
 {
 type: "text",
 text: prompt
 },
 {
 type: "image_url",
 image_url: {
 url: image
 }
 }
 ]
 }
 ]
 })
 });

 const groqData = await groqRes.json();

 // Remonte l'erreur explicite de Groq si l'appel échoue
 if (groqData.error) {
 return response(500, {
 error: "Erreur Groq API",
 details: groqData.error.message || JSON.stringify(groqData.error)
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
 error: "Erreur analyse",
 details: error.message
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
