
  // ==========================================================================
  //  CHERCHER DES GENS POUR UN PROJET — ET LES TRIER AU POUCE (v601)
  // ==========================================================================
  //  L'Univers savait faire le match dans UN SEUL SENS : « mon profil, quels
  //  projets me cherchent ». L'autre sens manquait, et c'est pourtant celui
  //  qu'on utilise le plus souvent quand on monte un film : « mon projet, qui
  //  peut tenir les postes qui me manquent ».
  //
  //  CE QUI DISTINGUE CE SENS-LA, ET QUI COMMANDE TOUT LE RESTE : on ne
  //  cherche pas UNE personne, on cherche POSTE PAR POSTE. « Pour le role de
  //  Pierre : ces trois comediens. Pour le poste de chef electricien : ces
  //  deux techniciens. » Les resultats sont donc ranges par BESOIN, jamais en
  //  une liste plate — c'est la demande exacte du developpeur, et c'est aussi
  //  la seule facon d'ecrire ensuite un mail qui dise a quelqu'un POUR QUOI on
  //  le contacte.
  //
  //  MES PROJETS ET MES PROFILS N'ONT PAS BESOIN D'ETRE PUBLIES. Ils sont a
  //  moi : rien ne justifie de me forcer a m'exposer pour chercher. Les
  //  besoins d'un projet vivent dans son onglet Presentation, pas dans sa
  //  fiche publique — ils existent donc des qu'on les a saisis.
  //  EN FACE, RIEN NE CHANGE : on ne trouve que des profils PUBLICS. Le
  //  serveur ne rend pas les autres, et c'est tres bien ainsi — quelqu'un qui
  //  a choisi de ne pas apparaitre ne doit pas apparaitre.
  const CastingMatch = {

      // ------------------------------------------------------------------
      //  ETAT
      // ------------------------------------------------------------------
      projet: null,        // { id, titre, besoins: [...] }
      besoins: [],         // [{ id, kind, label, need, candidats: [...] }]
      pile: [],            // les cartes qu'il reste a trancher, dans l'ordre
      rang: 0,             // ou l'on en est dans la pile
      gardes: [],          // les cartes retenues (coeur)
      dernier: null,       // la derniere carte tranchee — pour pouvoir annuler
      _mesProjets: null,   // cache de la liste, le temps de la session

      // Les ecartes sont MEMORISEES PAR PROJET, dans le navigateur. Sans cela
      // la pile reproposerait trente fois les memes personnes ecartees. Ce
      // n'est pas une donnee du projet : c'est un choix de tri personnel, il
      // n'a rien a faire dans le fichier partage.
      _cleEcartes: (projetId) => 'moteur_match_ecartes_' + String(projetId || ''),
      ecartes: (projetId) => {
          try { return JSON.parse(localStorage.getItem(CastingMatch._cleEcartes(projetId)) || '{}') || {}; }
          catch(e) { return {}; }
      },
      ecarter_memoire: (projetId, cle) => {
          try {
              const m = CastingMatch.ecartes(projetId);
              m[cle] = 1;
              localStorage.setItem(CastingMatch._cleEcartes(projetId), JSON.stringify(m));
          } catch(e) { /* navigation privee : on tranche pour cette fois seulement */ }
      },
      oublierEcartes: (projetId) => {
          try { localStorage.removeItem(CastingMatch._cleEcartes(projetId)); } catch(e) {}
      },

      // ==================================================================
      //  1. LE SELECTEUR : MES PROFILS **ET** MES PROJETS
      // ==================================================================
      //  Un profil peut porter plusieurs casquettes (comedien, et deux fiches
      //  technicien). On liste donc une ligne PAR CASQUETTE : chercher « pour
      //  mon profil » ne veut rien dire, chercher « pour ma casquette de chef
      //  operateur » veut dire quelque chose.
      remplirSelecteur: async () => {
          const select = document.getElementById('universe-my-profile');
          if(!select) return;
          const garde = select.value;
          select.innerHTML = '<option value="">-- Chercher pour... --</option>';

          // --- mes casquettes
          const gProfils = document.createElement('optgroup');
          gProfils.label = 'Mes profils — trouver des projets';
          (CastingMatch.mesCasquettes() || []).forEach(c => {
              const o = document.createElement('option');
              o.value = 'profil:' + c.idx + ':' + c.facetKey;
              o.textContent = c.icone + ' ' + c.libelle;
              gProfils.appendChild(o);
          });
          if(gProfils.children.length) select.appendChild(gProfils);

          // --- mes projets
          const projets = await CastingMatch.mesProjets();
          const gProjets = document.createElement('optgroup');
          gProjets.label = 'Mes projets — trouver des gens';
          projets.forEach(p => {
              const o = document.createElement('option');
              o.value = 'projet:' + p.id;
              o.textContent = '🎬 ' + (p.title || 'Sans titre');
              gProjets.appendChild(o);
          });
          if(gProjets.children.length) select.appendChild(gProjets);

          if(!gProfils.children.length && !gProjets.children.length) {
              select.innerHTML += '<option value="" disabled>Aucun profil ni projet</option>';
          }
          if(garde) select.value = garde;
      },

      // Mes casquettes actives. On part de Universe.myProfiles quand il est
      // rempli (profil public), sinon de ma propre fiche : un profil NON
      // PUBLIE doit pouvoir chercher, il n'est simplement pas trouvable.
      mesCasquettes: () => {
          const sorties = [];
          try {
              let profils = Universe.myProfiles || [];
              if(!profils.length && typeof PublicProfile !== 'undefined' && PublicProfile.current) {
                  profils = [PublicProfile.current];
              }
              profils.forEach((p, idx) => {
                  const facets = (typeof PublicProfile !== 'undefined' && PublicProfile._normalizeFacets)
                      ? PublicProfile._normalizeFacets(p.facets, p) : (p.facets || {});
                  const ajouter = (cle, nom, icone) => {
                      const f = PublicProfile.facetByKey(facets, cle) || {};
                      sorties.push({
                          idx: idx, facetKey: cle, icone: icone,
                          libelle: (f.name || p.name || 'Profil') + ' — ' + nom,
                          profil: p, facet: f
                      });
                  };
                  if(facets.actor && facets.actor.enabled) ajouter('actor', 'comédien·ne', '🎭');
                  PublicProfile.crewArr(facets).forEach((cf, i) => {
                      if(cf && cf.enabled) ajouter(PublicProfile._facetKey('crew', i), (cf.role || 'technicien·ne'), '🎥');
                  });
              });
          } catch(e) { console.warn('[Match] mes casquettes :', e && e.message); }
          return sorties;
      },

      // Mes projets, PUBLIES OU NON. La liste du tableau de bord suffit : elle
      // ne contient que ce a quoi j'ai droit, et elle ne charge pas les
      // donnees — on les demandera pour le seul projet choisi.
      mesProjets: async () => {
          if(CastingMatch._mesProjets) return CastingMatch._mesProjets;
          try {
              const liste = await Store.getProjectsList();
              CastingMatch._mesProjets = (liste || []).filter(p => p && p.id);
          } catch(e) {
              console.warn('[Match] liste des projets :', e && e.message);
              CastingMatch._mesProjets = [];
          }
          return CastingMatch._mesProjets;
      },

      // ==================================================================
      //  2. LANCER LA RECHERCHE
      // ==================================================================
      lancer: async () => {
          const select = document.getElementById('universe-my-profile');
          const v = select ? select.value : '';
          if(!v) { Utils.toast('Choisissez un profil ou un projet.', 'warning'); return; }
          if(v.indexOf('projet:') === 0) return CastingMatch.pourProjet(v.slice(7));
          // Un profil : c'est l'ancien chemin, qui cherche des PROJETS.
          return CastingMatch.pourProfil(v);
      },

      pourProfil: (valeur) => {
          const bouts = valeur.split(':');       // profil:<idx>:<facetKey...>
          const idx = parseInt(bouts[1], 10);
          const casquettes = CastingMatch.mesCasquettes();
          const c = casquettes.find(x => x.idx === idx && x.facetKey === bouts.slice(2).join(':'));
          if(!c) { Utils.toast('Profil introuvable.', 'error'); return; }
          // MatchingEngine attend un profil a plat : on lui donne la casquette
          // choisie, fusionnee sur le profil, plutot que la premiere trouvee.
          const kind = PublicProfile._facetKind(c.facetKey);
          MatchingEngine.selectedProfile = Object.assign({}, c.profil, c.facet, {
              type: kind === 'actor' ? 'actor' : 'crew'
          });
          MatchingEngine.findProjectsForMe(MatchingEngine.selectedProfile);
      },

      pourProjet: async (projetId) => {
          const projets = await CastingMatch.mesProjets();
          const meta = projets.find(p => String(p.id) === String(projetId));
          Utils.toast('Lecture du projet…', 'info', 1500);
          let donnees = null;
          try {
              // Le projet choisi n'est pas forcement celui qui est ouvert : on
              // demande ses donnees, par la meme porte que partout ailleurs.
              if(state.currentProjectId && String(state.currentProjectId) === String(projetId)) {
                  donnees = state.data;
              } else {
                  // Meme porte que Store.load : la fonction rend DIRECTEMENT les
                  // donnees du projet, deja cloisonnees selon mes droits.
                  const { data, error } = await supabase.rpc('project_data_for_me', { p_id: projetId });
                  if(error) throw new Error(error.message);
                  if(!data) throw new Error('projet vide');
                  donnees = (typeof data === 'string') ? JSON.parse(data) : data;
              }
          } catch(e) {
              console.warn('[Match] lecture du projet :', e && e.message);
              Utils.toast('Impossible de lire ce projet.', 'error');
              return;
          }
          const besoins = CastingMatch.besoinsDe(donnees);
          if(!besoins.length) {
              Utils.toast('Ce projet ne déclare aucun besoin. Renseigne les rôles à distribuer et les postes recherchés dans son onglet Présentation.', 'info', 7000);
              return;
          }
          CastingMatch.projet = {
              id: projetId,
              titre: (meta && meta.title) || (donnees && donnees.title) || 'Mon projet',
              donnees: donnees
          };
          CastingMatch.besoins = besoins.map(b => Object.assign({}, b, {
              candidats: CastingMatch.candidatsPour(b)
          }));
          CastingMatch.preparerPile();
          CastingMatch.ouvrirTri();
      },

      // ------------------------------------------------------------------
      //  LES BESOINS D'UN PROJET
      // ------------------------------------------------------------------
      //  Ils vivent dans l'onglet Presentation, donc ils existent meme si le
      //  projet n'est pas publie. Trois sources : les roles a distribuer, les
      //  postes standards coches, et les postes ecrits a la main.
      besoinsDe: (donnees) => {
          const out = [];
          const p = (donnees && donnees.presentation) || {};
          (p.actorNeeds || []).forEach((need, i) => {
              out.push({
                  id: 'actor:' + i, kind: 'actor',
                  poste: need.roleName || ('Rôle ' + (i + 1)),
                  label: 'Rôle de ' + (need.roleName || ('#' + (i + 1))),
                  need: need
              });
          });
          const postes = (typeof Presentation !== 'undefined' && Presentation.crewPositions) || [];
          Object.keys(p.crewNeeds || {}).forEach(posId => {
              const n = p.crewNeeds[posId];
              if(!n || !n.needed) return;
              const pos = postes.find(x => x.id === posId);
              const nom = pos ? pos.name : posId;
              out.push({
                  id: 'crew:' + posId, kind: 'crew',
                  poste: nom, label: 'Poste de ' + nom,
                  need: { role: nom, dept: pos ? pos.dept : '', count: n.count || 1 }
              });
          });
          (p.customCrewNeeds || []).forEach((n, i) => {
              if(!n || !n.name) return;
              out.push({
                  id: 'crewx:' + i, kind: 'crew',
                  poste: n.name, label: 'Poste de ' + n.name,
                  need: { role: n.name, dept: '', count: n.count || 1 }
              });
          });
          return out;
      },

      // ------------------------------------------------------------------
      //  LES CANDIDATS D'UN BESOIN
      // ------------------------------------------------------------------
      //  On note CASQUETTE PAR CASQUETTE, pas personne par personne : c'est
      //  le poste qui compte. Une meme personne peut donc sortir sur deux
      //  besoins differents — le recapitulatif la regroupera pour ne pas lui
      //  ecrire deux fois.
      candidatsPour: (besoin) => {
          const out = [];
          const ecartes = CastingMatch.ecartes(CastingMatch.projet ? CastingMatch.projet.id : '');
          const moi = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
          (Universe.allProfiles || []).forEach(profil => {
              const facets = profil.facets || {};
              (profil.visibleFacets || []).forEach(cle => {
                  const kind = PublicProfile._facetKind(cle);
                  if(besoin.kind === 'actor' && kind !== 'actor') return;
                  if(besoin.kind === 'crew' && kind !== 'crew') return;
                  const facet = PublicProfile.facetByKey(facets, cle) || {};
                  const note = (besoin.kind === 'actor')
                      ? CastingMatch.noterComedien(profil, facet, besoin.need)
                      : CastingMatch.noterTechnicien(profil, facet, besoin.need);
                  if(note.score < 20) return;
                  const identifiant = besoin.id + '|' + (profil.id || profil.email || '') + '|' + cle;
                  if(ecartes[identifiant]) return;
                  out.push({
                      cle: identifiant,
                      besoinId: besoin.id,
                      poste: besoin.poste,
                      profilId: profil.id || profil.email || '',
                      facetKey: cle,
                      nom: facet.name || profil.name || 'Sans nom',
                      photo: facet.photo || profil.photo || '',
                      ville: facet.city || profil.city || '',
                      role: facet.role || '',
                      email: (facet.contactEmail || profil.email || '').trim(),
                      estMoi: (profil.email || '').toLowerCase() === moi,
                      score: note.score,
                      raisons: note.raisons,
                      profil: profil, facet: facet
                  });
              });
          });
          // On ne se propose pas a soi-meme.
          const propres = out.filter(c => !c.estMoi);
          propres.sort((a, b) => b.score - a.score);
          return propres.slice(0, 40);
      },

      //  Un role : le genre puis la tranche d'age decident, le reste ajuste.
      //  UN CRITERE NON RENSEIGNE NE PENALISE PAS — ni du cote du projet (un
      //  role sans age cherche tous les ages), ni du cote de la personne (un
      //  profil sans age ne doit pas etre ecarte du casting).
      noterComedien: (profil, facet, need) => {
          const raisons = [];
          let score = 30;                     // socle : c'est un comedien visible
          const g = (facet.gender || profil.gender || '').toLowerCase();
          const gn = (need.gender || '').toLowerCase();
          if(gn && gn !== 'tous') {
              if(!g) { score += 5; }
              else if(g === gn) { score += 30; raisons.push('genre'); }
              else return { score: 0, raisons: [] };   // genre incompatible : on sort
          } else { score += 10; }
          const age = parseInt(profil.age || facet.age, 10) || 0;
          const min = parseInt(need.ageMin, 10) || 0;
          const max = parseInt(need.ageMax, 10) || 999;
          if(age) {
              if(age >= min && age <= max) { score += 30; raisons.push('âge'); }
              else {
                  const ecart = age < min ? min - age : age - max;
                  if(ecart <= 5) { score += 15; raisons.push('âge proche'); }
                  else if(ecart <= 10) { score += 5; }
                  else score -= 10;
              }
          } else { score += 5; }
          const eth = (profil.ethnicity || facet.ethnicity || '').toLowerCase();
          if(need.ethnicity && eth && eth === String(need.ethnicity).toLowerCase()) { score += 8; raisons.push('origine'); }
          const cheveux = (profil.hairColor || facet.hairColor || '').toLowerCase();
          if(need.hairColor && cheveux && cheveux === String(need.hairColor).toLowerCase()) { score += 5; raisons.push('cheveux'); }
          score += CastingMatch._bonusLieu(facet, profil, raisons);
          return { score: Math.max(0, Math.min(100, score)), raisons: raisons };
      },

      //  Un poste : c'est le METIER qui decide. On compare le poste cherche au
      //  role declare, dans les deux sens — « Chef Électricien » et
      //  « électricien » doivent se reconnaitre.
      noterTechnicien: (profil, facet, need) => {
          const raisons = [];
          const cherche = CastingMatch._mots(need.role || '');
          const declare = CastingMatch._mots(facet.role || '');
          if(!cherche.length || !declare.length) return { score: 0, raisons: [] };
          const communs = cherche.filter(m => declare.indexOf(m) >= 0);
          let score = 0;
          if(declare.join(' ') === cherche.join(' ')) { score = 80; raisons.push('poste exact'); }
          else if(communs.length) { score = 40 + Math.min(30, communs.length * 15); raisons.push('poste proche'); }
          else return { score: 0, raisons: [] };
          score += CastingMatch._bonusLieu(facet, profil, raisons);
          return { score: Math.max(0, Math.min(100, score)), raisons: raisons };
      },

      // Meme ville que le projet : un bonus, jamais un couperet. Le cinema se
      // fait en deplacement — ecarter sur la distance serait faux.
      _bonusLieu: (facet, profil, raisons) => {
          try {
              const villeProjet = ((CastingMatch.projet && CastingMatch.projet.donnees
                  && CastingMatch.projet.donnees.presentation
                  && CastingMatch.projet.donnees.presentation.city) || '').toLowerCase().trim();
              if(!villeProjet) return 0;
              const v = (facet.city || profil.city || '').toLowerCase().trim();
              if(v && v === villeProjet) { raisons.push('même ville'); return 10; }
          } catch(e) {}
          return 0;
      },
      _mots: (s) => String(s || '').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
          .filter(m => m.length > 3 && ['chef', 'assistant', 'directeur', 'premier'].indexOf(m) < 0),

      // ==================================================================
      //  3. LA VUE DE TRI (« tinder »)
      // ==================================================================
      //  Une pile de cartes, trois gestes : la croix ecarte, le coeur garde,
      //  le drapeau arrete la recherche et ouvre le recapitulatif.
      //  LES CARTES SONT RANGEES PAR BESOIN, pas melangees : on distribue un
      //  role, puis le suivant. Melanger obligerait a se redemander a chaque
      //  carte « pour quoi je regarde cette personne ? ».
      preparerPile: () => {
          CastingMatch.pile = [];
          CastingMatch.gardes = [];
          CastingMatch.rang = 0;
          CastingMatch.dernier = null;
          CastingMatch.besoins.forEach(b => {
              b.candidats.forEach(c => CastingMatch.pile.push(c));
          });
      },

      ouvrirTri: async () => {
          if(typeof Universe.setViewMode === 'function') await Universe.setViewMode('tri');
          CastingMatch.rendre();
      },

      rendre: () => {
          const hote = document.getElementById('universe-tri');
          if(!hote) return;
          const total = CastingMatch.pile.length;
          if(!total) {
              hote.innerHTML = '<div class="tri-vide"><div class="tri-vide-icone">🔍</div>'
                  + '<h3>Personne à proposer pour l’instant</h3>'
                  + '<p>Aucun profil public ne correspond aux besoins de ce projet. '
                  + 'La communauté grandit — réessaie dans quelque temps.</p></div>';
              return;
          }
          if(CastingMatch.rang >= total) return CastingMatch.rendreRecap();
          const c = CastingMatch.pile[CastingMatch.rang];
          const besoin = CastingMatch.besoins.find(b => b.id === c.besoinId);
          const restants = total - CastingMatch.rang;
          const couleur = c.score >= 70 ? '#22c55e' : (c.score >= 40 ? '#f59e0b' : '#94a3b8');
          const esc = Utils.escape;
          hote.innerHTML = `
            <div class="tri-entete">
              <div class="tri-besoin">${esc((besoin && besoin.label) || c.poste)}</div>
              <div class="tri-compte">${restants} profil${restants > 1 ? 's' : ''} à voir
                — ${CastingMatch.gardes.length} gardé${CastingMatch.gardes.length > 1 ? 's' : ''}</div>
            </div>
            <div class="tri-carte" id="tri-carte">
              <div class="tri-photo">${c.photo
                    ? `<img src="${Utils.safeMediaUrl(c.photo)}" alt="Photo de ${esc(c.nom)}">`
                    : (besoin && besoin.kind === 'crew' ? '🎥' : '🎭')}</div>
              <div class="tri-score" style="background:${couleur}">${c.score}%</div>
              <div class="tri-corps">
                <div class="tri-nom">${esc(c.nom)}</div>
                <div class="tri-sous">${esc(c.role || (besoin && besoin.poste) || '')}${c.ville ? ' · ' + esc(c.ville) : ''}</div>
                ${c.raisons.length ? '<div class="tri-raisons">' + c.raisons.map(r => '<span>' + esc(r) + '</span>').join('') + '</div>' : ''}
              </div>
            </div>
            <div class="tri-boutons">
              <button class="tri-btn tri-non" onclick="app.CastingMatch.ecarter()" title="Écarter ce profil">✕</button>
              <button class="tri-btn tri-retour" onclick="app.CastingMatch.annuler()" title="Annuler le dernier choix"${CastingMatch.dernier ? '' : ' disabled'}>↺</button>
              <button class="tri-btn tri-oui" onclick="app.CastingMatch.garder()" title="Garder ce profil">♥</button>
            </div>
            <button class="tri-fin" onclick="app.CastingMatch.terminer()">🏁 La recherche est finie</button>
            <div class="tri-note">Le cœur ne prévient personne : rien n’est envoyé avant le récapitulatif.</div>`;
      },

      _glisser: (sens) => {
          const carte = document.getElementById('tri-carte');
          if(carte) carte.classList.add(sens > 0 ? 'part-a-droite' : 'part-a-gauche');
          setTimeout(CastingMatch.rendre, 170);
      },

      ecarter: () => {
          const c = CastingMatch.pile[CastingMatch.rang];
          if(!c) return;
          CastingMatch.ecarter_memoire(CastingMatch.projet ? CastingMatch.projet.id : '', c.cle);
          CastingMatch.dernier = { carte: c, garde: false };
          CastingMatch.rang++;
          CastingMatch._glisser(-1);
      },

      garder: () => {
          const c = CastingMatch.pile[CastingMatch.rang];
          if(!c) return;
          if(!CastingMatch.gardes.some(g => g.cle === c.cle)) CastingMatch.gardes.push(c);
          CastingMatch.dernier = { carte: c, garde: true };
          CastingMatch.rang++;
          CastingMatch._glisser(1);
      },

      // Le geste part vite : on doit pouvoir revenir d'un cran. UN SEUL cran —
      // au-dela, on ne se souvient plus de ce qu'on annule.
      annuler: () => {
          const d = CastingMatch.dernier;
          if(!d) return;
          CastingMatch.dernier = null;
          CastingMatch.rang = Math.max(0, CastingMatch.rang - 1);
          if(d.garde) CastingMatch.gardes = CastingMatch.gardes.filter(g => g.cle !== d.carte.cle);
          else CastingMatch._retirerEcarte(d.carte.cle);
          CastingMatch.rendre();
      },
      _retirerEcarte: (cle) => {
          try {
              const id = CastingMatch.projet ? CastingMatch.projet.id : '';
              const m = CastingMatch.ecartes(id);
              delete m[cle];
              localStorage.setItem(CastingMatch._cleEcartes(id), JSON.stringify(m));
          } catch(e) {}
      },

      terminer: () => { CastingMatch.rang = CastingMatch.pile.length; CastingMatch.rendreRecap(); },

      remettreAZero: async () => {
          const ok = await ConfirmModal.show({
              title: 'Tout remettre à zéro ?',
              message: 'Les profils que vous avez écartés pour ce projet redeviendront proposables.',
              icon: '↺', confirmText: 'Remettre à zéro'
          });
          if(!ok) return;
          CastingMatch.oublierEcartes(CastingMatch.projet ? CastingMatch.projet.id : '');
          if(CastingMatch.projet) await CastingMatch.pourProjet(CastingMatch.projet.id);
      },

      // ==================================================================
      //  4. LE RECAPITULATIF ET LES TROIS MAILS
      // ==================================================================
      //  UNE PERSONNE, PAS UNE CARTE. Quelqu'un peut avoir ete garde pour deux
      //  postes : on ne lui ecrit pas deux fois, on lui ecrit une fois en
      //  nommant les deux.
      parPersonne: () => {
          const m = {};
          CastingMatch.gardes.forEach(c => {
              const k = c.profilId || c.nom;
              if(!m[k]) m[k] = { nom: c.nom, email: c.email, photo: c.photo, postes: [], cartes: [] };
              if(m[k].postes.indexOf(c.poste) < 0) m[k].postes.push(c.poste);
              m[k].cartes.push(c);
              if(!m[k].email && c.email) m[k].email = c.email;
          });
          return Object.keys(m).map(k => Object.assign({ cle: k }, m[k]));
      },

      rendreRecap: () => {
          const hote = document.getElementById('universe-tri');
          if(!hote) return;
          const gens = CastingMatch.parPersonne();
          const esc = Utils.escape;
          if(!gens.length) {
              hote.innerHTML = `<div class="tri-vide"><div class="tri-vide-icone">🏁</div>
                <h3>Recherche terminée</h3><p>Vous n’avez gardé personne.</p>
                <button class="tri-fin" onclick="app.CastingMatch.remettreAZero()">↺ Repartir de zéro</button></div>`;
              return;
          }
          hote.innerHTML = `
            <div class="tri-recap">
              <h3>🏁 ${gens.length} personne${gens.length > 1 ? 's' : ''} retenue${gens.length > 1 ? 's' : ''}</h3>
              <p class="tri-recap-sous">Pour « ${esc(CastingMatch.projet ? CastingMatch.projet.titre : '')} ».
                 Rien n’a encore été envoyé.</p>
              <div class="tri-recap-liste">
                ${gens.map((g, i) => `
                  <div class="tri-recap-ligne">
                    <div class="tri-recap-photo">${g.photo
                        ? `<img src="${Utils.safeMediaUrl(g.photo)}" alt="">` : '👤'}</div>
                    <div class="tri-recap-qui">
                      <div class="tri-recap-nom">${esc(g.nom)}</div>
                      <div class="tri-recap-postes">${g.postes.map(p => esc(p)).join(' · ')}</div>
                      ${g.email ? '' : '<div class="tri-recap-sans-mail">Pas d’adresse publique — à contacter autrement</div>'}
                    </div>
                    <div class="tri-recap-actions">
                      <button title="Inviter dans le projet" onclick="app.CastingMatch.inviter(${i})" ${g.email ? '' : 'disabled'}>➕</button>
                      <button title="Proposer le projet" onclick="app.CastingMatch.mailProjet(${i})" ${g.email ? '' : 'disabled'}>📄</button>
                      <button title="Message personnalisé" onclick="app.CastingMatch.mailPerso(${i})" ${g.email ? '' : 'disabled'}>✍️</button>
                    </div>
                  </div>`).join('')}
              </div>
              <div class="tri-recap-groupe">
                <div class="tri-recap-titre">Écrire à tout le monde d’un coup</div>
                <button onclick="app.CastingMatch.mailGroupe()">✉️ Un seul mail, tout le monde en copie cachée</button>
                <div class="tri-note">Le message personnalisé, lui, se fait forcément un par un :
                  il nomme la personne et son rôle.</div>
              </div>
              <div class="tri-recap-pied">
                <button class="tri-fin" onclick="app.CastingMatch.rang = 0; app.CastingMatch.rendre();">↩ Revenir au tri</button>
                <button class="tri-fin" onclick="app.CastingMatch.remettreAZero()">↺ Remettre à zéro</button>
              </div>
            </div>`;
      },

      // --- 1) INVITER DANS LE PROJET. Ce n'est PAS un mail : c'est une vraie
      //        invitation en attente, la meme que celle du bouton « Partager ».
      //        Elle ne donne AUCUN acces tant qu'elle n'est pas acceptee. Le
      //        mail de courtoisie part avec, par le meme envoyeur que partout
      //        ailleurs — c'est le seul des trois qui parte du serveur.
      //        ON NE REECRIT PAS UN DEUXIEME SYSTEME D'INVITATION : celui qui
      //        existe porte deja le consentement, la moderation et la fiche
      //        grisee sur le tableau de bord de l'invite.
      inviter: async (i) => {
          const g = CastingMatch.parPersonne()[i];
          if(!g || !g.email || !CastingMatch.projet) return;
          const pid = CastingMatch.projet.id;
          const titre = CastingMatch.projet.titre;
          const email = String(g.email).trim().toLowerCase();
          const ok = await ConfirmModal.show({
              title: 'Inviter ' + g.nom + ' ?',
              message: 'Une invitation en attente sera créée sur « ' + Utils.escape(titre)
                     + ' ». Elle ne donne aucun accès tant que la personne ne l\'a pas acceptée.',
              icon: '➕', confirmText: 'Inviter'
          });
          if(!ok) return;
          try {
              // Meme garde de moderation que l'invitation ordinaire.
              if(typeof Moderation !== 'undefined' && Moderation.canCommunicate && state.currentUser) {
                  const c = await Moderation.canCommunicate(state.currentUser.email, email);
                  if(c && c.allowed === false) { Utils.toast(c.reason, 'warning', 6000); return; }
              }
              const { data: deja, error: eDeja } = await supabase
                  .from('project_members').select('id')
                  .eq('project_id', pid).eq('email', email).maybeSingle();
              if(eDeja) throw eDeja;
              if(deja) { Utils.toast(g.nom + ' fait déjà partie du projet ou a déjà été invité·e.', 'info', 6000); return; }
              const { error } = await supabase.from('project_members').insert({
                  project_id: pid, email: email, role: 'editor', status: 'pending',
                  invited_by: state.currentUser ? state.currentUser.id : null,
                  invited_at: new Date().toISOString()
              });
              if(error) throw error;
              const moi = (state.currentUser && state.currentUser.email) ? state.currentUser.email.split('@')[0] : 'Quelqu\'un';
              try { await Invitations.sendEmail(email, titre, 'editor', moi, g.postes.join(', ')); } catch(e) {}
              Utils.toast('Invitation envoyée à ' + g.nom + ' — en attente de sa réponse.', 'success', 5000);
          } catch(e) {
              console.warn('[Match] invitation :', e && e.message);
              Utils.toast('L\'invitation n\'a pas pu être créée : ' + (e && e.message ? e.message : 'erreur'), 'error', 6000);
          }
      },

      // --- 2) PROPOSER LE PROJET : la fiche projet dans le corps du mail.
      mailProjet: (i) => {
          const g = CastingMatch.parPersonne()[i];
          if(!g || !g.email) return;
          const p = CastingMatch.projet || {};
          const d = (p.donnees && p.donnees.presentation) || {};
          const moi = (state.currentUser && state.currentUser.email) || '';
          const corps = [
              'Bonjour ' + g.nom + ',',
              '',
              'Je prépare « ' + (p.titre || '') + ' » et votre profil correspond à ce que je cherche'
                + (g.postes.length ? ' (' + g.postes.join(', ') + ')' : '') + '.',
              '',
              '--- LE PROJET ---',
              'Titre : ' + (p.titre || ''),
              d.genre ? 'Genre : ' + d.genre : '',
              d.format ? 'Format : ' + d.format : '',
              d.duration ? 'Durée : ' + d.duration : '',
              d.productionType ? 'Production : ' + d.productionType : '',
              d.city ? 'Lieu : ' + d.city : '',
              '',
              d.description || '',
              '',
              'Si cela vous parle, répondez-moi simplement à cette adresse.',
              '',
              'Bien à vous,',
              moi
          ].filter(l => l !== '').join('\n');
          CastingMatch._ouvrirMail(g.email, 'Proposition — ' + (p.titre || 'projet'), corps);
      },

      // --- 3) MESSAGE PERSONNALISE. Les deux champs que le developpeur a
      //        demandes — le NOM et le POSTE/PERSONNAGE — sont pre-remplis et
      //        modifiables : c'est tout l'interet d'un message a soi.
      mailPerso: async (i) => {
          const g = CastingMatch.parPersonne()[i];
          if(!g || !g.email) return;
          const nom = await ConfirmModal.show({
              title: 'Message personnalisé', icon: '✍️', type: 'prompt',
              message: 'Comment appelez-vous cette personne dans le message ?',
              inputValue: g.nom, confirmText: 'Suivant'
          });
          if(nom === null) return;
          const poste = await ConfirmModal.show({
              title: 'Message personnalisé', icon: '🎭', type: 'prompt',
              message: 'Pour quel rôle ou quel poste ?',
              inputValue: g.postes.join(', '), confirmText: 'Écrire le mail'
          });
          if(poste === null) return;
          const p = CastingMatch.projet || {};
          const moi = (state.currentUser && state.currentUser.email) || '';
          const corps = [
              'Bonjour ' + nom + ',',
              '',
              'Je vous écris au sujet de « ' + (p.titre || '') + ' ».',
              'Je pense à vous pour : ' + poste + '.',
              '',
              '',
              'Bien à vous,',
              moi
          ].join('\n');
          CastingMatch._ouvrirMail(g.email, 'À propos de « ' + (p.titre || 'mon projet') + ' »', corps);
      },

      // Un seul mail pour tout le monde, en COPIE CACHEE : personne n'a a
      // decouvrir a qui d'autre on a ecrit.
      mailGroupe: () => {
          const gens = CastingMatch.parPersonne().filter(g => g.email);
          if(!gens.length) { Utils.toast('Aucune adresse publique dans la sélection.', 'warning'); return; }
          const p = CastingMatch.projet || {};
          const moi = (state.currentUser && state.currentUser.email) || '';
          const corps = [
              'Bonjour,',
              '',
              'Je prépare « ' + (p.titre || '') + ' » et je cherche des personnes pour plusieurs postes.',
              'Si cela vous intéresse, répondez-moi simplement.',
              '',
              'Bien à vous,',
              moi
          ].join('\n');
          const lien = 'mailto:?bcc=' + encodeURIComponent(gens.map(g => g.email).join(','))
                     + '&subject=' + encodeURIComponent('Projet — ' + (p.titre || ''))
                     + '&body=' + encodeURIComponent(corps);
          window.open(lien, '_blank');
      },

      // IL N'Y A PAS D'ENVOI COTE SERVEUR, et c'est assume : le mail part de
      // VOTRE adresse, par votre logiciel de courrier. La personne vous repond
      // a vous, pas a un robot.
      _ouvrirMail: (a, sujet, corps) => {
          const lien = 'mailto:' + encodeURIComponent(a)
                     + '?subject=' + encodeURIComponent(sujet)
                     + '&body=' + encodeURIComponent(corps);
          window.open(lien, '_blank');
      }
  };
