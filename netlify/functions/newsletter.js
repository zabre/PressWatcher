export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return response(405, { error: "Method not allowed" });
    }

    const { client, items } = JSON.parse(event.body || "{}");

    if (!client || !items?.length) {
      return response(400, { error: "Client et articles requis." });
    }

    const clientApiKey = event.headers["x-groq-api-key"] || event.headers["authorization"];
    const apiKey = clientApiKey ? (clientApiKey.startsWith("Bearer ") ? clientApiKey.substring(7) : clientApiKey) : process.env.GROQ_API_KEY;

    if (!apiKey) {
      return response(400, { error: "Clé API Groq manquante. Veuillez la configurer dans l'application." });
    }

    const prompt = `
Tu es consultant senior en veille presse.

Client : ${client}

À partir des fiches articles suivantes, génère une newsletter courte, professionnelle et prête à copier dans WhatsApp.

Contraintes :
- commencer par un titre avec la date du jour ;
- faire une synthèse générale courte ;
- lister ensuite les articles par ordre d'importance ;
- pour chaque article : titre, source, sujet, résumé, pertinence ;
- ton clair, agence, professionnel ;
- ne pas inventer d'informations ;
- format texte simple, compatible WhatsApp.

Articles :
${JSON.stringify(items, null, 2)}
`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const groqData = await groqRes.json();
    const newsletter = groqData?.choices?.[0]?.message?.content || "";

    return response(200, { newsletter });
  } catch (error) {
    return response(500, {
      error: "Erreur newsletter",
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
