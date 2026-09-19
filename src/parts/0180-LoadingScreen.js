
  const LoadingScreen = {
      messages: [
          "Préparation du plateau...",
          "Le perchman s'est encore perdu...",
          "Chargement des véhicules de régie...",
          "Les comédiens se maquillent...",
          "Le réalisateur cherche sa vision...",
          "Café pour l'équipe technique ☕",
          "On attend le soleil... ☀️",
          "Silence, on tourne ! 🤫",
          "Vérification des raccords costume...",
          "Le chef op' règle les lumières...",
          "Moteur demandé... 🎬",
          "Le script court après les feuilles...",
          "Câblage en cours... 🔌",
          "Le HMC fait des miracles 💄",
          "Briefing de l'équipe...",
          "Installation du combo vidéo...",
          "Les figurants arrivent en retard...",
          "On cherche le clap... 🎬",
          "Le directeur photo médite...",
          "Pause syndicale obligatoire ⏰",
          "Le stagiaire fait le café...",
          "Repérage des axes caméra...",
          "Déchargement du camion lumière...",
          "La scripte note tout... 📝",
          "On refait une prise pour la route !",
          "Le steadicamer s'échauffe 🏃",
          "Derniers réglages son...",
          "Le producteur compte les heures sup...",
          "Installation de la dolly...",
          "C'est bon pour moi ! 👍",
          "Vérification de la gate...",
          "On enchaîne ! ⏭️",
          "Le 1er assistant gère le planning...",
          "Distribution des feuilles de service...",
          "Le machino installe les rails...",
          "Raccord maquillage entre deux prises...",
          "Le régisseur gère les repas 🍽️",
          "Check de la caméra...",
          "On attend que l'avion passe... ✈️",
          "Le DA ajuste le décor...",
		      "Rébellion sur le plateau ! 🔥",
    "Le réalisateur se cache pour pleurer 😢",
    "Les techniciens et les acteurs font un poker 🃏",
    "L'acteur principal a encore une idée de réalisation... 🙄",
      ],
      interval: null,
      currentIndex: 0,
      
      show: (title = "Chargement du projet...") => {
          const overlay = document.getElementById('loading-overlay');
          const titleEl = overlay.querySelector('.loading-title');
          const progressBar = document.getElementById('loading-progress-bar');
          
          titleEl.textContent = title;
          progressBar.style.width = '10%';
          overlay.classList.add('visible');
          
          // Message initial aléatoire
          LoadingScreen.currentIndex = Math.floor(Math.random() * LoadingScreen.messages.length);
          LoadingScreen.updateMessage();
          
          // Changer le message toutes les 1.5 secondes
          LoadingScreen.interval = setInterval(() => {
              LoadingScreen.currentIndex = (LoadingScreen.currentIndex + 1) % LoadingScreen.messages.length;
              LoadingScreen.updateMessage();
              // Progression simulée
              const current = parseFloat(progressBar.style.width) || 10;
              if(current < 90) {
                  progressBar.style.width = Math.min(current + Math.random() * 15, 90) + '%';
              }
          }, 1500);
      },
      
      updateMessage: () => {
          const msgEl = document.getElementById('loading-message');
          if(msgEl) {
              msgEl.style.animation = 'none';
              msgEl.offsetHeight; // Trigger reflow
              msgEl.style.animation = 'messageFade 0.5s ease';
              msgEl.textContent = LoadingScreen.messages[LoadingScreen.currentIndex];
          }
      },
      
      setProgress: (percent) => {
          const progressBar = document.getElementById('loading-progress-bar');
          if(progressBar) {
              progressBar.style.width = Math.min(percent, 100) + '%';
          }
      },
      
      hide: () => {
          const overlay = document.getElementById('loading-overlay');
          const progressBar = document.getElementById('loading-progress-bar');
          
          // Compléter la barre
          if(progressBar) progressBar.style.width = '100%';
          
          // Arrêter les messages
          if(LoadingScreen.interval) {
              clearInterval(LoadingScreen.interval);
              LoadingScreen.interval = null;
          }
          
          // Cacher après un court délai pour voir la barre à 100%
          setTimeout(() => {
              overlay.classList.remove('visible');
          }, 300);
      }
  };
