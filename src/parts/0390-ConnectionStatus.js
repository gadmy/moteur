
  const ConnectionStatus = {
      wasOffline: false,
      init: () => {
          window.addEventListener('offline', ConnectionStatus._onOffline);
          window.addEventListener('online', ConnectionStatus._onOnline);
          if(navigator.onLine === false) ConnectionStatus._onOffline();
      },
      _onOffline: () => {
          ConnectionStatus.wasOffline = true;
          const ind = document.getElementById('sync-indicator');
          if(ind) {
              ind.textContent = '📡';
              ind.style.opacity = '1';
              ind.title = 'Hors ligne';
          }
          Utils.toast('Connexion perdue. Ne ferme pas la page ! Tes modifications seront sauvegardées dès que la connexion revient.', 'warning', 10000);
      },
      _onOnline: () => {
          const ind = document.getElementById('sync-indicator');
          if(ind) {
              ind.textContent = '☁️';
              ind.style.opacity = '0.4';
              ind.title = '';
          }
          if(ConnectionStatus.wasOffline) {
              ConnectionStatus.wasOffline = false;
              Utils.toast('Connexion rétablie.', 'success', 3000);
              // Pousse tout de suite une éventuelle modif en attente (debounce en cours ou non)
              if(state.currentProjectId) StoreSave.saveFlush();
          }
      }
  };

  // ====================================================================
  // Store — module CŒUR : cycle de vie projet (création/chargement/suppression/dashboard).
  // Sous-modules spécialisés (B.1) : StoreMigrations, StoreUpdates,
  // StoreRealtime, StoreSave. Store conserve des délégations rétrocompatibles vers eux,
  // donc le reste du code continue d'appeler Store.save(), etc.
  // ====================================================================