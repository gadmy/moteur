
  const StoreUpdates = {
      // Anti-chevauchement (v595) : si le serveur met plus de 500ms a repondre,
      // une frappe qui continue relancait une 2e requete pendant que la 1ere
      // etait encore en vol — l'une des deux pouvait revenir en echec alors
      // que l'autre, plus recente, avait bien sauvegarde : fausse alerte
      // "erreur de sauvegarde" sans perte reelle. On serialise desormais : une
      // seule requete a la fois, la plus recente version des scenes en attente
      // est renvoyee dès que la precedente se termine.
      _sceneSaveBusy: false,
      _scenePendingSave: null,
      updateScene: Utils.debounce(async (sceneId, content) => { 
          if(!state.currentProjectId || state.currentRole === 'viewer') return; 
          const idx = state.data.scenes.findIndex(s => s.id === sceneId); 
          if(idx > -1) { 
              const newTime = Utils.estimateTime(content);
              state.data.scenes[idx].scriptContent = content;
              state.data.scenes[idx].time = newTime;
          }
          // v578 (cloisonnement) : on poussait state.data EN ENTIER a chaque
          // frappe dans le scenario. Sur un projet transmis partiellement, cela
          // renverrait les cles vides recreees par getEmpty et effacerait en base
          // le budget ou les contrats. On ne pousse plus que les scenes.
          StoreUpdates._scenePendingSave = state.data.scenes;
          if(StoreUpdates._sceneSaveBusy) return;
          StoreUpdates._sceneSaveBusy = true;
          while(StoreUpdates._scenePendingSave) {
              const payload = StoreUpdates._scenePendingSave;
              StoreUpdates._scenePendingSave = null;
              const {error: saveErr} = await supabase.rpc('patch_project_data', {
                  p_id: state.currentProjectId,
                  p_patch: { scenes: payload }
              });
              if(saveErr && !StoreUpdates._scenePendingSave) Utils.toast('Erreur de sauvegarde', 'error');
          }
          StoreUpdates._sceneSaveBusy = false;
      }, 500),
      
      updateTitle: Utils.debounce(async (val) => { 
          if(!state.currentProjectId || state.currentRole === 'viewer') return; 
          state.data.title = val;
          // v578 (cloisonnement) : meme raison que updateScene. Le titre vit a deux
          // endroits — la colonne 'title' et la cle 'title' du JSON ; on ecrit les
          // deux, mais sans jamais renvoyer le reste du projet.
          const {error: e1} = await supabase.rpc('patch_project_data', {
              p_id: state.currentProjectId,
              p_patch: { title: val }
          });
          const {error: e1b} = await supabase.from('projects').update({ title: val }).eq('id', state.currentProjectId);
          if(e1 || e1b) Utils.toast('Erreur sauvegarde titre', 'error');
      }, 1000)
  };

  // LockDomains — carte domaine -> clés state.data (verrous collaboratifs, sauvegarde partielle, merge sélectif).
  // Un domaine = les onglets qui écrivent une ou plusieurs clés communes (cf. audit interconnexions).