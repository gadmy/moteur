# 🎬 Moteur

**L'application gratuite tout-en-un pour gérer vos projets de films.**

![Moteur - Audiovisual Production Management](og-image.png)

[![Version](https://img.shields.io/badge/version-2.1.4-blue.svg)](https://moteur.studio)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Made in France](https://img.shields.io/badge/Made%20in-France-red.svg)](https://moteur.studio)

---

## ✨ Fonctionnalités

### 📝 Écriture
- **Scénario** - Éditeur professionnel avec formatage automatique (Action, Dialogue, Didascalie...)
- **Import PDF/FDX** - Importez vos scénarios existants avec assistant intelligent
- **Séquencier** - Vue d'ensemble de toutes vos scènes
- **Beat Board** - Canvas libre pour organiser visuellement votre histoire
- **Storyboard** - Dessinez vos plans avec l'éditeur intégré
- **MoodBoard** - Tableaux d'inspiration avec générateur de palettes

### 🎭 Casting & Production
- **Personnages** - Fiches détaillées liées au scénario
- **Comédiens** - Photos, mensurations, compétences, disponibilités
- **Équipe technique** - Organigramme par département
- **Dépouillement** - Analyse des besoins par scène

### 📅 Organisation
- **Planning** - Calendrier de tournage interactif
- **Feuilles de service** - Génération automatique avec météo
- **Budget** - Mode simple ou avancé avec validation hiérarchique
- **Contrats** - CDDU, droits à l'image, prestations (conformes au droit français)

### 🌍 Communauté
- **Univers** - Annuaire géolocalisé de professionnels
- **Profils publics** - Comédiens, techniciens, associations, entreprises
- **Forum & Fil d'actualités** - Échangez avec la communauté
- **Collaboration temps réel** - Travaillez en équipe sur vos projets

---

## 🚀 Démo

👉 **[moteur.studio](https://moteur.studio)**

---

## 📸 Captures d'écran

| Scénario | Séquencier | Planning |
|----------|------------|----------|
| Éditeur pro avec raccourcis | Vue cartes & Beat Board | Feuilles de service auto |

| Univers | Storyboard | Budget |
|---------|------------|--------|
| Carte des talents | Éditeur de dessin | Graphiques & validation |

---

## 🛠️ Technologies

- **Frontend** : HTML5, CSS3, JavaScript (Vanilla)
- **Backend** : [Supabase](https://supabase.com) (Auth, Database, Storage)
- **Emails** : [EmailJS](https://emailjs.com)
- **Cartes** : [Leaflet](https://leafletjs.com) + OpenStreetMap
- **Hébergement** : GitHub Pages

---

## 📁 Structure du projet

```
moteur/
├── index.html      # Application principale (single-page app)
├── og-image.png    # Image pour partages sociaux
├── sitemap.xml     # Plan du site pour SEO
├── robots.txt      # Instructions pour les robots
└── README.md       # Ce fichier
```

---

## 🚀 Installation locale

1. **Cloner le repo**
   ```bash
   git clone https://github.com/votre-username/moteur.git
   cd moteur
   ```

2. **Lancer un serveur local**
   ```bash
   # Avec Python
   python -m http.server 8000
   
   # Ou avec Node.js
   npx serve
   ```

3. **Ouvrir dans le navigateur**
   ```
   http://localhost:8000
   ```

> ⚠️ L'application nécessite une connexion internet pour Supabase (auth & données).

---

## 🤝 Contribution

Les contributions sont les bienvenues ! 

1. Fork le projet
2. Crée une branche (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commit tes changements (`git commit -m 'Ajout de...'`)
4. Push (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvre une Pull Request

---

## 📝 Changelog

### V2.1.4 (Janvier 2025)
- ✨ Dashboard Admin avec graphiques d'évolution
- ✨ Tutoriel intégré (17 sections)
- ✨ Stats détaillées par métier/type
- 🐛 Fix Supabase AbortError
- 🐛 Fix doublons vue Liste

[Voir l'historique complet →](https://github.com/votre-username/moteur/commits/main)

---

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 👨‍💻 Auteur

**Guillaume de Mauroy**

- 🌐 [moteur.studio](https://moteur.studio)
- 📧 Contact via l'application

---

## ⭐ Soutenir le projet

Si Moteur vous est utile, n'hésitez pas à :
- ⭐ Mettre une étoile sur GitHub
- 🐛 Signaler les bugs
- 💡 Proposer des améliorations
- 📢 Partager autour de vous !

---

<p align="center">
  <strong>🎬 Moteur</strong> - Fait avec ❤️ pour les cinéastes
</p>
