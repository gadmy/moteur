
  // ==========================================================================
  //  VERROU PAR SCENE (v601) — etape 3
  // ==========================================================================
  //  Jusqu'ici un verrou couvrait un DOMAINE entier : « scenes » bloquait d'un
  //  coup le Scenario, le Sequencier et le Depouillement. Une personne ecrit,
  //  tout le monde regarde. Depuis que chaque scene a sa fiche, elle a une
  //  IDENTITE STABLE (scene.id) et une frontiere nette : on peut donc verrouiller
  //  la scene, et elle seule.
  //
  //  AUCUNE PIECE SERVEUR NOUVELLE. La table project_locks a une colonne
  //  lock_key en TEXTE LIBRE, et lock_acquire arbitre n'importe quelle clef avec
  //  la meme autorite (premier arrive, expiration a 3 minutes sans battement).
  //  On y pose donc « scene:<id> ». Tout ce que LockManager sait deja faire —
  //  rafraichissement, expiration, temps reel — vaut pour ces clefs-la aussi.
  //
  //  CE QU'ON NE VERROUILLE PAS, ET POURQUOI. Les fiches LIEES a la scene
  //  (comedien, personnage, decor, technicien) restent libres. Verrouiller en
  //  cascade paraissait prudent, c'est l'inverse : dans un projet reel de 21
  //  scenes, la realisatrice est rattachee aux 21, et les comediens principaux a
  //  20. Verrouiller une seule scene aurait donc fige presque toutes les fiches
  //  du projet — bien pire qu'aujourd'hui, ou verrouiller le scenario laisse au
  //  moins le casting libre. Le vrai risque n'est pas qu'on RENOMME un decor
  //  pendant que j'ecris, c'est qu'on l'EFFACE : c'est ca qu'on protege.
  //
  //  LES SOUS-ELEMENTS SONT COUVERTS D'OFFICE : le depouillement, le resume, le
  //  titre, les liens vers les personnages et le decor vivent DANS l'objet
  //  scene. Verrouiller la scene les verrouille tous, partout a la fois.
  const SceneLock = {
      PREFIXE: 'scene:',
      clef: (sceneId) => SceneLock.PREFIXE + String(sceneId || ''),

      // Toutes les scenes tenues par quelqu'un, MOI COMPRIS : { id -> verrou }.
      // On repart de state.domainLocks, que LockManager tient deja a jour.
      tous: () => {
          const out = {};
          const locks = state.domainLocks || {};
          const maintenant = Date.now();
          for(const k in locks) {
              if(k.indexOf(SceneLock.PREFIXE) !== 0) continue;
              const l = locks[k];
              if(!l) continue;
              // Meme regle d'expiration que les verrous de domaine : sans
              // battement depuis 3 minutes, la personne a ferme sa page.
              if(l.heartbeat_at && (maintenant - new Date(l.heartbeat_at).getTime()) > 180000) continue;
              out[k.slice(SceneLock.PREFIXE.length)] = l;
          }
          return out;
      },

      // Le verrou d'une scene s'il est tenu par QUELQU'UN D'AUTRE, sinon null.
      // C'est la seule question que posent les ecrans : « est-ce que je peux
      // toucher a cette scene ? »
      detenteur: (sceneId) => {
          if(!sceneId) return null;
          const l = SceneLock.tous()[String(sceneId)];
          if(!l || LockManager._mine(l)) return null;
          return l;
      },
      tenueParMoi: (sceneId) => {
          if(!sceneId) return false;
          const l = SceneLock.tous()[String(sceneId)];
          return !!(l && LockManager._mine(l));
      },
      peutEcrire: (sceneId) => !SceneLock.detenteur(sceneId),
      qui: (sceneId) => {
          const l = SceneLock.detenteur(sceneId);
          return l ? LockManager._who(l) : '';
      },

      // ------------------------------------------------------------------
      //  LE SEUL EFFET EN CASCADE QU'ON GARDE : ON N'EFFACE PAS SOUS LES PIEDS.
      // ------------------------------------------------------------------
      //  On a choisi de NE PAS verrouiller les fiches liees (voir l'en-tete).
      //  Reste le vrai danger : pendant que Marc ecrit la scene 12, quelqu'un
      //  SUPPRIME le decor « Cuisine » qu'elle utilise. Renommer ne coute rien —
      //  Marc verra le nouveau nom. Supprimer, si : la scene perd son lien, et
      //  Marc ne s'en apercoit pas avant l'export.
      //  On refuse donc la suppression tant qu'une scene qui s'en sert est tenue
      //  par quelqu'un. C'est temporaire, pas definitif : trois minutes plus
      //  tard, ou des que la personne passe a autre chose, la suppression repasse.
      SCENE_KIND: { characters: 'character', actors: 'actor', locations: 'location', crew: 'crew', resources: 'resource' },

      scenesTenuesLiees: (type, id) => {
          try {
              const kind = SceneLock.SCENE_KIND[type] || type;
              if(!id || typeof UI === 'undefined' || !UI.scenesForFiche) return [];
              const tenues = SceneLock.tous();
              return UI.scenesForFiche(kind, id).filter(s => {
                  const l = s && tenues[String(s.id)];
                  return !!(l && !LockManager._mine(l));
              });
          } catch(e) { return []; }
      },

      // Renvoie true si la suppression peut se faire ; sinon explique et refuse.
      autoriseSuppression: (type, id) => {
          const bloquantes = SceneLock.scenesTenuesLiees(type, id);
          if(!bloquantes.length) return true;
          const s = bloquantes[0];
          const l = SceneLock.tous()[String(s.id)];
          const qui = l ? LockManager._who(l) : 'quelqu\'un';
          const num = s.number || s.num || s.id;
          Utils.toast('Impossible pour le moment : ' + qui + ' travaille sur la scène ' + num
              + (bloquantes.length > 1 ? ' (et ' + (bloquantes.length - 1) + ' autre' + (bloquantes.length > 2 ? 's' : '') + ')' : '')
              + ', qui utilise cette fiche. Réessayez dans un instant.', 'warning', 8000);
          return false;
      },

      // Refus groupe : supprimer une saison ou un episode emporte toutes ses
      // scenes. Si l'une d'elles est tenue, on refuse le lot entier — on ne
      // supprime pas a moitie.
      autoriseSuppressionScenes: (scenes) => {
          try {
              const tenues = (scenes || []).filter(sc => sc && !SceneLock.peutEcrire(sc.id));
              if(!tenues.length) return true;
              const q = SceneLock.qui(tenues[0].id);
              Utils.toast('Impossible pour le moment : ' + (q || 'quelqu\'un') + ' écrit '
                  + (tenues.length > 1 ? tenues.length + ' des scènes concernées' : 'une des scènes concernées')
                  + '. Réessayez dans un instant.', 'warning', 8000);
              return false;
          } catch(e) { return true; }
      },

      _enCours: {},   // scenes pour lesquelles une demande est partie

      // Prend le verrou d'une scene. Renvoie true si je l'ai.
      // ON NE PREND QU'UNE SCENE A LA FOIS : ouvrir une autre scene libere la
      // precedente. Sans cela, quelqu'un qui parcourt son scenario verrouillerait
      // tout ce qu'il a survole, et le laisserait bloque trois minutes.
      prendre: async (sceneId) => {
          if(!sceneId || !state.currentProjectId || !state.currentUser) return false;
          if(state.currentRole === 'viewer') return false;
          const id = String(sceneId);
          if(SceneLock.tenueParMoi(id)) return true;
          if(SceneLock._enCours[id]) return false;
          SceneLock._enCours[id] = true;
          try {
              const { data, error } = await supabase.rpc('lock_acquire', {
                  p_id: state.currentProjectId,
                  p_key: SceneLock.clef(id),
                  p_uid: LockManager._uid(),
                  p_name: (state.currentUser.email || '').split('@')[0]
              });
              if(error) { console.warn('[SceneLock] prise du verrou :', error.message); return false; }
              let lock = data;
              if(Array.isArray(lock)) lock = lock[0] || null;
              state.domainLocks = state.domainLocks || {};
              if(lock) state.domainLocks[SceneLock.clef(id)] = lock;
              const obtenu = LockManager._mine(lock);
              if(obtenu) {
                  // Liberer les autres APRES avoir obtenu celle-ci : si la prise
                  // echoue, on ne s'est pas desarme pour rien.
                  await SceneLock.libererSauf(id);
              }
              SceneLock.rafraichirUI();
              return obtenu;
          } catch(e) {
              console.warn('[SceneLock] prise du verrou :', e && e.message);
              return false;
          } finally {
              delete SceneLock._enCours[id];
          }
      },

      liberer: async (sceneId) => {
          if(!sceneId || !state.currentProjectId || !state.currentUser) return;
          const id = String(sceneId);
          if(!SceneLock.tenueParMoi(id)) return;
          try {
              await supabase.rpc('lock_release', {
                  p_id: state.currentProjectId, p_key: SceneLock.clef(id), p_uid: LockManager._uid()
              });
          } catch(e) {
              // Pas grave : le verrou expirera tout seul au bout de 3 minutes.
              console.warn('[SceneLock] liberation echouee, expiration dans 3 min :', e && e.message);
          }
          if(state.domainLocks) delete state.domainLocks[SceneLock.clef(id)];
          SceneLock.rafraichirUI();
      },

      libererSauf: async (sceneIdGardee) => {
          const garde = String(sceneIdGardee || '');
          const miennes = Object.keys(SceneLock.tous()).filter(id => id !== garde && SceneLock.tenueParMoi(id));
          for(const id of miennes) await SceneLock.liberer(id);
      },
      libererToutes: () => SceneLock.libererSauf(null),

      // BATTEMENT DE COEUR. Un verrou qu'on ne fait plus battre est considere
      // abandonne au bout de trois minutes — c'est ce qui libere la place quand
      // quelqu'un ferme son ordinateur. LockManager fait battre SES domaines
      // toutes les minutes ; sans la meme horloge ici, ma propre scene
      // expirerait sous mes doigts pendant que j'ecris, et le voisin pourrait
      // la prendre. On se branche donc sur le meme battement.
      battre: async () => {
          if(!state.currentProjectId || !state.currentUser) return;
          const miennes = Object.keys(SceneLock.tous()).filter(id => SceneLock.tenueParMoi(id));
          for(const id of miennes) {
              try {
                  await supabase.rpc('lock_heartbeat', {
                      p_id: state.currentProjectId, p_key: SceneLock.clef(id), p_uid: LockManager._uid()
                  });
              } catch(e) { /* prochain battement dans une minute */ }
          }
      },

      // ------------------------------------------------------------------
      //  QUAND PREND-ON LE VERROU ? Quand le curseur ENTRE dans une scene.
      // ------------------------------------------------------------------
      //  Pas au survol (on verrouillerait tout ce qu'on parcourt), pas a
      //  l'enregistrement (trop tard, l'autre aurait deja ecrit). Le curseur
      //  dans le texte, c'est l'intention d'ecrire — et le defilement ne le
      //  deplace pas, donc LIRE ne verrouille rien.
      //  Le declencheur vit ICI et non dans l'editeur : le jour ou un autre
      //  ecran rend une scene modifiable, il est couvert sans qu'on y pense.
      DELAI: 250,
      _inited: false,
      _minuteur: null,

      init: () => {
          if(SceneLock._inited) return;
          SceneLock._inited = true;
          const surActivite = () => {
              clearTimeout(SceneLock._minuteur);
              SceneLock._minuteur = setTimeout(SceneLock._suivreCurseur, SceneLock.DELAI);
          };
          document.addEventListener('selectionchange', surActivite);
          document.addEventListener('focusin', surActivite, true);
          // ------------------------------------------------------------------
          //  UNE SEULE PORTE POUR REPOSER LES MARQUES.
          // ------------------------------------------------------------------
          //  Chaque redessin d'ecran (changement d'onglet, sauvegarde, tri...)
          //  reconstruit ses scenes et efface donc les badges avec. Les reposer
          //  depuis chaque fonction de rendu, c'est en oublier une — on en a
          //  deja oublie cinq dans ce chantier. On surveille donc la PAGE : des
          //  qu'elle bouge, on repose les marques, une fois, apres un court
          //  delai. Un ecran ajoute demain est couvert sans qu'on y pense.
          //  On n'ecoute QUE l'apparition et la disparition d'elements, jamais
          //  les attributs ni le texte : sinon chaque touche frappee dans une
          //  scene relancerait le calcul.
          try {
              let mt = null;
              const obs = new MutationObserver(() => {
                  clearTimeout(mt);
                  mt = setTimeout(() => { try { SceneLock.marquerEcrans(); } catch(e) {} }, 300);
              });
              obs.observe(document.body, { childList: true, subtree: true });
              SceneLock._observateur = obs;
          } catch(e) { console.warn('[SceneLock] surveillance de la page :', e && e.message); }
          // Fermeture de la page : on rend la main tout de suite plutot que de
          // laisser les autres attendre trois minutes l'expiration.
          window.addEventListener('pagehide', () => { try { SceneLock.libererToutes(); } catch(e) {} });
      },

      _sceneDuCurseur: () => {
          try {
              const sel = document.getSelection();
              let noeud = (sel && sel.anchorNode) || document.activeElement;
              if(noeud && noeud.nodeType === 3) noeud = noeud.parentElement;
              if(!noeud || !noeud.closest) return '';
              const bloc = noeud.closest(SceneLock.ZONES_ECRITURE);
              if(!bloc || bloc.closest(SceneLock.HORS_JEU)) return '';
              return String(SceneLock._idDe(bloc) || '');
          } catch(e) { return ''; }
      },

      // QUITTER UNE SCENE LA REND. La premiere version gardait le verrou tant
      // qu'on n'en prenait pas un autre : on pouvait donc partir au Planning et
      // laisser sa scene bloquee indefiniment, puisque le battement de coeur la
      // maintenait en vie. Ce n'est pas ce qu'on attend — on quitte, ca se
      // deverrouille.
      // MAIS PAS DU PREMIER COUP : cliquer un bouton de la barre d'outils sort
      // le curseur de la scene pour y revenir aussitot. Rendre la main a chaque
      // aller-retour ferait clignoter le verrou et enverrait une rafale
      // d'ecritures. On attend donc un moment de calme avant de lacher.
      DELAI_SORTIE: 20000,
      _minuteurSortie: null,

      _suivreCurseur: async () => {
          if(state.currentRole === 'viewer') return;
          const id = SceneLock._sceneDuCurseur();
          if(!id) {
              // Curseur hors de toute scene : on rendra la main si ca dure.
              if(!SceneLock._minuteurSortie) {
                  SceneLock._minuteurSortie = setTimeout(() => {
                      SceneLock._minuteurSortie = null;
                      if(SceneLock._sceneDuCurseur()) return;   // revenu entre-temps
                      SceneLock.libererToutes();
                  }, SceneLock.DELAI_SORTIE);
              }
              return;
          }
          clearTimeout(SceneLock._minuteurSortie);
          SceneLock._minuteurSortie = null;
          if(SceneLock.tenueParMoi(id)) return; // deja a moi
          if(SceneLock.detenteur(id)) return;   // tenue par un autre : le badge le dit deja
          await SceneLock.prendre(id);
      },

      // Redessine les marques de verrou. Appelee apres chaque changement connu ;
      // le rafraichissement periodique de LockManager passe aussi par ici.
      rafraichirUI: () => {
          try { SceneLock.marquerEcrans(); } catch(e) { console.warn('[SceneLock] affichage :', e && e.message); }
      },

      // ------------------------------------------------------------------
      //  AFFICHAGE : la scene tenue porte le badge de la personne et la
      //  mention « verrouillée », PARTOUT ou elle apparait. On ne cherche pas
      //  les ecrans un par un : on marque tout element qui porte l'identifiant
      //  d'une scene, quel que soit l'ecran. Un ecran ajoute demain est couvert
      //  sans qu'on ait a y penser — c'est la lecon des trois vignettes de
      //  storyboard qui lisaient trois choses differentes.
      // ------------------------------------------------------------------
      // UNE SEULE LISTE, ET C'EST TOUT LE SUJET. La premiere version marquait
      // « tout element qui porte l'identifiant d'une scene ». Verifie apres coup :
      // presque rien n'en portait — le depouillement, le sequencier et la fiche
      // passaient le leur par un onclick. Le verrou ne voyait donc que le
      // Scenario, et le badge allait se poser sur les pastilles de commentaire
      // et dans les listes de choix des exports, qui en portent un sans etre des
      // zones de travail.
      // On NOMME donc les zones, une fois, ici. Ajouter un ecran demain, c'est
      // ajouter une ligne a cette liste — et le poser dans l'autre liste s'il
      // permet d'ECRIRE.
      ZONES: [
          '.script-continuous-scene[data-scene-id]',   // Scenario
          '#bdScriptContent[data-scene-id]',           // Depouillement, texte
          '#bdRightContent[data-scene-id]',            // Depouillement, fiches
          '.bd-scene-row[data-scene-id]',              // Depouillement, liste
          '.seq-card[data-scene-id]',                  // Sequencier
          '.beatboard-card[data-scene-id]',            // Beat Board
          '.fiche-scene[data-scene-id]'                // Fiche de la scene
      ].join(', '),
      // Les zones ou l'on ECRIT : y poser le curseur, c'est l'intention de
      // modifier, donc la prise du verrou. Les listes et les cartes n'y sont
      // pas : les parcourir, c'est lire.
      ZONES_ECRITURE: [
          '.script-continuous-scene[data-scene-id]',
          '#bdScriptContent[data-scene-id]',
          '#bdRightContent[data-scene-id]',
          '.fiche-scene[data-scene-id]'
      ].join(', '),
      // Les LISTES DE CHOIX (export, partage, impression) portent aussi
      // l'identifiant des scenes, pour cocher lesquelles inclure. Y poser un
      // badge de verrou serait faux : choisir une scene dans un export ne la
      // modifie pas. On les ecarte.
      // Filet de securite en plus des zones nommees : meme si une zone finissait
      // un jour dans une fenetre de choix (export, partage, impression), y poser
      // un verrou serait faux — cocher une scene dans un export ne la modifie
      // pas. « confirm-modal-overlay » est le vrai nom de ces fenetres ; l'oubli
      // de la premiere version laissait le badge se poser sur leurs cases.
      HORS_JEU: '.modal, .modal-overlay, .confirm-modal-overlay, .fb-ov, .tour-panel-ov, [id*="export"], [id*="chooser"], [class*="chooser"]',
      _idDe: (el) => el.getAttribute('data-scene-id') || el.getAttribute('data-sceneid') || el.getAttribute('data-scene') || '',

      marquerEcrans: () => {
          const tenues = SceneLock.tous();
          document.querySelectorAll(SceneLock.ZONES).forEach(el => {
              if(el.closest(SceneLock.HORS_JEU)) return;
              const id = String(SceneLock._idDe(el) || '');
              const l = id ? tenues[id] : null;
              const parUnAutre = !!(l && !LockManager._mine(l));
              el.classList.toggle('scene-verrouillee', parUnAutre);
              el.classList.toggle('scene-a-moi', !!(l && LockManager._mine(l)));
              const ancien = el.querySelector(':scope > .scene-lock-badge');
              // NE RIEN TOUCHER SI RIEN N'A CHANGE. Ce n'est pas du confort :
              // la surveillance ci-dessous rappelle cette fonction des que la
              // page bouge. Si elle refaisait le badge a chaque passage, elle
              // declencherait sa propre surveillance — une boucle sans fin.
              const memeQue = ancien && ancien.dataset.qui;
              if(parUnAutre && memeQue && memeQue === String(l.holder_uid || '')) return;
              if(ancien) ancien.remove();
              if(!parUnAutre) return;
              const qui = LockManager._who(l);
              const badge = document.createElement('span');
              badge.className = 'scene-lock-badge';
              badge.dataset.qui = String(l.holder_uid || '');
              badge.title = '🔒 Verrouillée — ' + qui + ' travaille sur cette scène';
              const em = (l.holder_email || '').toLowerCase();
              const pastille = document.createElement('span');
              pastille.className = 'scene-lock-avatar';
              if(em) pastille.style.background = Utils.getColor(em);
              pastille.textContent = (qui[0] || '?').toUpperCase();
              badge.appendChild(pastille);
              const txt = document.createElement('span');
              txt.className = 'scene-lock-texte';
              txt.textContent = '🔒 Verrouillée';
              badge.appendChild(txt);
              el.appendChild(badge);
          });
      }
  };
