import React, { useState, useEffect, useRef } from "react";

export default function App() {
  // Config States
  const [client, setClient] = useState(() => localStorage.getItem("pw_client") || "");
  const [context, setContext] = useState(() => localStorage.getItem("pw_context") || "");
  const [groqApiKey, setGroqApiKey] = useState(() => localStorage.getItem("pw_groq_api_key") || "");
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Dashboard States
  const [files, setFiles] = useState([]);
  const [newsletter, setNewsletter] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [errorLog, setErrorLog] = useState("");

  const fileInputRef = useRef(null);

  // Sync config to localStorage
  useEffect(() => {
    localStorage.setItem("pw_client", client);
  }, [client]);

  useEffect(() => {
    localStorage.setItem("pw_context", context);
  }, [context]);

  useEffect(() => {
    localStorage.setItem("pw_groq_api_key", groqApiKey);
  }, [groqApiKey]);

  // Handle Drag & Drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      addFiles(e.target.files);
    }
  };

  // Add Files to State
  const addFiles = (selectedFiles) => {
    const newItems = Array.from(selectedFiles).map((file, idx) => {
      const id = Date.now() + "-" + idx;
      const item = {
        id,
        file,
        name: file.name,
        status: "idle", // 'idle' | 'analyzing' | 'success' | 'error'
        preview: null,
        data: null,
        error: ""
      };

      // Load image preview
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => 
          prev.map(f => f.id === id ? { ...f, preview: reader.result } : f)
        );
      };
      reader.readAsDataURL(file);

      return item;
    });

    setFiles(prev => [...prev, ...newItems]);
  };

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // Perform Analysis
  async function handleAnalyze() {
    if (!files.length) return alert("Veuillez ajouter au moins une capture d'écran d'article.");
    if (!client) return alert("Veuillez indiquer le nom du client.");
    if (!groqApiKey) return alert("Veuillez configurer votre clé d'API Groq.");

    setLoading(true);
    setErrorLog("");
    setNewsletter("");

    // Initialize all files to 'analyzing'
    setFiles(prev => prev.map(f => ({ ...f, status: "analyzing", error: "", data: null })));

    const results = [];

    // Loop through each file sequentially
    for (const item of files) {
      // Get base64 (already loaded in item.preview, or load it)
      let base64 = item.preview;
      if (!base64) {
        base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(item.file);
        });
      }

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-groq-api-key": groqApiKey
          },
          body: JSON.stringify({
            client,
            context,
            image: base64,
            filename: item.name
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Erreur serveur (${res.status})`);
        }

        const data = await res.json();
        
        results.push({
          filename: item.name,
          preview: base64, // Keep image preview for HTML export
          ...data
        });

        // Mark this specific file as success
        setFiles(prev => 
          prev.map(f => f.id === item.id ? { ...f, status: "success", data } : f)
        );
      } catch (error) {
        console.error("Error analyzing file:", item.name, error);
        
        // Mark this specific file as error
        setFiles(prev => 
          prev.map(f => f.id === item.id ? { ...f, status: "error", error: error.message } : f)
        );
      }
    }

    // Filter successfully analyzed articles for the newsletter
    const successfulItems = results.map(({ preview, ...data }) => data);

    if (results.length === 0) {
      setLoading(false);
      setErrorLog("Aucun article n'a pu être analysé avec succès. Vérifiez votre clé API.");
      return;
    }

    try {
      // Generate the newsletter
      const newsletterRes = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": groqApiKey
        },
        body: JSON.stringify({
          client,
          items: successfulItems
        })
      });

      if (!newsletterRes.ok) {
        const errData = await newsletterRes.json();
        throw new Error(errData.error || `Erreur serveur (${newsletterRes.status})`);
      }

      const newsletterData = await newsletterRes.json();
      setNewsletter(newsletterData.newsletter || "");
      
      // Store complete result list inside state for export function
      // By copying the base64 and data together
      setFiles(prev => prev.map(f => {
        const matchingResult = results.find(r => r.filename === f.name);
        return matchingResult ? { ...f, data: matchingResult } : f;
      }));

    } catch (error) {
      console.error("Error generating newsletter:", error);
      setErrorLog(`L'analyse des articles a réussi, mais la génération de la newsletter a échoué : ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Copy to Clipboard
  function copyNewsletter() {
    if (!newsletter) return;
    navigator.clipboard.writeText(newsletter);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // Generate WhatsApp Share Link
  const getWhatsAppShareLink = () => {
    if (!newsletter) return "#";
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(newsletter)}`;
  };

  // Export Autonomous HTML File
  const exportToHTML = () => {
    if (!newsletter) return;

    // Build articles items HTML
    const articlesHTML = files
      .filter(f => f.status === "success" && f.data)
      .map(f => {
        const item = f.data;
        const pertinenceClass = `badge-pertinence-${item.pertinence_client ? item.pertinence_client.toLowerCase() : 'moyenne'}`;
        const pertinenceLabel = item.pertinence_client || "MOYENNE";
        
        return `
        <div class="article-item">
          <div class="article-image-box">
            ${item.preview ? `<img class="article-img" src="${item.preview}" alt="${item.titre || 'Capture article'}" />` : ''}
          </div>
          <div class="article-content">
            <div class="article-meta">
              <span class="badge badge-source">${item.source || 'Source non détectée'}</span>
              <span class="badge ${pertinenceClass}">Pertinence ${pertinenceLabel}</span>
            </div>
            <h3 class="article-title">${item.titre || 'Titre non détecté'}</h3>
            <p class="article-summary">${item.resume || 'Aucun résumé.'}</p>
            <div class="article-details">
              <div class="detail-item">
                <span class="detail-label">Sujet :</span>
                <span class="detail-val">${item.sujet || 'Non spécifié'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Date :</span>
                <span class="detail-val">${item.date || 'Non détectée'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Angle Client :</span>
                <span class="detail-val">${item.angle_client || 'Non spécifié'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Qualité :</span>
                <span class="detail-val">${item.qualite_lecture || 'Bonne'}</span>
              </div>
              ${item.points_a_verifier && item.points_a_verifier.length > 0 ? `
              <div class="warning-box">
                <strong>⚠️ À vérifier :</strong> ${item.points_a_verifier.join(", ")}
              </div>` : ''}
            </div>
          </div>
        </div>`;
      })
      .join("\n");

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>L'Observatoire \\ Revue de Presse ${client}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-body: #F5F5F5;
      --text-main: #0A0A0A;
      --text-muted: #888888;
      --border-color: #E0E0E0;
      --color-primary: #0A0A0A;
      --color-accent: #FF0000;
      --color-disruption-yellow: #FFE600;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-display: 'Helvetica Neue', 'Arial Black', sans-serif;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-body);
      color: var(--text-main);
      margin: 0;
      padding: 60px 20px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    
    .wrapper {
      max-width: 1000px;
      margin: 0 auto;
      background: #FFFFFF;
      border: 1px solid var(--border-color);
      border-radius: 0px;
      padding: 50px;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid var(--color-primary);
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    
    .brand h1 {
      font-family: var(--font-display);
      font-size: 2.5rem;
      font-weight: 900;
      margin: 0;
      line-height: 0.95;
      letter-spacing: -0.03em;
      text-transform: uppercase;
    }
    
    .brand h1 span {
      font-weight: 900;
      color: var(--color-accent);
      margin-left: 2px;
    }
    
    .brand p {
      margin: 8px 0 0 0;
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    
    .meta-box {
      text-align: right;
    }
    
    .meta-box .date {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    
    .meta-box .client-name {
      font-family: var(--font-display);
      font-size: 1.8rem;
      font-weight: 900;
      margin: 4px 0 0 0;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      color: var(--color-primary);
    }
    
    .section-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 12px;
      margin-bottom: 30px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .section-title span {
      color: var(--color-accent);
      font-weight: 900;
    }
    
    .article-item {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 30px;
      border: 1px solid var(--border-color);
      border-radius: 0px;
      padding: 24px;
      margin-bottom: 30px;
      background: #FFFFFF;
      transition: border-color 0.2s ease;
    }
    
    .article-item:hover {
      border-color: var(--color-primary);
    }
    
    @media (max-width: 768px) {
      .article-item {
        grid-template-columns: 1fr;
        gap: 20px;
      }
    }
    
    .article-image-box {
      width: 100%;
      height: 180px;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      background: #000000;
      position: relative;
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    
    .article-image-box:hover {
      transform: scale(1.02);
    }
    
    .article-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: grayscale(100%);
      transition: filter 0.25s ease;
    }
    
    .article-image-box:hover .article-img {
      filter: grayscale(0%);
    }
    
    .article-content {
      display: flex;
      flex-direction: column;
      justify-content: start;
    }
    
    .article-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .badge {
      font-size: 0.72rem;
      padding: 4px 10px;
      border-radius: 0px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      display: inline-flex;
      align-items: center;
    }
    
    .badge-source {
      background: var(--bg-body);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    
    .badge-pertinence-forte,
    .badge-pertinence-moyenne,
    .badge-pertinence-faible {
      background: var(--color-disruption-yellow);
      color: var(--color-primary);
    }
    
    .article-title {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: var(--text-main);
      line-height: 1.3;
    }
    
    .article-summary {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin: 0 0 20px 0;
      line-height: 1.6;
    }
    
    .article-details {
      border-top: 1px solid var(--border-color);
      padding-top: 16px;
      margin-top: auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    .detail-item {
      font-size: 0.85rem;
    }
    
    .detail-label {
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      display: block;
      margin-bottom: 2px;
    }
    
    .detail-val {
      color: var(--text-main);
    }
    
    .warning-box {
      background: #FFFDF0;
      border: 1px dashed #FFEBB3;
      border-radius: 0px;
      padding: 10px 14px;
      font-size: 0.8rem;
      color: #8C6D00;
      margin-top: 14px;
      grid-column: span 2;
    }
    
    footer {
      text-align: center;
      margin-top: 50px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      padding-top: 24px;
    }

    /* Lightbox Styles */
    .lightbox {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(10, 10, 10, 0.98);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      user-select: none;
    }
    .lightbox-container {
      position: relative;
      max-width: 92%;
      max-height: 90%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
      border: 1px solid #333333;
      border-radius: 4px;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    .lightbox-close {
      position: absolute;
      top: 30px;
      right: 40px;
      background: none;
      border: none;
      color: #FFFFFF;
      font-size: 3rem;
      font-weight: 300;
      cursor: pointer;
      line-height: 1;
      transition: color 0.2s ease;
      z-index: 10000;
    }
    .lightbox-close:hover {
      color: var(--color-accent);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <header>
      <div class="brand">
        <h1>L'Observatoire <span>\\</span></h1>
        <p>Studio de Veille Média — TBWA</p>
      </div>
      <div class="meta-box">
        <div class="date">${new Date().toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div class="client-name">${client}</div>
      </div>
    </header>

    ${context ? `
    <div style="margin-bottom: 30px; font-size: 0.85rem; border: 1px solid var(--border-color); padding: 16px 20px; border-radius: 0px; background: #FFFFFF; color: var(--text-muted)">
      <strong style="text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.08em; display: block; margin-bottom: 4px; color: var(--text-main)">Contexte & Enjeux :</strong> ${context}
    </div>` : ""}

    <h2 class="section-title">Articles Analysés <span>\\</span></h2>
    
    <div>
      ${articlesHTML}
    </div>

    <footer>
      Généré automatiquement par L'Observatoire \\ Studio de Veille Média TBWA. Tous droits réservés.
    </footer>
  </div>

  <!-- Lightbox Modal -->
  <div id="lightbox" class="lightbox">
    <button id="lightbox-close" class="lightbox-close" aria-label="Fermer la vue plein écran">&times;</button>
    <div class="lightbox-container">
      <img id="lightbox-img" class="lightbox-img" src="" alt="Capture plein écran" />
    </div>
  </div>

  <script>
    // Lightbox Modal Functionality
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.getElementById('lightbox-close');

    // Attach click events to all image boxes
    document.querySelectorAll('.article-image-box').forEach(box => {
      box.addEventListener('click', () => {
        const img = box.querySelector('.article-img');
        if (img && img.src) {
          lightboxImg.src = img.src;
          lightbox.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
      });
    });

    closeBtn.addEventListener('click', closeLightbox);

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-container')) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.style.display === 'flex') {
        closeLightbox();
      }
    });

    function closeLightbox() {
      lightbox.style.display = 'none';
      lightboxImg.src = '';
      document.body.style.overflow = '';
    }
  </script>
</body>
</html>`;

    // Create Blob and trigger download
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const formattedClient = client.replace(/\s+/g, '_');
    const formattedDate = new Date().toISOString().split('T')[0];
    
    link.href = url;
    link.download = `Veille_${formattedClient}_${formattedDate}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="container animate-fade-in">
      <header>
        <div className="brand">
          <span className="brand-tag">TBWA — Morning Press Watch</span>
          <div className="title-container">
            <h1>L'Observatoire</h1>
            <span className="backslash">\</span>
          </div>
          <p>Studio intelligent de veille média matinale et synthèses prêtes-à-partager.</p>
        </div>
        <div className="system-time">
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
            Matinée du {new Date().toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* Sidebar Configuration */}
        <section className="card-disruption">
          <h2>Configuration</h2>

          <div className="form-group">
            <label>Clé API Groq</label>
            <div className="api-key-container">
              <input
                type={showApiKey ? "text" : "password"}
                value={groqApiKey}
                onChange={e => setGroqApiKey(e.target.value)}
                placeholder="gsk_..."
                className="api-key-input"
              />
              <button 
                type="button" 
                className="btn-toggle-visibility"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "Masquer la clé" : "Afficher la clé"}
              >
                {showApiKey ? "👁️" : "🙈"}
              </button>
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "6px" }}>
              Clé sécurisée, conservée localement dans votre navigateur.
            </p>
          </div>

          <div className="form-group">
            <label>Client</label>
            <input
              type="text"
              value={client}
              onChange={e => setClient(e.target.value)}
              placeholder="Ex: McDonald's, Michelin, Apple..."
            />
          </div>

          <div className="form-group">
            <label>Contexte & Enjeux Client</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Ex: Sujets sensibles, concurrents clés, focus RSE..."
            />
          </div>

          {/* Drag & Drop Zone */}
          <div className="form-group" style={{ marginTop: "24px" }}>
            <label>Captures d'Écran Articles</label>
            <div 
              className={`dropzone ${isDragActive ? "active" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <div className="dropzone-icon">📸</div>
              <p>
                <strong>Glissez-déposez</strong> vos captures ou <strong>parcourez</strong>
              </p>
              <p style={{ fontSize: "0.75rem" }}>Fichiers PNG, JPG supportés</p>
            </div>

            {/* List of uploaded files waiting for analysis */}
            {files.length > 0 && (
              <div className="uploaded-files-list">
                {files.map((f) => (
                  <div className="file-chip" key={f.id}>
                    <span>{f.name}</span>
                    <button 
                      className="file-chip-remove" 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.id);
                      }}
                      disabled={loading}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            className="primary-btn" 
            onClick={handleAnalyze} 
            disabled={loading || !files.length}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>Veille en cours...</span>
              </>
            ) : (
              <>
                <span>✦ Générer la Veille Matinale</span>
              </>
            )}
          </button>

          {errorLog && (
            <div className="warning-box" style={{ marginTop: "20px", color: "var(--color-danger)", background: "rgba(239, 68, 68, 0.05)", borderColor: "rgba(239, 68, 68, 0.2)" }}>
              {errorLog}
            </div>
          )}
        </section>

        {/* Dashboard Work Area */}
        <section className="results-area">
          {/* Article grid */}
          {files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📰</div>
              <h3>Aucune capture d'écran importée</h3>
              <p>Renseignez les détails du client à gauche, puis importez les captures d'écran des articles de presse du matin pour générer l'analyse.</p>
            </div>
          ) : (
            <div className="articles-grid">
              {files.map((item) => (
                <article className="article-card animate-fade-in" key={item.id}>
                  {/* Visual indication of file status */}
                  {item.status === "analyzing" && (
                    <div className="card-loader">
                      <div className="spinner"></div>
                      <span className="card-loader-text">Analyse IA en cours...</span>
                    </div>
                  )}

                  {item.status === "error" && (
                    <div className="card-loader" style={{ background: "rgba(239, 68, 68, 0.95)" }}>
                      <span style={{ fontSize: "1.8rem" }}>⚠️</span>
                      <span className="card-loader-text" style={{ color: "white", padding: "0 16px", textAlign: "center" }}>
                        {item.error || "Erreur d'analyse"}
                      </span>
                    </div>
                  )}

                  <div className="article-img-wrapper">
                    {item.preview ? (
                      <img className="article-img" src={item.preview} alt={item.name} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-disabled)" }}>
                        Chargement de l'image...
                      </div>
                    )}
                  </div>

                  <div className="article-body">
                    {item.status === "success" && item.data ? (
                      <>
                        <div className="article-meta">
                          <span className="badge badge-source">
                            {item.data.source || "Source non détectée"}
                          </span>
                          {item.data.pertinence_client && (
                            <span className={`badge badge-pertinence-${item.data.pertinence_client.toLowerCase()}`}>
                              Pertinence {item.data.pertinence_client}
                            </span>
                          )}
                        </div>

                        <h3 className="article-title">
                          {item.data.titre || "Titre non détecté"}
                        </h3>

                        <p className="article-summary">
                          {item.data.resume || "Aucun résumé généré."}
                        </p>

                        <div className="article-details">
                          <div className="detail-row">
                            <span className="detail-label">Sujet :</span>
                            <span className="detail-val">{item.data.sujet || "Non spécifié"}</span>
                          </div>
                          {item.data.date && (
                            <div className="detail-row">
                              <span className="detail-label">Date :</span>
                              <span className="detail-val">{item.data.date}</span>
                            </div>
                          )}
                          {item.data.angle_client && (
                            <div className="detail-row">
                              <span className="detail-label">Angle :</span>
                              <span className="detail-val">{item.data.angle_client}</span>
                            </div>
                          )}
                        </div>

                        {item.data.points_a_verifier && item.data.points_a_verifier.length > 0 && (
                          <div className="warning-box">
                            <strong>⚠️ À vérifier :</strong> {item.data.points_a_verifier.join(", ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", minHeight: "150px", color: "var(--text-muted)" }}>
                        <span style={{ fontSize: "1.2rem", marginBottom: "8px" }}>⏳</span>
                        <span style={{ fontSize: "0.8rem", letterSpacing: "0.5px" }}>EN ATTENTE DE LANCEMENT</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Generated Newsletter Section */}
          {newsletter && (
            <div className="newsletter-card animate-fade-in">
              <div className="newsletter-header">
                <div className="newsletter-title-wrapper">
                  <span className="newsletter-title-icon">📝</span>
                  <h2 className="newsletter-title">Veille Matinale Synthétisée</h2>
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", letterSpacing: "1px", textTransform: "uppercase" }}>
                  Optimisée WhatsApp
                </span>
              </div>

              <textarea
                className="newsletter-textarea"
                value={newsletter}
                onChange={e => setNewsletter(e.target.value)}
              />

              <div className="newsletter-actions">
                <button 
                  onClick={copyNewsletter} 
                  className={`btn btn-copy ${copySuccess ? 'btn-copy-success' : ''}`}
                >
                  {copySuccess ? (
                    <>
                      <span>✓ Copié !</span>
                    </>
                  ) : (
                    <>
                      <span>📋 Copier WhatsApp</span>
                    </>
                  )}
                </button>
                <a 
                  href={getWhatsAppShareLink()} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-share"
                  style={{ textDecoration: "none" }}
                >
                  <span>💬 Partager WhatsApp</span>
                </a>
                <button 
                  onClick={exportToHTML} 
                  className="btn btn-export"
                >
                  <span>📥 Exporter Revue HTML</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
