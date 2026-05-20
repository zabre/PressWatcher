# L'Observatoire \ — Studio de Veille Presse TBWA\Worldwide

> **Disruption® en tant que langage visuel.** L'Observatoire est un outil intelligent de veille média matinale conçu pour simplifier et sublimer le travail des consultants de l'agence. Il permet de transformer des captures d'écran brutes en synthèses prêtes-à-partager sur WhatsApp et en rapports HTML premium pour les clients.

Ce dépôt est structuré et configuré pour être déployé en un clic sur **Netlify** tout en prenant en compte le système d'identité visuelle de **TBWA\\Worldwide**.

---

## 🚀 Déploiement en 1 clic sur Netlify

Cliquez sur le bouton ci-dessous pour importer et déployer automatiquement ce projet sur votre compte Netlify :

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/zabre/PressWatcher)

### Configuration des variables d'environnement sur Netlify

Lors du déploiement ou dans l'onglet **Site configuration > Environment variables** de votre interface Netlify, configurez les variables suivantes :

| Variable | Description | Valeur par défaut / Exemple |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | *(Optionnel)* Clé API Groq par défaut pour l'agence. Si elle n'est pas fournie, les utilisateurs devront renseigner leur propre clé directement dans l'application. | `gsk_...` |
| `GROQ_MODEL` | Modèle de vision par défaut pour l'analyse des captures d'écran. | `meta-llama/llama-4-scout-17b-16e-instruct` |

---

## 🎨 Charte Visuelle TBWA\Worldwide Intégrée

L'application implémente de manière rigoureuse la charte **TBWA** :
- **Palette monochrome** : Noir absolu (`#0A0A0A`), Blanc pur (`#FFFFFF`), Fond gris blanc neutre (`#F5F5F5`).
- **Accentuation ponctuelle** : Rouge signal (`#FF0000`) pour les hovers interactifs et le Backslash `\` géant emblématique.
- **Jaune Disruption** : Pastilles (`#FFE600`) réservées exclusivement à l'évaluation de pertinence.
- **Formes architecturales** : Angles stricts à 90° (`border-radius: 0px`) sur tous les éléments UI, boutons et badges.
- **Typographie de Caractère** : Google Fonts **Inter** pour le corps de texte et les labels majuscules, displays Helvetica Neue Black.

---

## 📥 Fonctionnalités de Partage & d'Exportation
- **📋 Copier WhatsApp** : Copie dans le presse-papier de la synthèse formatée pour mobile.
- **💬 Partager WhatsApp** : Ouverture directe d'un chat avec le texte pré-rempli.
- **📥 Exporter Revue HTML** : Génération d'un fichier `.html` unique autonome, **embarquant toutes les images en Base64**. Ce fichier intègre une **visionneuse (Lightbox) interactive en pur JavaScript** pour inspecter les images en plein écran à leur netteté de pixel maximale.

---

## 💻 Développement Local

Pour lancer l'application en local sur votre machine :

### 1. Cloner le dépôt et installer les dépendances
```bash
git clone https://github.com/zabre/PressWatcher.git
cd PressWatcher
npm install
```

### 2. Configurer les variables d'environnement locales
Créez un fichier `.env` à la racine :
```env
GROQ_API_KEY=votre_cle_groq
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

### 3. Lancer le serveur de développement local
Pour exécuter l'application et les fonctions Netlify localement, utilisez la CLI Netlify :
```bash
# Lancement du proxy Netlify Dev (Front sur 5173 / Fonctions sur 8888)
npx netlify dev
```
Ouvrez ensuite [http://localhost:5173](http://localhost:5173) pour tester l'application en local.

### 4. Compiler pour la production
```bash
npm run build
```
Les fichiers compilés seront placés dans le dossier `/dist`.
