export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return response(405, { error: "Method not allowed" });
    }

    const { client, context, image, filename } = JSON.parse(event.body || "{}");

    if (!image || !client) {
      return response(400, { error: "Image et client requis." });
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

Retourne uniquement un JSON valide :
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
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.2,
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
