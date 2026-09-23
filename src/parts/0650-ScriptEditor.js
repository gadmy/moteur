
  const ScriptEditor = {
      // ========== TOOLBAR & FORMATAGE (V7.8 → ScriptEditorToolbar) ==========
      // V7.8.e — délégations rétrocompatibles vers ScriptEditorToolbar.
      // La méthode privée placeCursorInside a migré intégralement dans ScriptEditorToolbar (zéro appel externe).
      getBlockNode: (node) => { if(!node) return null; if (node.nodeType === 1 && node.classList.contains('script-editor-box')) return node.firstElementChild || null; while (node && node.nodeName !== 'DIV' && !node.classList?.contains('script-editor-box')) node = node.parentNode; return (node && node.classList && !node.classList.contains('script-editor-box')) ? node : null; },
      // ========== AUTO-COMPLÉTION (V7.6 → ScriptEditorAC) ==========
      // V7.6.e — délégations rétrocompatibles vers ScriptEditorAC.
      // Les 3 méthodes privées (_getCaretOffsetInBlock, _setCaretAtOffset, renderScriptACList)
      // ont migré intégralement dans ScriptEditorAC (zéro appel externe).
      checkAC: (editor) => ScriptEditorAC.checkAC(editor),
      highlightAC: () => ScriptEditorAC.highlightAC(),
      switchACColumn: (delta) => ScriptEditorAC.switchACColumn(delta),
      selectAC: () => ScriptEditorAC.selectAC(),
      hideAC: () => ScriptEditorAC.hideAC(),
      toggleAC: () => ScriptEditorAC.toggleAC(),
      toggleScriptBd: () => {
          state.scriptBdEnabled = !state.scriptBdEnabled;
          localStorage.setItem('moteur_scriptBd_enabled', state.scriptBdEnabled ? 'true' : 'false');
          Utils.toast(`Dépouillement clic droit ${state.scriptBdEnabled ? 'activé' : 'désactivé'}`, 'success');
          UI.renderScript();
          if(ScriptEditor.viewMode === 'continuous' && ScriptEditor.activeSceneId) ScriptEditor.updateContinuousSidebar(ScriptEditor.activeSceneId);
      },
      syncCharMeta: (name, sceneId) => { 
          const existsInDb = state.data.characters.find(c => c.name.toLowerCase() === name.toLowerCase()); 
          if (!existsInDb) return; 
          const scene = state.data.scenes.find(s => s.id === sceneId); 
          if(scene) { 
              const currentList = scene.perso ? scene.perso.split(';').map(s=>s.trim()) : []; 
              if(!currentList.find(n => n.toLowerCase() === name.toLowerCase())) { 
                  // v580 : l'ajout passe par l'identifiant de la fiche, le
                  // texte n'est plus qu'un cache regenere.
                  FicheLinks.addCharToScene(scene, existsInDb.id); 
                  // v620 : mise à jour visuelle de la ligne personnages dans la
                  // colonne de gauche, sans attendre un rendu complet.
                  if(ScriptEditor.activeSceneId === sceneId) ScriptEditorNav.updateContinuousSidebar(sceneId);
              } 
          } 
          Store.save(); 
      },
      
      // ========== NAVIGATION SCÈNES (V7.7 → ScriptEditorNav) ==========
      // V7.7.d — délégations rétrocompatibles vers ScriptEditorNav.
      addSceneAtCursor: () => ScriptEditorNav.addSceneAtCursor(),
      
      // ========== RECHERCHER / REMPLACER (V7.5 → ScriptEditorSearch) ==========
      // V7.5.e — délégations rétrocompatibles vers ScriptEditorSearch.
      // L'état (searchResults, currentResultIndex, backupScripts) et les méthodes internes
      // (clearHighlights, findInElement, highlightCurrentResult, saveBackup) ont migré
      // intégralement dans ScriptEditorSearch.
      openSearchReplace: () => ScriptEditorSearch.openSearchReplace(),
      closeSearchReplace: () => ScriptEditorSearch.closeSearchReplace(),
      searchInScript: () => ScriptEditorSearch.searchInScript(),
      searchNext: () => ScriptEditorSearch.searchNext(),
      searchPrev: () => ScriptEditorSearch.searchPrev(),
      replaceOne: () => ScriptEditorSearch.replaceOne(),
      replaceAll: () => ScriptEditorSearch.replaceAll(),
      undoReplace: () => ScriptEditorSearch.undoReplace(),
      
      // ========== VUE SCRIPT CONTINU ==========
      viewMode: 'continuous', // 'scenes' ou 'continuous' - Vue Script par défaut
      activeSceneId: null,
      
      // V7.3 → délégué à ScriptEditorViewMode.init()
      initViewMode: () => ScriptEditorViewMode.init(),
      
      // V7.3 → délégué à ScriptEditorViewMode.set()
      
      // 31 aout — COMPTEUR PAGES / SCENES (etape 8e).
      // C'est l'information qu'on cherche le plus souvent dans un onglet
      // scenario — « on en est a combien de pages ? » — et elle n'etait
      // affichee nulle part.
      // Deux choix qui evitent de faire mentir l'application :
      //   . les scenes comptees sont celles de la VUE COURANTE, via
      //     UI.getScenesForCurrentView : sur une serie, on compte l'episode
      //     ouvert, pas tout le projet ;
      //   . la duree vient d'Utils.estimateTime, deja utilisee sur chaque
      //     fiche de scene. Inventer un second calcul aurait donne deux
      //     chiffres differents pour la meme chose dans le meme ecran.
      // La conversion en pages suit la convention du metier : une page de
      // scenario a l'americaine vaut environ une minute a l'ecran. D'ou le
      // « ≈ », qui dit que c'est une estimation et non un decompte.
      updateCount: () => {
          const el = document.getElementById('script-count');
          if(!el) return;
          const scenes = (typeof UI !== 'undefined' && UI.getScenesForCurrentView)
              ? UI.getScenesForCurrentView() : (state.data.scenes || []);
          const n = scenes.length;
          const minutes = scenes.reduce((t, s) => t + parseFloat(Utils.estimateTime(s.scriptContent) || 0), 0);
          const pages = Math.max(0, Math.round(minutes));
          const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
          const duree = h > 0 ? (h + ' h ' + String(m).padStart(2, '0')) : (m + ' min');
          // « 0 page » sur un scenario vide serait juste mais decourageant :
          // on n'annonce la pagination qu'a partir du moment ou il y a du texte.
          el.innerHTML = n === 0
              ? 'Aucune scène'
              : (pages < 1
                  ? `<strong>${n}</strong> scène${n > 1 ? 's' : ''} · pas encore écrit`
                  : `<strong>${n}</strong> scène${n > 1 ? 's' : ''} · ≈ <strong>${pages}</strong> page${pages > 1 ? 's' : ''} · ${duree}`);
      },
      
      // V7.4 → délégué à ScriptEditorEpisodes.initSelector()
      initEpisodeSelector: () => ScriptEditorEpisodes.initSelector(),
      
      // V7.4 → délégué à ScriptEditorEpisodes.switch()
      switchEpisode: (episodeId) => ScriptEditorEpisodes.switch(episodeId),
      
      renderContinuous: () => ScriptEditorContinuous.renderContinuous(),
      
      setActiveScene: (sceneId, index) => ScriptEditorNav.setActiveScene(sceneId, index),
      updateContinuousSidebar: (sceneId, index) => ScriptEditorNav.updateContinuousSidebar(sceneId, index),
      goToSceneContinuous: (index) => ScriptEditorNav.goToSceneContinuous(index),
      scrollToSceneInContinuous: (sceneId) => ScriptEditorNav.scrollToSceneInContinuous(sceneId),
      
      // Timestamps pour détecter double-tap
      lastEnterTime: 0,
      lastTabTime: 0,
      doubleTapDelay: 300,
      
      // Vérifie si le bloc est vide (juste des espaces, <br>, ou rien)
      isBlockEmpty: (block) => {
          if(!block) return true;
          const text = block.innerText.replace(/[\s\u00A0]/g, '').replace(/[{}()]/g, '');
          return text.length === 0;
      },
      
      // Change le type du bloc actuel sans créer de nouvelle ligne
      changeBlockType: (block, newType) => ScriptEditorToolbar.changeBlockType(block, newType),
      
      handleKeyContinuous: (e, content, sceneId) => ScriptEditorContinuous.handleKeyContinuous(e, content, sceneId),
      
      setFormatDirectContinuous: (content, className) => ScriptEditorToolbar.setFormatDirectContinuous(content, className),
      
      // V7.1 → délégué à ScriptEditorPrefs.openModal()
      openPrefsModal: () => ScriptEditorPrefs.openModal(),
      
      saveSelection: () => ScriptEditorToolbar.saveSelection(),
      
      formatContinuous: (className, e) => ScriptEditorToolbar.formatContinuous(className, e),
      updateToolbarContinuous: () => ScriptEditorToolbar.updateToolbarContinuous(),
      
      
      // ========== VUE CONTINUE (V7.9 → ScriptEditorContinuous) ==========
      // V7.9.e — délégations rétrocompatibles vers ScriptEditorContinuous.
      // L'état draggedSceneId reste dans ScriptEditor (partagé avec renderContinuous interne au sous-module).
      draggedSceneId: null,
  };
  
  // Initialiser le drag au chargement
  document.addEventListener('DOMContentLoaded', () => {
      Tooltip.init();
      ScriptEditorSearch.initDrag();
      ConnectionStatus.init();
      
      // === Installation auto du blocker d'emojis sur les champs de saisie ===
      // Tout input[type=text] / textarea / [contenteditable] de l'app voit ses emojis
      // retirés à la volée (pour cohérence dossier de production professionnel).
      // Exception : éléments avec data-allow-emojis="true" (chat, commentaires, forum, etc.)
      const SAFE_SELECTOR = 'input[type="text"]:not([data-allow-emojis="true"]):not([data-emoji-blocker-skip]), input[type="search"]:not([data-allow-emojis="true"]), textarea:not([data-allow-emojis="true"]):not([data-emoji-blocker-skip])';
      
      const installOnAll = (root) => {
          if(!root) return;
          if(root.matches && root.matches(SAFE_SELECTOR)) Utils.installEmojiBlocker(root);
          if(root.querySelectorAll) root.querySelectorAll(SAFE_SELECTOR).forEach(el => Utils.installEmojiBlocker(el));
      };
      
      // Pass 1 : installer sur tous les éléments existants
      installOnAll(document.body);
      
      // Pass 2 : observer les ajouts dynamiques (modales, vues créées au runtime)
      try {
          const observer = new MutationObserver((mutations) => {
              for(const mut of mutations) {
                  mut.addedNodes.forEach(node => {
                      if(node.nodeType === 1) installOnAll(node);
                  });
              }
          });
          observer.observe(document.body, { childList: true, subtree: true });
      } catch(e) {
          console.warn('[Utils] MutationObserver KO, blocker emoji limité aux éléments existants:', e);
      }
      
      // === D5 : accessibilité clavier ===
      // Les éléments cliquables marqués role="button" deviennent actionnables au clavier :
      // Entrée ou Espace sur un tel élément focalisé déclenche son clic.
      document.addEventListener('keydown', (e) => {
          if(e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
          const el = document.activeElement;
          if(!el || el.getAttribute('role') !== 'button') return;
          const tag = el.tagName;
          if(tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          e.preventDefault();
          el.click();
      });
      // Onglets (div cliquables) : focusables au clavier + annoncés comme boutons.
      try {
          document.querySelectorAll('.tab-btn').forEach(el => {
              if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
              if(!el.hasAttribute('role')) el.setAttribute('role', 'button');
          });
      } catch(_) {}
      
      // v593 : passage général — tout élément cliquable (onclick) qui n'est pas
      // nativement focusable (bouton, lien, champ) devient atteignable au Tab et
      // annoncé comme bouton. Le gestionnaire Entrée/Espace ci-dessus s'occupe déjà
      // de l'activation dès qu'un élément porte role="button" ; il ne manquait que
      // le focus et le rôle. Idempotent (ne touche pas ce qui a déjà un tabindex),
      // et rejoué sur tout contenu ajouté dynamiquement (modales, vues créées au runtime).
      const NATIVE_FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';
      const makeClickablesFocusable = (root) => {
          if(!root || !root.querySelectorAll) return;
          const nodes = root.matches && root.matches('[onclick]') ? [root, ...root.querySelectorAll('[onclick]')] : [...root.querySelectorAll('[onclick]')];
          nodes.forEach(el => {
              if(el.matches(NATIVE_FOCUSABLE)) return;
              if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
              if(!el.hasAttribute('role')) el.setAttribute('role', 'button');
          });
      };
      makeClickablesFocusable(document.body);
      try {
          const a11yObserver = new MutationObserver((mutations) => {
              for(const mut of mutations) {
                  mut.addedNodes.forEach(node => {
                      if(node.nodeType === 1) makeClickablesFocusable(node);
                  });
              }
          });
          a11yObserver.observe(document.body, { childList: true, subtree: true });
      } catch(e) {
          console.warn('[Utils] MutationObserver KO, accessibilité clavier limitée aux éléments existants:', e);
      }
      
  });
  
  // ==================== MODULE RESOURCES ====================
  // ====================================================================
  // Resources — gestion des ressources/objets du projet (CRUD + liens scènes + export PDF).
  // Module CRUD cohérent (peu d'état partagé), organisé en sections internes.
  // ====================================================================