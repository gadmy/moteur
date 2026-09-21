
  // ==========================================================================
  //  VERROUS FINS : LE MECANISME COMMUN (v601)
  // ==========================================================================
  //  Un verrou de DOMAINE bloque un onglet entier : une personne ecrit, tout le
  //  monde regarde. Un verrou FIN descend au morceau de travail reel — une
  //  scene, une section du synopsis — pour qu'on puisse etre plusieurs sur le
  //  meme onglet sans se marcher dessus.
  //
  //  POURQUOI UN MECANISME COMMUN, ET PAS UNE COPIE PAR FAMILLE. Les scenes ont
  //  ouvert la voie ; le synopsis a suivi trois jours plus tard, avec
  //  exactement les memes besoins. Une deuxieme copie, c'est deux endroits a
  //  corriger le jour ou l'on trouve un defaut — et dans ce chantier-la on en a
  //  trouve quatre. Tout ce qui est commun vit donc ICI, une fois. Une famille
  //  n'apporte que ce qui lui est propre : ou sont ses zones, comment on lit
  //  leur identifiant.
  //
  //  AUCUNE PIECE SERVEUR PAR FAMILLE. La table project_locks a une colonne
  //  lock_key en TEXTE LIBRE, et lock_acquire arbitre n'importe quelle clef avec
  //  la meme autorite (premier arrive, expiration a 3 minutes sans battement).
  //  Une famille se distingue par son PREFIXE : « scene:12 », « synopsis:short ».
  const VerrouFin = {
      _liste: [],
      _inited: false,
      _minuteur: null,
      DELAI: 250,          // calme avant de regarder ou est le curseur
      DELAI_SORTIE: 20000, // calme avant de rendre la main en partant
      EXPIRATION: 180000,  // 3 minutes sans battement = poste ferme
      // Les LISTES DE CHOIX (export, partage, impression) peuvent porter les
      // memes identifiants, pour cocher quoi inclure. Y poser un verrou serait
      // faux : choisir une scene dans un export ne la modifie pas.
      HORS_JEU: '.modal, .modal-overlay, .confirm-modal-overlay, .fb-ov, .tour-panel-ov, [id*="export"], [id*="chooser"], [class*="chooser"]',

      // ------------------------------------------------------------------
      //  CREATION D'UNE FAMILLE
      // ------------------------------------------------------------------
      //  prefixe       : 'scene:' — ce qui distingue les clefs de cette famille.
      //  zones         : ou la famille s'affiche (on y pose la marque).
      //  zonesEcriture : ou l'on ECRIT (y poser le curseur prend le verrou).
      //                  Les listes et les cartes n'en sont pas : les parcourir,
      //                  c'est lire.
      //  idDe          : comment lire l'identifiant sur un element de zone.
      //  nom           : pour les messages de la console.
      creer: (config) => {
          const V = {
              PREFIXE: config.prefixe,
              ZONES: config.zones,
              ZONES_ECRITURE: config.zonesEcriture || config.zones,
              NOM: config.nom || config.prefixe,
              _idDe: config.idDe,
              _enCours: {},
              _minuteurSortie: null,

              clef: (id) => V.PREFIXE + String(id || ''),

              // Tout ce que cette famille tient, MOI COMPRIS : { id -> verrou }.
              // On repart de state.domainLocks, que LockManager tient a jour.
              tous: () => {
                  const out = {};
                  const locks = state.domainLocks || {};
                  const maintenant = Date.now();
                  for(const k in locks) {
                      if(k.indexOf(V.PREFIXE) !== 0) continue;
                      const l = locks[k];
                      if(!l) continue;
                      if(l.heartbeat_at && (maintenant - new Date(l.heartbeat_at).getTime()) > VerrouFin.EXPIRATION) continue;
                      out[k.slice(V.PREFIXE.length)] = l;
                  }
                  return out;
              },

              // Le verrou s'il est tenu par QUELQU'UN D'AUTRE, sinon null. C'est
              // la seule question que posent les ecrans : « puis-je y toucher ? »
              detenteur: (id) => {
                  if(!id) return null;
                  const l = V.tous()[String(id)];
                  if(!l || LockManager._mine(l)) return null;
                  return l;
              },
              tenuParMoi: (id) => {
                  if(!id) return false;
                  const l = V.tous()[String(id)];
                  return !!(l && LockManager._mine(l));
              },
              peutEcrire: (id) => !V.detenteur(id),
              qui: (id) => {
                  const l = V.detenteur(id);
                  return l ? LockManager._who(l) : '';
              },
              miennes: () => Object.keys(V.tous()).filter(id => V.tenuParMoi(id)),

              // ON N'EN TIENT QU'UN A LA FOIS : en ouvrir un autre libere le
              // precedent. Sans cela, quelqu'un qui parcourt son scenario
              // verrouillerait tout ce qu'il a survole pour trois minutes.
              prendre: async (id_) => {
                  if(!id_ || !state.currentProjectId || !state.currentUser) return false;
                  if(state.currentRole === 'viewer') return false;
                  const id = String(id_);
                  if(V.tenuParMoi(id)) return true;
                  if(V._enCours[id]) return false;
                  V._enCours[id] = true;
                  try {
                      const { data, error } = await supabase.rpc('lock_acquire', {
                          p_id: state.currentProjectId,
                          p_key: V.clef(id),
                          p_uid: LockManager._uid(),
                          p_name: (state.currentUser.email || '').split('@')[0]
                      });
                      if(error) { console.warn('[' + V.NOM + '] prise du verrou :', error.message); return false; }
                      let lock = data;
                      if(Array.isArray(lock)) lock = lock[0] || null;
                      state.domainLocks = state.domainLocks || {};
                      if(lock) state.domainLocks[V.clef(id)] = lock;
                      const obtenu = LockManager._mine(lock);
                      // Liberer les autres APRES avoir obtenu celui-ci : si la
                      // prise echoue, on ne s'est pas desarme pour rien.
                      if(obtenu) await V.libererSauf(id);
                      VerrouFin.marquerTout();
                      return obtenu;
                  } catch(e) {
                      console.warn('[' + V.NOM + '] prise du verrou :', e && e.message);
                      return false;
                  } finally {
                      delete V._enCours[id];
                  }
              },

              liberer: async (id_) => {
                  if(!id_ || !state.currentProjectId || !state.currentUser) return;
                  const id = String(id_);
                  if(!V.tenuParMoi(id)) return;
                  try {
                      await supabase.rpc('lock_release', {
                          p_id: state.currentProjectId, p_key: V.clef(id), p_uid: LockManager._uid()
                      });
                  } catch(e) {
                      console.warn('[' + V.NOM + '] liberation echouee, expiration dans 3 min :', e && e.message);
                  }
                  if(state.domainLocks) delete state.domainLocks[V.clef(id)];
                  VerrouFin.marquerTout();
              },

              libererSauf: async (garde_) => {
                  const garde = String(garde_ || '');
                  for(const id of V.miennes()) { if(id !== garde) await V.liberer(id); }
              },
              libererTout: () => V.libererSauf(null),

              // BATTEMENT DE COEUR. Un verrou qu'on ne fait plus battre est
              // considere abandonne au bout de trois minutes — c'est ce qui
              // libere la place quand quelqu'un ferme son ordinateur. Sans la
              // meme horloge ici, notre propre verrou expirerait sous nos doigts.
              battre: async () => {
                  if(!state.currentProjectId || !state.currentUser) return;
                  for(const id of V.miennes()) {
                      try {
                          await supabase.rpc('lock_heartbeat', {
                              p_id: state.currentProjectId, p_key: V.clef(id), p_uid: LockManager._uid()
                          });
                      } catch(e) { /* prochain battement dans une minute */ }
                  }
              },

              // L'element de cette famille ou se trouve le curseur, s'il y en a un.
              idDuCurseur: () => {
                  try {
                      const sel = document.getSelection();
                      let noeud = (sel && sel.anchorNode) || document.activeElement;
                      if(noeud && noeud.nodeType === 3) noeud = noeud.parentElement;
                      if(!noeud || !noeud.closest) return '';
                      const bloc = noeud.closest(V.ZONES_ECRITURE);
                      if(!bloc || bloc.closest(VerrouFin.HORS_JEU)) return '';
                      return String(V._idDe(bloc) || '');
                  } catch(e) { return ''; }
              },

              // QUITTER REND LA MAIN, mais pas du premier coup : cliquer un
              // bouton de la barre d'outils sort le curseur pour y revenir
              // aussitot, et lacher a chaque aller-retour ferait clignoter le
              // verrou et enverrait une rafale d'ecritures.
              suivreCurseur: async () => {
                  if(state.currentRole === 'viewer') return;
                  const id = V.idDuCurseur();
                  if(!id) {
                      if(!V._minuteurSortie && V.miennes().length) {
                          V._minuteurSortie = setTimeout(() => {
                              V._minuteurSortie = null;
                              if(V.idDuCurseur()) return;   // revenu entre-temps
                              V.libererTout();
                          }, VerrouFin.DELAI_SORTIE);
                      }
                      return;
                  }
                  clearTimeout(V._minuteurSortie);
                  V._minuteurSortie = null;
                  if(V.tenuParMoi(id)) return;      // deja a moi
                  if(V.detenteur(id)) return;       // a quelqu'un d'autre : le badge le dit
                  await V.prendre(id);
              },

              // ------------------------------------------------------------------
              //  AFFICHAGE : la zone tenue porte la pastille de la personne et la
              //  mention « verrouillée », PARTOUT ou elle apparait.
              // ------------------------------------------------------------------
              marquer: () => {
                  const tenues = V.tous();
                  document.querySelectorAll(V.ZONES).forEach(el => {
                      if(el.closest(VerrouFin.HORS_JEU)) return;
                      const id = String(V._idDe(el) || '');
                      const l = id ? tenues[id] : null;
                      const parUnAutre = !!(l && !LockManager._mine(l));
                      el.classList.toggle('zone-verrouillee', parUnAutre);
                      el.classList.toggle('zone-a-moi', !!(l && LockManager._mine(l)));
                      const ancien = el.querySelector(':scope > .zone-lock-badge');
                      // NE RIEN TOUCHER SI RIEN N'A CHANGE. Ce n'est pas du
                      // confort : la surveillance de la page rappelle cette
                      // fonction des que le DOM bouge. Si elle refaisait le badge
                      // a chaque passage, elle declencherait sa propre
                      // surveillance — une boucle sans fin.
                      const memeQue = ancien && ancien.dataset.qui;
                      if(parUnAutre && memeQue && memeQue === String(l.holder_uid || '')) return;
                      if(ancien) ancien.remove();
                      if(!parUnAutre) return;
                      const qui = LockManager._who(l);
                      const badge = document.createElement('span');
                      badge.className = 'zone-lock-badge';
                      badge.dataset.qui = String(l.holder_uid || '');
                      badge.title = '🔒 Verrouillée — ' + qui + ' travaille ici';
                      const pastille = document.createElement('span');
                      pastille.className = 'zone-lock-avatar';
                      const em = (l.holder_email || '').toLowerCase();
                      if(em) pastille.style.background = Utils.getColor(em);
                      pastille.textContent = (qui[0] || '?').toUpperCase();
                      badge.appendChild(pastille);
                      const txt = document.createElement('span');
                      txt.className = 'zone-lock-texte';
                      txt.textContent = '🔒 Verrouillée';
                      badge.appendChild(txt);
                      el.appendChild(badge);
                  });
              }
          };
          VerrouFin._liste.push(V);
          return V;
      },

      // ------------------------------------------------------------------
      //  UNE SEULE SURVEILLANCE POUR TOUTES LES FAMILLES
      // ------------------------------------------------------------------
      marquerTout: () => {
          VerrouFin._liste.forEach(V => {
              try { V.marquer(); } catch(e) { console.warn('[' + V.NOM + '] affichage :', e && e.message); }
          });
      },
      battreTout: async () => {
          for(const V of VerrouFin._liste) { try { await V.battre(); } catch(e) {} }
      },
      libererTout: () => { VerrouFin._liste.forEach(V => { try { V.libererTout(); } catch(e) {} }); },

      init: () => {
          if(VerrouFin._inited) return;
          VerrouFin._inited = true;
          // LE VERROU SE PREND QUAND LE CURSEUR ENTRE DANS UNE ZONE — pas au
          // survol (on verrouillerait tout ce qu'on parcourt), pas a
          // l'enregistrement (trop tard, l'autre aurait deja ecrit). Le
          // defilement ne deplace pas le curseur : LIRE ne verrouille rien.
          const surActivite = () => {
              clearTimeout(VerrouFin._minuteur);
              VerrouFin._minuteur = setTimeout(() => {
                  VerrouFin._liste.forEach(V => { try { V.suivreCurseur(); } catch(e) {} });
              }, VerrouFin.DELAI);
          };
          document.addEventListener('selectionchange', surActivite);
          document.addEventListener('focusin', surActivite, true);
          // Fermeture de la page : on rend la main tout de suite plutot que de
          // laisser les autres attendre trois minutes l'expiration.
          window.addEventListener('pagehide', () => { try { VerrouFin.libererTout(); } catch(e) {} });
          // Chaque redessin d'ecran reconstruit ses zones et efface donc les
          // marques avec. Les reposer depuis chaque fonction de rendu, c'est en
          // oublier une — on en a deja oublie cinq. On surveille donc la PAGE.
          // On n'ecoute QUE l'apparition et la disparition d'elements, jamais les
          // attributs ni le texte : sinon chaque touche frappee relancerait tout.
          try {
              let mt = null;
              const obs = new MutationObserver(() => {
                  clearTimeout(mt);
                  mt = setTimeout(() => { try { VerrouFin.marquerTout(); } catch(e) {} }, 300);
              });
              obs.observe(document.body, { childList: true, subtree: true });
              VerrouFin._observateur = obs;
          } catch(e) { console.warn('[VerrouFin] surveillance de la page :', e && e.message); }
      }
  };
