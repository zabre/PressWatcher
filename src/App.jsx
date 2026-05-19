import React, { useState } from "react";

export default function App() {
  const [client, setClient] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [newsletter, setNewsletter] = useState("");
  const [loading, setLoading] = useState(false);

  const toBase64 = file =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  async function handleAnalyze() {
    if (!files.length) return alert("Ajoute au moins une capture.");
    if (!client) return alert("Indique le nom du client.");

    setLoading(true);
    setItems([]);
    setNewsletter("");

    const results = [];

    for (const file of files) {
      const base64 = await toBase64(file);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client,
          context,
          image: base64,
          filename: file.name
        })
      });

      const data = await res.json();
      results.push({
        filename: file.name,
        imagePreview: base64,
        ...data
      });

      setItems([...results]);
    }

    const newsletterRes = await fetch("/api/newsletter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client,
        items: results
      })
    });

    const newsletterData = await newsletterRes.json();
    setNewsletter(newsletterData.newsletter || "");
    setLoading(false);
  }

  function copyNewsletter() {
    navigator.clipboard.writeText(newsletter);
    alert("Newsletter copiée.");
  }

  return (
    <main className="container">
      <header>
        <h1>TBWA — Veille presse IA</h1>
        <p>Upload des captures, analyse IA, synthèse WhatsApp.</p>
      </header>

      <section className="card">
        <label>Client</label>
        <input
          value={client}
          onChange={e => setClient(e.target.value)}
          placeholder="Ex : Client X"
        />

        <label>Contexte client</label>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="Ex : enjeux, concurrents, sujets sensibles..."
        />

        <label>Captures articles</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={e => setFiles([...e.target.files])}
        />

        <button onClick={handleAnalyze} disabled={loading}>
          {loading ? "Analyse en cours..." : "Générer la veille"}
        </button>
      </section>

      {items.length > 0 && (
        <section className="grid">
          {items.map((item, index) => (
            <article className="card" key={index}>
              <img src={item.imagePreview} alt={item.filename} />
              <h3>{item.titre || "Titre non détecté"}</h3>
              <p><strong>Source :</strong> {item.source}</p>
              <p><strong>Sujet :</strong> {item.sujet}</p>
              <p><strong>Pertinence :</strong> {item.pertinence_client}</p>
              <p>{item.resume}</p>
              {item.points_a_verifier?.length > 0 && (
                <p className="warning">
                  À vérifier : {item.points_a_verifier.join(", ")}
                </p>
              )}
            </article>
          ))}
        </section>
      )}

      {newsletter && (
        <section className="card">
          <h2>Newsletter générée</h2>
          <textarea
            className="newsletter"
            value={newsletter}
            onChange={e => setNewsletter(e.target.value)}
          />
          <button onClick={copyNewsletter}>Copier pour WhatsApp</button>
        </section>
      )}
    </main>
  );
}
