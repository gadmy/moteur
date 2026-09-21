
  const LockDomains = {
      defs: {
          // v601 — LE DOMAINE « SCENES » EST COUPE EN DEUX, PAS SUPPRIME.
          // Le CONTENU des scenes passe au verrou PAR SCENE (SceneLock) : le
          // Scenario, le Sequencier et le Depouillement ne se bloquent donc plus
          // d'un bloc. Mais ce domaine couvrait aussi saisons, episodes,
          // etiquettes, groupes et metadonnees du scenario — qui ne sont PAS des
          // scenes et n'ont aucun verrou fin. Les laisser sans domaine, c'etait
          // les laisser sans filet : deux personnes qui renomment une saison
          // s'ecraseraient, cette fois sans rien pour l'empecher.
          // Ils restent donc sur un verrou de domaine, sous leur vrai nom.
          structure:    { label: 'Structure du récit', keys: ['seasons','episodes','tags','groups','scriptMeta'],               tabs: ['seasons','episodes'] },
          // v570 : Rapports de script sorti du domaine 'scenes'. Verifie ligne a ligne :
          // il LIT les scenes (8 fois) et les plans (6 fois) mais n'en ecrit AUCUN ;
          // sa seule ecriture est scriptReports. Un verrou protege ce qu'on ECRIT, pas
          // ce qu'on lit — une lecture legerement en retard ne perd rien (c'est deja le
          // cas entre ce module et le Storyboard, domaine separe de longue date).
          scriptreport: { label: 'Rapports de script', keys: ['scriptReports'],                                                 tabs: ['scriptreport'] },
          // v601 — LE CASTING PASSE AU VERROU PAR FICHE (FicheLock). Sur les sept
          // onglets qui s'y pretaient, c'est celui ou deux personnes travaillent
          // vraiment en meme temps : on remplit une distribution a plusieurs.
          // Les onglets Personnages et Comedien.nes ne se bloquent donc plus
          // d'un bloc ; le badge reste, il cesse seulement de VERROUILLER.
          // Les cles restent ecrites ici pour memoire : characters, actors.
          planning:     { label: 'Planning',     keys: ['shootingDays','workplanOverrides','publicCallsheets'],                       tabs: ['planning'] },
          budget:       { label: 'Budget',       keys: ['budget','expenses'],                                                         tabs: ['expenses'] },
          crew:         { label: 'Équipe',       keys: ['crew','orgs'],                                                               tabs: ['crew','orgs'] },
          locations:    { label: 'Décors',       keys: ['locations'],                                                                 tabs: ['locs'] },
          resources:    { label: 'Ressources',   keys: ['resources'],                                                                 tabs: ['resources'] },
          storyboard:   { label: 'Storyboard',   keys: ['shots'],                                                                     tabs: ['storyboard'] },
          moodboard:    { label: 'Moodboard',    keys: ['moodboards'],                                                                tabs: ['moodboard'] },
          // v601 — LE SYNOPSIS N'A PLUS DE DOMAINE : il passe au verrou PAR
          // SECTION (SynopsisLock). Ses six textes sont six cles separees, et
          // la sauvegarde n'envoie que les cles modifiees : deux personnes sur
          // deux sections ne s'ecrasaient deja pas. Seul le verrou d'onglet les
          // empechait de travailler en meme temps — la productrice qui redigeait
          // sa note bloquait le realisateur sur la sienne. On garde le badge sur
          // l'onglet, il cesse seulement de VERROUILLER.
          // Les cles restent ecrites ici pour memoire : synopsis, synopsisShort,
          // synopsisLong, synopsisIntent, directorNote, producerNote.
          presentation: { label: 'Présentation', keys: ['presentation','titlePage','publicProjectData','isPublicProject'],           tabs: ['presentation','titlepage'] },
          // v601 — CONTRATS N'AVAIT AUCUN VERROU. Trouve en recensant les
          // dix-neuf onglets : tous avaient soit un verrou d'onglet, soit un
          // verrou fin, soit une bonne raison de n'en pas avoir (Statistiques
          // est en lecture seule). Celui-ci n'avait ni l'un ni l'autre, et pas
          // de raison : ses trois cles s'ecrivent comme les autres. Deux
          // personnes qui y travaillaient en meme temps s'ecrasaient, sans
          // badge et sans message. Un verrou d'onglet suffit — un contrat se
          // redige rarement a deux.
          contrats:     { label: 'Contrats',     keys: ['contracts','contractTemplates','contractTemplatesHidden'],                     tabs: ['contracts'] },
          comments:     { label: 'Commentaires', keys: ['comments'],                                                                  tabs: [] }
      },
      forTab: (tabName) => {
          for(const id in LockDomains.defs) {
              if(LockDomains.defs[id].tabs.includes(tabName)) return id;
          }
          return null;
      },
      // v570 — Libelle lisible d'un onglet, repris des sous-menus de navigation
      // (emoji retire : il ne sert a rien dans une phrase).
      tabLabel: (tabName) => {
          try {
              const cats = (typeof UICategories !== 'undefined' && UICategories.categoryLabels) || {};
              for(const c in cats) {
                  if(cats[c][tabName]) return cats[c][tabName].replace(/^[^\p{L}]+/u, '').trim();
              }
          } catch(e) {}
          return tabName;
      },
      // Les AUTRES onglets couverts par le meme verrou, en clair. Sert au bandeau :
      // sans cela, l'utilisateur voit le Depouillement verrouille alors que la
      // personne travaille dans le Scenario, sans comprendre le rapport.
      siblingLabels: (domain, exceptTab) => {
          const def = LockDomains.defs[domain];
          if(!def) return [];
          const serie = (state.currentProjectType === 'series');
          return def.tabs
              .filter(t => t !== exceptTab)
              .filter(t => serie || (t !== 'episodes' && t !== 'seasons'))
              .map(t => LockDomains.tabLabel(t));
      }
  };

  // LockManager — Phase 2 : verrous d'édition PAR DOMAINE (table project_locks, autorité serveur + temps réel).
const LockManager = {
      heartbeatTimer: null,
      pollTimer: null,
      currentDomain: null,
      pendingDomain: null,
      channel: null,
      ORDER: ['presentation','synopsis','board','titlepage','script','storyboard','chars','actors','locs','resources','crew','breakdown','stats','planning','expenses'],

      init: (projectId) => {
          if(window.location.protocol === 'file:') return;
          state.domainLocks = {};
          LockManager.currentDomain = null;
          LockManager.pendingDomain = null;
          LockManager.currentEditable = false; // v570 : recalcule a chaque onTabEnter
          // v569 : retrait de la réaffectation dataset.tab par position — chaque
          // .tab-btn porte déjà son data-tab correct depuis le HTML statique.
          LockManager.refresh(projectId);
          if(LockManager.channel) supabase.removeChannel(LockManager.channel);
          LockManager.channel = supabase
              .channel('dlocks_' + projectId)
              .on('postgres_changes', { event: '*', schema: 'public', table: 'project_locks', filter: 'project_id=eq.' + projectId }, () => {
                  LockManager.refresh(projectId);
              })
              // v601 — ON NE DEPEND PLUS DU SEUL EVENEMENT DE BASE. Celui-ci
              // annonce fidelement les PRISES de verrou (une ligne apparait),
              // mais les LIBERATIONS (une ligne disparait) voyagent mal : une
              // suppression n'emporte pas toujours de quoi reconnaitre le
              // projet concerne, et l'evenement est alors ecarte en silence.
              // Resultat vu a deux : la personne quitte une section, celle-ci
              // reste affichee comme prise chez les autres jusqu'a la relecture
              // periodique — vingt secondes a regarder un cadenas qui ment.
              // Chaque poste ANNONCE donc lui-meme ce qu'il prend et ce qu'il
              // rend, sur le meme canal. Quelques octets, et les autres relisent
              // aussitot. Le canal ne se renvoie pas ses propres messages.
              .on('broadcast', { event: 'verrous' }, () => { LockManager.refresh(projectId); })
              .subscribe();
          LockManager.lastActivity = Date.now();
          document.addEventListener('pointerdown', LockManager._activity, true);
          document.addEventListener('keydown', LockManager._activity, true);
          // v569 : aperçu au survol RETIRE (retour utilisateur) — la navigation se fait au clic uniquement.
          // _hoverIn / _hoverOut / _catPreview / _previewStart conserves mais plus branches.
          if(LockManager.heartbeatTimer) clearInterval(LockManager.heartbeatTimer);
          LockManager.heartbeatTimer = setInterval(LockManager._tick, 60000);
          // v601 — FILET : ON RELIT LES VERROUS, MEME SANS EVENEMENT.
          // L'abonnement ci-dessus etait le SEUL moyen d'apprendre qu'un verrou
          // avait bouge. Il a passe des mois a ne rien recevoir : la table
          // n'etait pas diffusee cote serveur (corrige le 21 septembre). Rien
          // ne s'en plaignait — l'abonnement reussissait, il arrivait juste
          // toujours vide, et chaque poste gardait la photo des verrous prise a
          // l'ouverture du projet. Un canal muet ne doit plus pouvoir figer
          // l'affichage : on relit la table toutes les vingt secondes. C'est
          // une poignee de lignes, le cout est negligeable devant le defaut.
          if(LockManager.pollTimer) clearInterval(LockManager.pollTimer);
          LockManager.pollTimer = setInterval(() => LockManager.refresh(projectId), 20000);
      },

      refresh: async (projectId) => {
          try {
              const { data, error } = await supabase.from('project_locks').select('*').eq('project_id', projectId);
              if(error) { console.warn('[LockManager] refresh:', error); return; }
              const map = {};
              const nowR = Date.now();
              (data || []).forEach(l => {
                  // Verrou expiré (heartbeat > 3 min, ex. page fermée) : on l'ignore ; l'éboueur SQL le supprimera.
                  if(l.heartbeat_at && (nowR - new Date(l.heartbeat_at).getTime()) > 180000) return;
                  map[l.lock_key] = l;
              });
              state.domainLocks = map;
              // Ping recu sur un de MES verrous : notifier (une seule fois par ping, et seulement s'il est frais)
              for(const k in map) {
                  const l = map[k];
                  if(!LockManager._mine(l) || !l.ping_at) continue;
                  const tp = new Date(l.ping_at).getTime();
                  if(Date.now() - tp > 45000) continue; // ping trop vieux (rechargement de page...)
                  if((LockManager._pingSeen[k]||0) >= tp) continue;
                  LockManager._pingSeen[k] = tp;
                  LockManager._pingToast(k, l.ping_by || 'Quelqu\'un');
              }
              LockManager.applyUI();
              const d = LockManager.currentDomain;
              // v601 : en veille, on ne reprend RIEN tout seul — sinon la
              // relecture periodique des verrous reprendrait la section dans
              // les vingt secondes, et la mise en veille n'aurait servi a rien.
              if(d && LockManager.currentEditable && !map[d] && !LockManager._yieldedRecently(d) && !LockManager.enVeille) LockManager.acquire(d);
          } catch(e) { console.warn('[LockManager] Échec du poll des verrous:', e && e.message); }
      },

      // « Je viens de prendre ou de rendre quelque chose » — a appeler apres
      // toute prise ou liberation, fine ou de domaine. Sans effet si le canal
      // n'est pas encore ouvert : la relecture periodique reste le filet.
      signaler: () => {
          try { if(LockManager.channel) LockManager.channel.send({ type: 'broadcast', event: 'verrous', payload: {} }); }
          catch(e) { /* confort : le filet periodique passera */ }
      },

      _uid: () => (state.currentUser && (state.currentUser.uid || state.currentUser.id)) || null,
      _mine: (lock) => !!(lock && lock.holder_uid && lock.holder_uid === LockManager._uid()),
      _who: (lock) => (lock && (lock.holder_name || (lock.holder_email||'').split('@')[0])) || '?',

      held: {},
      winDomains: {},   // domaines pris par MES fenetres flottantes (interrupteur Modification)
      lastActivity: 0,
      _activity: () => {
          LockManager.lastActivity = Date.now();
          if(LockManager.enVeille) LockManager._reveiller();
      },

      // ==================================================================
      //  INACTIVITE : ON MET EN VEILLE, ON N'EJECTE PLUS (v601)
      // ==================================================================
      //  Avant : trois minutes sans rien toucher renvoyaient au tableau de
      //  bord. Le but etait bon — ne pas laisser quelqu'un bloquer une section
      //  pendant qu'il est parti boire un cafe — mais le remede etait brutal :
      //  on perdait sa page, son onglet, l'endroit ou l'on en etait.
      //  Maintenant : on RESTE dans le projet, on rend seulement ce qu'on
      //  tenait. Le curseur sort de la zone, les verrous tombent, et c'est le
      //  clic suivant qui les reprend.
      //  POURQUOI SORTIR LE CURSEUR ET PAS SEULEMENT LACHER LES VERROUS : ce
      //  sont les verrous fins qui suivent le curseur. Le laisser dans la scene
      //  le ferait reprendre dans la foulee, et on n'aurait rien lache du tout.
      enVeille: false,

      _endormir: async () => {
          LockManager.enVeille = true;
          try {
              const a = document.activeElement;
              if(a && a.blur && a !== document.body) a.blur();
              const sel = document.getSelection();
              if(sel && sel.removeAllRanges) sel.removeAllRanges();
          } catch(e) {}
          try { if(typeof VerrouFin !== 'undefined') VerrouFin.libererTout(); } catch(e) {}
          const d = LockManager.currentDomain;
          if(d) { try { await LockManager.release(d); } catch(e) {} }
          LockManager.applyUI();
      },

      // Le premier clic ou la premiere touche reprend la main. Sans cela on
      // resterait en lecture seule sans comprendre pourquoi.
      _reveiller: () => {
          if(!LockManager.enVeille) return;
          LockManager.enVeille = false;
          const d = LockManager.currentDomain;
          if(d && LockManager.currentEditable && !LockManager.isAlone()) LockManager.acquire(d);
          LockManager.applyUI();
      },
      previewTimer: null,
      previewTab: null,
      previewPrev: null,
      previewMode: false,
      catPreviewTimer: null,
      catRestoreTimer: null,
      catPreviewCat: null,

      // Suis-je seul(e) connecté(e) sur ce projet ? (présence Realtime ; en cas de doute → verrous actifs)
      isAlone: () => {
          try {
              // Un verrou tenu par quelqu'un d'autre = quelqu'un travaille → pas seul (même si la présence est en retard)
              const locks = state.domainLocks || {};
              const nowA = Date.now();
              for(const k in locks) {
                  const l = locks[k];
                  if(!l || LockManager._mine(l)) continue;
                  if(l.heartbeat_at && (nowA - new Date(l.heartbeat_at).getTime()) > 180000) continue; // expiré
                  return false;
              }
              const rows = (state.dbPresence || []).filter(r => r.project_id === state.currentProjectId);
              const emails = new Set(rows.map(r => (r.user_email || '').toLowerCase()));
              emails.add(((state.currentUser && state.currentUser.email) || '').toLowerCase());
              return emails.size <= 1;
          } catch(e) { return false; }
      },

      // La présence a changé : quelqu'un arrive → je réclame mon onglet courant ; et on rafraîchit l'UI.
      onPresenceChange: () => {
          const d = LockManager.currentDomain;
          if(!LockManager.isAlone() && d && LockManager.currentEditable && !LockManager.enVeille
             && !LockManager._mine((state.domainLocks||{})[d]) && !LockManager.held[d]
             && !LockManager._yieldedRecently(d)) {
              LockManager.acquire(d);
          }
          LockManager.applyUI();
      },

      _hoverIn: (e) => {
          if(!state.currentProjectId) return;
          const t = e.target;
          if(!t || !t.closest) return;
          // Survol d'une catégorie : dérouler son sous-bandeau (sans naviguer)
          const catBtn = t.closest('.tab-category[data-category]');
          if(catBtn) {
              clearTimeout(LockManager.catRestoreTimer);
              const cat = catBtn.dataset.category;
              clearTimeout(LockManager.catPreviewTimer);
              LockManager.catPreviewTimer = setTimeout(() => LockManager._catPreview(cat), 300);
              return;
          }
          // Souris dans le sous-bandeau : on garde le déroulé affiché
          if(t.closest('#tabsSubnav')) clearTimeout(LockManager.catRestoreTimer);
          const btn = t.closest('.tab-subbtn[data-tab], .tab-btn[data-tab]');
          if(!btn) return;
          const tab = btn.dataset.tab;
          const active = document.querySelector('.tab-content.active');
          const curTab = active ? active.id.replace('tab-','') : null;
          if(!tab || tab === curTab || tab === LockManager.previewTab) return;
          clearTimeout(LockManager.previewTimer);
          LockManager.previewTimer = setTimeout(() => LockManager._previewStart(tab), 450);
      },

      _hoverOut: (e) => {
          const t = e.target;
          if(!t || !t.closest) return;
          // Sortie de la zone navigation (catégories + sous-bandeau) : restaurer le déroulé d'origine
          const catBtn = t.closest('.tab-category[data-category]');
          const inSubnav = t.closest('#tabsSubnav');
          if(catBtn || inSubnav) {
              const to = e.relatedTarget;
              const stays = to && to.closest && (to.closest('.tab-category[data-category]') || to.closest('#tabsSubnav'));
              if(!stays) {
                  clearTimeout(LockManager.catPreviewTimer);
                  clearTimeout(LockManager.catRestoreTimer);
                  LockManager.catRestoreTimer = setTimeout(() => LockManager._catPreviewEnd(), 350);
              }
              if(catBtn) return;
          }
          const btn = t.closest('.tab-subbtn[data-tab], .tab-btn[data-tab]');
          if(!btn) return;
          const to = e.relatedTarget;
          if(to && btn.contains(to)) return;
          clearTimeout(LockManager.previewTimer);
          LockManager._previewEnd();
      },

      // Rendu du sous-bandeau d'une catégorie (sans navigation, sans verrous)
      _renderSubnav: (category, activeTab) => {
          const subnav = document.getElementById('tabsSubnav');
          if(!subnav || !UI.categoryTabs) return;
          const tabs = UI.categoryTabs[category] || [];
          const labels = UI.categoryLabels[category] || {};
          let visibleTabs = tabs.filter(t => !(UI.hiddenTabs || []).includes(t));
          visibleTabs = visibleTabs.filter(t => (typeof Permissions === 'undefined') || Permissions.tabVisible(t)); // v570 : ❌ = invisible
          if(state.currentProjectType !== 'series') visibleTabs = visibleTabs.filter(t => t !== 'episodes' && t !== 'seasons');
          subnav.innerHTML = visibleTabs.map(tab => `<button class="tab-subbtn${tab === activeTab ? ' active' : ''}" data-tab="${tab}" onclick="app.UI.switchTab('${tab}')">${labels[tab] || tab}</button>`).join('');
          subnav.dataset.category = category;
      },

      _catPreview: (cat) => {
          if(!state.currentProjectId || !cat) return;
          const subnav = document.getElementById('tabsSubnav');
          if(!subnav || subnav.dataset.category === cat) return;
          LockManager.catPreviewCat = cat;
          LockManager._renderSubnav(cat, null);
          subnav.classList.add('force-visible');
          LockManager.applyUI();
      },

      _catPreviewEnd: () => {
          if(!LockManager.catPreviewCat) return;
          if(LockManager.previewTab) return; // un aperçu d'onglet pilote déjà la navigation
          LockManager.catPreviewCat = null;
          const cur = UI.currentCategory || (typeof UICategories !== 'undefined' && UICategories.currentCategory) || 'ecriture';
          const active = document.querySelector('.tab-content.active');
          LockManager._renderSubnav(cur, active ? active.id.replace('tab-','') : null);
          const subnav = document.getElementById('tabsSubnav');
          if(subnav) subnav.classList.remove('force-visible');
          LockManager.applyUI();
      },

      // Aperçu au survol : vrai rendu via switchTab (le contenu se construit), mais SANS toucher aux verrous.
      _previewStart: (tab) => {
          const active = document.querySelector('.tab-content.active');
          const curTab = active ? active.id.replace('tab-','') : null;
          if(!curTab || curTab === tab) return;
          LockManager.previewPrev = curTab;
          LockManager.catPreviewCat = null;
          clearTimeout(LockManager.catRestoreTimer);
          LockManager.previewMode = true;
          try { UI.switchTab(tab); } catch(e) {}
          LockManager.previewMode = false;
          if(LockManager.previewTab !== tab) { LockManager.previewPrev = null; return; } // aperçu refusé (permissions...)
          const target = document.getElementById('tab-' + tab);
          if(target) {
              target.classList.add('dlock-preview');
              const b = document.createElement('div');
              b.className = 'dlock-banner dlock-preview-banner';
              b.innerHTML = "👁 Aperçu — cliquez sur l'onglet pour y travailler.";
              target.prepend(b);
          }
      },

      _previewEnd: (noRestore) => {
          clearTimeout(LockManager.previewTimer);
          if(!LockManager.previewTab) return;
          const tab = LockManager.previewTab;
          const prev = LockManager.previewPrev;
          LockManager.previewTab = null;
          LockManager.previewPrev = null;
          const target = document.getElementById('tab-' + tab);
          if(target) {
              target.classList.remove('dlock-preview');
              const b = target.querySelector('.dlock-preview-banner');
              if(b) b.remove();
          }
          if(!noRestore && prev) {
              try { UI.switchTab(prev); } catch(e) {}
          }
      },

      _editable: (domain) => {
          if(!domain || !LockDomains.defs[domain] || LockDomains.defs[domain].tabs.length === 0) return true;
          if(LockManager.isAlone()) return true; // seul(e) sur le projet : pas de verrous
          let lock = (state.domainLocks||{})[domain];
          if(lock && !LockManager._mine(lock) && lock.heartbeat_at && (Date.now() - new Date(lock.heartbeat_at).getTime()) > 180000) lock = null; // expiré
          if(lock) return LockManager._mine(lock);
          return !!LockManager.held[domain]; // verrou acquis, ligne momentanément invisible
      },

      acquire: async (domain) => {
          if(!domain || !state.currentProjectId || !state.currentUser || state.currentRole === 'viewer') return false;
          LockManager.pendingDomain = domain;
          LockManager.applyUI();
          try {
              const { data, error } = await supabase.rpc('lock_acquire', {
                  p_id: state.currentProjectId, p_key: domain,
                  p_uid: LockManager._uid(), p_name: (state.currentUser.email||'').split('@')[0]
              });
              LockManager.pendingDomain = null;
              if(error) { console.warn('[Lock] acquire erreur', domain, error.message); LockManager.applyUI(); return false; }
              let lock = data;
              if(Array.isArray(lock)) lock = lock[0] || null;
              state.domainLocks = state.domainLocks || {};
              if(lock) state.domainLocks[domain] = lock;
              const got = LockManager._mine(lock);
              if(got) { LockManager.held[domain] = true; LockManager.signaler(); }
              if(LockManager.currentDomain !== domain && !LockManager.winDomains[domain] && got) { LockManager.release(domain); return false; }
              LockManager.applyUI();
              return got;
          } catch(e) { LockManager.pendingDomain = null; LockManager.applyUI(); return false; }
      },

      release: async (domain) => {
          if(!domain || !state.currentProjectId || !state.currentUser) return;
          const cur = (state.domainLocks||{})[domain];
          if(!LockManager._mine(cur) && !LockManager.held[domain]) return;
          delete LockManager.held[domain];
          try { await supabase.rpc('lock_release', { p_id: state.currentProjectId, p_key: domain, p_uid: LockManager._uid() }); } catch(e) { console.warn('[LockManager] lock_release échoué (' + domain + '), le verrou expirera par TTL:', e && e.message); }
          if(state.domainLocks) delete state.domainLocks[domain];
          LockManager.signaler();
          LockManager.applyUI();
      },

      // ——— Ping « demander la main » ———
      _pingSent: {},   // domaine -> dernier ping envoyé (throttle 30 s)
      _pingSeen: {},   // domaine -> dernier ping déjà notifié (côté détenteur)
      yielded: {},     // domaine -> libération volontaire (pas de re-acquisition auto pendant 2 min)

      _yieldedRecently: (domain) => ((Date.now() - ((LockManager.yielded||{})[domain] || 0)) < 120000),

      ping: async (domain, who) => {
          if(!domain || !state.currentProjectId || !state.currentUser) return;
          const last = LockManager._pingSent[domain] || 0;
          if(Date.now() - last < 30000) { Utils.toast('Demande déjà envoyée — laissez-lui un instant.', 'info'); return; }
          LockManager._pingSent[domain] = Date.now();
          try {
              const { error } = await supabase.rpc('lock_ping', {
                  p_id: state.currentProjectId, p_key: domain,
                  p_name: (state.currentUser.email||'').split('@')[0]
              });
              if(error) { console.warn('[Lock] ping erreur', domain, error.message); Utils.toast('Demande impossible pour le moment.', 'error'); return; }
              Utils.toast('Demande envoyée à ' + (who || 'la personne') + '.', 'success');
          } catch(e) { Utils.toast('Demande impossible pour le moment.', 'error'); }
      },

      // Toast côté détenteur : « X aimerait travailler ici » + bouton Libérer
      _pingToast: (domain, who) => {
          const container = document.getElementById('toast-container');
          if(!container) return;
          const old = container.querySelector('.dlock-ping-toast'); if(old) old.remove();
          const t = document.createElement('div');
          t.className = 'toast warning dlock-ping-toast';
          const icon = document.createElement('span'); icon.className = 'toast-icon'; icon.textContent = '✋';
          const msg = document.createElement('span'); msg.className = 'toast-message';
          msg.textContent = who + ' aimerait travailler sur cette section.';
          const btn = document.createElement('button');
          btn.textContent = 'Libérer';
          btn.style.cssText = 'margin-left:8px;padding:4px 10px;border:none;border-radius:6px;background:#d97706;color:#fff;cursor:pointer;font-size:12px;flex-shrink:0;';
          btn.onclick = () => { t.remove(); LockManager.yieldDomain(domain); };
          const close = document.createElement('button');
          close.className = 'toast-close'; close.textContent = '✖';
          close.onclick = () => t.remove();
          t.appendChild(icon); t.appendChild(msg); t.appendChild(btn); t.appendChild(close);
          container.appendChild(t);
          setTimeout(() => { if(t.parentElement) t.remove(); }, 20000);
      },

      // Libération volontaire : sauvegarde, relâche le verrou, sans le reprendre automatiquement (2 min).
      yieldDomain: async (domain) => {
          if(!domain) return;
          LockManager.yielded[domain] = Date.now();
          try { await StoreSave.save(); } catch(e) { console.warn('[LockManager] Sauvegarde avant cession du domaine échouée:', e && e.message); }
          await LockManager.release(domain);
          Utils.toast('Section libérée — recliquez sur l\'onglet pour reprendre la main.', 'info', 5000);
      },

      onTabEnter: (tabName) => {
          if(LockManager.previewMode) { LockManager.previewTab = tabName; return; }
          LockManager.fromCategory = !!LockManager._viaCategory; // conservé pour info ; ne conditionne plus le bouton (v570)
          LockManager._viaCategory = false;
          LockManager._previewEnd(true);
          const newDomain = LockDomains.forTab(tabName);
          if(LockManager.currentDomain && LockManager.currentDomain !== newDomain) {
              LockManager.release(LockManager.currentDomain);
          }
          LockManager.currentDomain = newDomain;
          if(newDomain) delete LockManager.yielded[newDomain]; // clic volontaire : reprise possible
          // v570 : le verrou suit la PERMISSION DE L'ONGLET, plus seulement le role.
          // Depuis que le role se deduit des cases, une seule ✏️ suffit a rendre quelqu'un
          // editeur ; sans ce test il verrouillerait aussi les onglets qu'il ne fait que
          // CONSULTER (👁️), et bloquerait les autres pour rien. Regarder ne gene personne.
          LockManager.currentEditable = (typeof Permissions === 'undefined') ? (state.currentRole !== 'viewer') : Permissions.tabWritable(tabName);
          LockManager.applyUI();
          if(newDomain && LockManager.currentEditable && !LockManager.isAlone()) LockManager.acquire(newDomain);
      },

      applyUI: () => {
          try { if(typeof WindowManager !== 'undefined' && WindowManager.wins) WindowManager._arbitrate(); } catch(_) {}
          // v601 : les verrous PAR SCENE se redessinent au meme rythme que ceux
          // de domaine — meme source (state.domainLocks), meme rafraichissement.
          try { if(typeof VerrouFin !== 'undefined') VerrouFin.marquerTout(); } catch(_) {}
          // Seul(e) sur le projet : aucun verrou affiché, tout reste éditable
          if(LockManager.isAlone()) {
              document.querySelectorAll('.dlock-avatar-tab, .dlock-badge, .dlock-banner, .dlock-watcher').forEach(el => el.remove());
              document.querySelectorAll('.dlock-occupied').forEach(el => el.classList.remove('dlock-occupied'));
              const act = document.querySelector('.tab-content.active');
              if(act) act.classList.remove('is-domain-locked');
              return;
          }
          const lockFor = (tabName) => {
              const d = LockDomains.forTab(tabName);
              const lock = d ? (state.domainLocks||{})[d] : null;
              if(!lock || LockManager._mine(lock)) return null;
              if(lock.heartbeat_at && (Date.now() - new Date(lock.heartbeat_at).getTime()) > 180000) return null; // expiré
              return lock;
          };
          const markBtn = (btn, lock) => {
              const oldA = btn.querySelector('.dlock-avatar-tab'); if(oldA) oldA.remove();
              const oldB = btn.querySelector('.dlock-badge'); if(oldB) oldB.remove();
              btn.classList.toggle('dlock-occupied', !!lock);
              if(lock) {
                  const who = LockManager._who(lock);
                  const av = document.createElement('span');
                  av.className = 'dlock-avatar-tab';
                  // v570 : MEME couleur que l'avatar de presence en haut de page —
                  // Utils.getColor sur l'ADRESSE, jamais sur le nom : deux comptes
                  // peuvent porter le meme nom (cas reel : deux « Guillaume Adrien »).
                  const em = (lock.holder_email || '').toLowerCase();
                  if(em) av.style.background = Utils.getColor(em);
                  const dom = LockDomains.forTab(btn.dataset.tab);
                  const grp = (dom && LockDomains.defs[dom]) ? LockDomains.defs[dom].label : '';
                  av.title = '🚧 En travaux — ' + who + (grp ? ' (section « ' + grp + ' »)' : '');
                  av.textContent = (who[0]||'?').toUpperCase();
                  btn.appendChild(av);
              }
          };
          // sous-onglets (mode catégories) + onglets plats
          document.querySelectorAll('.tab-subbtn[data-tab], .tab-btn[data-tab]').forEach(btn => markBtn(btn, lockFor(btn.dataset.tab)));
          // v601 — LE BADGE D'ONGLET RESTE, IL CESSE SEULEMENT DE VERROUILLER.
          // Scenario, Sequencier et Depouillement n'ont plus de domaine : ils ne
          // se bloquent donc plus. Mais savoir que quelqu'un ecrit LA reste utile
          // — on continue de l'annoncer, sans empecher personne d'entrer.
          try {
              // Chaque onglet sans domaine dit ce qui s'y passe, via la famille
              // de verrous fins qui le couvre.
              const familles = {
                  script:    (typeof SceneLock !== 'undefined') ? SceneLock : null,
                  breakdown: (typeof SceneLock !== 'undefined') ? SceneLock : null,
                  board:     (typeof SceneLock !== 'undefined') ? SceneLock : null,
                  synopsis:  (typeof SynopsisLock !== 'undefined') ? SynopsisLock : null,
                  chars:     (typeof FicheLock !== 'undefined') ? FicheLock : null,
                  actors:    (typeof FicheLock !== 'undefined') ? FicheLock : null
              };
              document.querySelectorAll('.tab-subbtn[data-tab], .tab-btn[data-tab]').forEach(btn => {
                  const famille = familles[btn.dataset.tab];
                  if(!famille) return;
                  const tenues = famille.tous();
                  const autres = Object.keys(tenues).filter(id => !LockManager._mine(tenues[id]));
                  const vieux = btn.querySelector('.dlock-avatar-scene');
                  if(vieux) vieux.remove();
                  if(!autres.length) return;
                  const l = tenues[autres[0]];
                  const av = document.createElement('span');
                  av.className = 'dlock-avatar-tab dlock-avatar-scene';
                  const em = (l.holder_email || '').toLowerCase();
                  if(em) av.style.background = Utils.getColor(em);
                  av.textContent = autres.length > 1 ? String(autres.length) : (LockManager._who(l)[0] || '?').toUpperCase();
                  const quoi = { synopsis: 'section', chars: 'fiche', actors: 'fiche' }[btn.dataset.tab] || 'scène';
                  av.title = autres.length > 1
                      ? ('✍️ ' + autres.length + ' ' + quoi + 's en cours d\'écriture — les autres restent ouvertes')
                      : ('✍️ ' + LockManager._who(l) + ' écrit une ' + quoi + ' — les autres restent ouvertes');
                  btn.appendChild(av);
              });
          } catch(e) { console.warn('[Lock] badge de scene :', e && e.message); }
          // Spectateurs : badge gris pour chaque personne qui REGARDE le domaine (sans le modifier)
          document.querySelectorAll('.dlock-watcher').forEach(el => el.remove());
          const myEm = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
          const watchersFor = (tabName) => {
              const d = LockDomains.forTab(tabName);
              if(!d) return [];
              const lock = (state.domainLocks||{})[d];
              const holder = lock ? (LockManager._who(lock) || '') : '';
              const seen = {};
              return (state.dbPresence || []).filter(r => {
                  if(r.project_id !== state.currentProjectId) return false;
                  const em = (r.user_email || '').toLowerCase();
                  if(!em || em === myEm) return false;
                  if(!Array.isArray(r.watching) || r.watching.indexOf(d) === -1) return false;
                  if(holder && em.split('@')[0] === holder) return false; // le detenteur n'est pas un spectateur
                  if(seen[em]) return false;
                  seen[em] = true;
                  return true;
              });
          };
          document.querySelectorAll('.tab-subbtn[data-tab], .tab-btn[data-tab]').forEach(btn => {
              const ws = watchersFor(btn.dataset.tab);
              if(!ws.length) return;
              btn.classList.add('dlock-occupied');
              ws.slice(0, 4).forEach((r, i) => {
                  const av = document.createElement('span');
                  av.className = 'dlock-watcher';
                  av.style.setProperty('--c', (11 + i * 5) + 'px');
                  av.style.setProperty('--s', (37 + i * 18) + 'px');
                  // v570 : couleur de la personne, identique a son avatar de presence.
                  // C'est l'OPACITE qui distingue « regarde » de « ecrit », plus la teinte.
                  const em = (r.user_email || '').toLowerCase();
                  if(em) av.style.background = Utils.getColor(em);
                  av.textContent = ((r.user_email || '?').charAt(0)).toUpperCase();
                  av.title = '👁 Regarde — ' + (r.user_email || '').split('@')[0];
                  btn.appendChild(av);
              });
          });
          // v570 — PASTILLE SUR LES BOUTONS DE CATEGORIE. Auparavant on les nettoyait
          // volontairement (« trop charge »), choix pris a l'epoque ou le bandeau plat
          // #tabsNav servait de filet. Depuis le retrait du mode Classique il est
          // masque : sans pastille de categorie, on ne peut voir qui travaille ou QUE
          // si l'on se trouve deja dans la meme categorie que la personne. Trou reel.
          document.querySelectorAll('.tab-category .dlock-avatar-tab, .tab-category .dlock-badge, .tab-category .dlock-watcher').forEach(el => el.remove());
          document.querySelectorAll('.tab-category.dlock-occupied').forEach(el => el.classList.remove('dlock-occupied'));
          const catOccupants = (cat) => {
              const tabs = ((typeof UI !== 'undefined' && UI.categoryTabs) ? UI.categoryTabs[cat] : null) || [];
              const out = [];
              const vus = {};
              tabs.forEach(t => {
                  if((UI.hiddenTabs || []).includes(t)) return;
                  if(state.currentProjectType !== 'series' && (t === 'episodes' || t === 'seasons')) return;
                  const l = lockFor(t);
                  if(l) {
                      const q = LockManager._who(l);
                      const e2 = (l.holder_email || '').toLowerCase();
                      if(!vus[q + '|' + t]) { vus[q + '|' + t] = 1; out.push({ qui: q, mail: e2, tab: t, ecrit: true }); }
                  }
                  watchersFor(t).forEach(r => {
                      const q = (r.user_email || '').split('@')[0];
                      const e2 = (r.user_email || '').toLowerCase();
                      if(!vus[q + '|' + t]) { vus[q + '|' + t] = 1; out.push({ qui: q, mail: e2, tab: t, ecrit: false }); }
                  });
              });
              return out;
          };
          document.querySelectorAll('.tab-category[data-category]').forEach(btn => {
              const occ = catOccupants(btn.dataset.category);
              if(!occ.length) return;
              btn.classList.add('dlock-occupied');
              const ecrivains = occ.filter(o => o.ecrit);
              const vedette = ecrivains[0] || occ[0];
              const av = document.createElement('span');
              av.className = 'dlock-avatar-tab';
              // v570 : couleur de la personne mise en avant (celle qui ecrit en priorite),
              // identique a son avatar de presence en haut de page.
              if(vedette.mail) av.style.background = Utils.getColor(vedette.mail);
              if(!ecrivains.length) av.classList.add('dlock-watching'); // personne n'ecrit : plus discret
              av.textContent = (vedette.qui[0] || '?').toUpperCase() + (occ.length > 1 ? '+' : '');
              av.title = occ.map(o => (o.ecrit ? '🚧 ' : '👁 ') + o.qui + ' — ' + LockDomains.tabLabel(o.tab)).join('\n');
              btn.appendChild(av);
          });
          // lecture seule + bandeau de l'onglet actif
          if(LockManager.previewTab) return; // un aperçu est affiché : ne pas interférer
          const active = document.querySelector('.tab-content.active');
          if(!active) return;
          const tabName = active.id.replace('tab-','');
          const d = LockDomains.forTab(tabName);
          const oldBan = active.querySelector('.dlock-banner');
          if(oldBan) oldBan.remove();
          // v570 : sur un onglet que je n'ai le droit que de CONSULTER (👁️), le bandeau
          // de verrou n'a aucun sens — je ne pourrais pas modifier de toute facon, et il
          // laisserait croire que quelqu'un m'en empeche. La lecture seule y est deja
          // assuree par les permissions.
          if(!LockManager.currentEditable) { active.classList.remove('is-domain-locked'); return; }
          const editable = LockManager._editable(d);
          active.classList.toggle('is-domain-locked', !editable);
          if(!editable) {
              const lock = d ? (state.domainLocks||{})[d] : null;
              const banner = document.createElement('div');
              banner.className = 'dlock-banner';
              if(lock && !LockManager._mine(lock)) {
                  const who = LockManager._who(lock);
                  banner.innerHTML = '🚧 En travaux par <strong></strong> — lecture seule. ';
                  banner.querySelector('strong').textContent = who;
                  // v570 : le bouton s'affiche desormais MEME si l'on est arrive par un
                  // clic sur la categorie (qui ouvre le premier onglet automatiquement).
                  // La reserve d'origine n'avait de sens que tant que l'onglet restait a
                  // moitie cliquable ; depuis qu'il est entierement bloque, on serait
                  // coince sans aucun recours.
                  if(LockManager.currentEditable) {
                      const askBtn = document.createElement('button');
                      askBtn.textContent = '✋ Demander la main';
                      askBtn.style.cssText = 'margin-left:6px;padding:3px 10px;border:1px solid rgba(217,119,6,.45);border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px;';
                      askBtn.onclick = () => LockManager.ping(d, who);
                      banner.appendChild(askBtn);
                  }
                  // v570 : dire QUELS onglets partagent ce verrou. Sans cela on voit le
                  // Depouillement bloque alors que la personne est dans le Scenario, sans
                  // comprendre le rapport — les onglets qui ecrivent les memes donnees
                  // sont forcement verrouilles ensemble, sinon l'un ecraserait l'autre.
                  const sibs = LockDomains.siblingLabels(d, tabName);
                  if(sibs.length) {
                      const note = document.createElement('div');
                      note.style.cssText = 'margin-top:4px;font-size:11px;opacity:.8;';
                      note.textContent = 'Ces onglets écrivent les mêmes données et sont donc pris ensemble : '
                          + sibs.join(', ') + '.';
                      banner.appendChild(note);
                  }
              } else if(LockManager._yieldedRecently(d)) {
                  banner.innerHTML = '✋ Vous avez libéré cette section — recliquez sur l\'onglet pour reprendre la main.';
              } else {
                  banner.innerHTML = '🔒 Verrouillage en cours…';
              }
              active.prepend(banner);
          }
      },

      _tick: async () => {
          // Filet de sécurité : réévaluer présence/verrous même si un événement s'est perdu
          try { LockManager.onPresenceChange(); } catch(e) {}
          // v570 : et relire nos droits — « Peut inviter » et un changement de rôle
          // s'écrivent dans project_members SANS sauvegarde du projet, donc sans
          // événement temps réel côté projet.
          try { if(typeof Permissions !== 'undefined') Permissions.refreshLive(); } catch(e) {}
          try { if(state._renderPresenceNow) state._renderPresenceNow(); } catch(e) {}
          try { if(typeof GlobalPresence !== 'undefined') GlobalPresence.renderBadges(); } catch(e) {}
          // Exclusion après 3 min d'inactivité : UNIQUEMENT dans l'éditeur d'un projet ET à plusieurs réellement connectés.
          // Solo (personne d'autre présent) ou hors éditeur (dashboard, Mon Profil, Univers, Forum…) : aucune éjection.
          const _ejInEditor = els.appView && els.appView.style.display !== 'none';
          const _ejMyEmail = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
          const _ejOthers = (state.dbPresence || []).some(r => r.project_id === state.currentProjectId && (r.user_email || '').toLowerCase() !== _ejMyEmail);
          if(state.currentProjectId && _ejInEditor && _ejOthers && !LockManager.enVeille && LockManager.lastActivity
             && (Date.now() - LockManager.lastActivity > 180000)) {
              LockManager.lastActivity = Date.now();
              // On enregistre AVANT de lacher : c'est ce que faisait l'ejection,
              // et c'est la seule partie qu'il ne fallait surtout pas perdre.
              try { await StoreSave.save(); } catch(e) { console.warn('[LockManager] Sauvegarde avant mise en veille échouée:', e && e.message); }
              await LockManager._endormir();
              Utils.toast('Inactif depuis 3 min : vos sections sont libérées pour les autres (travail enregistré). Cliquez pour reprendre la main.', 'info', 8000);
              return;
          }
          // v601 : les verrous de SCENE battent au meme rythme que les domaines.
          try { if(typeof VerrouFin !== 'undefined') await VerrouFin.battreTout(); } catch(e) {}
          const doms = {};
          if(LockManager.currentDomain) doms[LockManager.currentDomain] = true;
          Object.keys(LockManager.winDomains || {}).forEach(d => { doms[d] = true; });
          for(const dom in doms) {
              if(LockManager._mine((state.domainLocks||{})[dom])) {
                  try { await supabase.rpc('lock_heartbeat', { p_id: state.currentProjectId, p_key: dom, p_uid: LockManager._uid() }); } catch(e) {}
              }
          }
      },

      cleanup: async () => {
          LockManager._previewEnd(true);
          clearTimeout(LockManager.catPreviewTimer);
          clearTimeout(LockManager.catRestoreTimer);
          LockManager.catPreviewCat = null;
          document.removeEventListener('pointerdown', LockManager._activity, true);
          document.removeEventListener('keydown', LockManager._activity, true);
          document.removeEventListener('mouseover', LockManager._hoverIn, true);
          document.removeEventListener('mouseout', LockManager._hoverOut, true);
          if(LockManager.heartbeatTimer) { clearInterval(LockManager.heartbeatTimer); LockManager.heartbeatTimer = null; }
          if(LockManager.pollTimer) { clearInterval(LockManager.pollTimer); LockManager.pollTimer = null; }
          const mineSet = new Set(Object.keys(LockManager.held||{}));
          Object.keys(state.domainLocks||{}).forEach(k => { if(LockManager._mine(state.domainLocks[k])) mineSet.add(k); });
          for(const k of mineSet) {
              try { await supabase.rpc('lock_release', { p_id: state.currentProjectId, p_key: k, p_uid: LockManager._uid() }); } catch(e) { console.warn('[LockManager] lock_release au démontage échoué (' + k + '):', e && e.message); }
          }
          LockManager.held = {};
          LockManager._pingSent = {}; LockManager._pingSeen = {}; LockManager.yielded = {};
          if(LockManager.channel) { supabase.removeChannel(LockManager.channel); LockManager.channel = null; }
          state.domainLocks = {};
          LockManager.currentDomain = null;
          LockManager.pendingDomain = null;
      }
  };

  // DBPresence — présence par base de données (heartbeat) : fiable même si Realtime Presence est muet.