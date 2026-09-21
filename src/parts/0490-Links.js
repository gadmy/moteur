
  const Links = {
      LABELS: {
          scene: 'Scène', character: 'Personnage', actor: 'Comédien', crew: 'Technicien',
          location: 'Décor', resource: 'Ressource', day: 'Jour de tournage',
          expense: 'Dépense', shot: 'Plan', org: 'Structure', vehicle: 'Véhicule'
      },
      ICONS: {
          scene: '🎞️', character: '👤', actor: '🎭', crew: '🎬', location: '📍',
          resource: '📦', day: '📅', expense: '💶', shot: '🎥', org: '🏛️', vehicle: '🚐'
      },
      COLL: {
          scene: 'scenes', character: 'characters', actor: 'actors', crew: 'crew',
          location: 'locations', resource: 'resources', day: 'shootingDays',
          expense: 'expenses', shot: 'shots', org: 'orgs', vehicle: 'vehicles'
      },
      kindLabel: (kind) => Links.LABELS[kind] || '',
      icon: (kind) => Links.ICONS[kind] || '🔗',
      record: (kind, id) => {
          const coll = Links.COLL[kind];
          if(!coll || !id) return null;
          return (state.data[coll] || []).find(x => x && String(x.id) === String(id)) || null;
      },
      // v601 — UNE FAMILLE QU'ON N'A PAS LE DROIT DE LIRE N'EST PAS UNE FAMILLE
      // VIDE. Le cloisonnement (v578) retire de la reponse serveur les cles
      // auxquelles on n'a pas acces, et Store.getEmpty les recree VIDES pour que
      // le reste de l'application ne plante pas. Consequence, decouverte sur un
      // vrai projet a deux : une personne qui a le Depouillement mais pas les
      // onglets Personnages, Decors et Ressources voyait TOUS les elements
      // depouilles comme « sans fiche » — et le controle lui proposait d'en
      // creer des centaines, en double de celles qui existent deja.
      // « Je ne trouve pas la fiche » et « je n'ai pas le droit de la voir »
      // sont deux choses differentes. Tout ce qui conclut a une absence doit
      // poser la question ICI d'abord.
      masquee: (kind) => {
          const coll = Links.COLL[kind];
          return !!(coll && (state.dataMissingKeys || []).indexOf(coll) >= 0);
      },
      exists: (kind, id) => !!Links.record(kind, id) || (!!id && Links.masquee(kind)),
      // Nom affichable d'un objet, quelle que soit sa famille. Les quatre cas
      // particuliers ne portent pas de champ 'name' utilisable tel quel : le
      // jour se nomme par sa date, la scene par son rang, la structure par sa
      // fiche normalisee (son nom ne vit pas toujours dans o.name — piege du
      // 25 aout), le plan par son rang DANS SA SCENE.
      label: (kind, id) => {
          const rec = Links.record(kind, id);
          if(!rec) return '';
          if(kind === 'day') {
              const i = (state.data.shootingDays || []).indexOf(rec);
              return (typeof Planning !== 'undefined' && Planning.dayLabel)
                  ? Planning.dayLabel(rec)
                  : (rec.name || ('Jour ' + (rec.dayNumber || (i + 1))));
          }
          if(kind === 'scene') {
              const i = (state.data.scenes || []).indexOf(rec);
              return '#' + (i + 1) + (rec.title ? ' — ' + String(rec.title).slice(0, 40) : '');
          }
          if(kind === 'org') {
              const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(rec) : (rec.fiche || rec);
              return (fc && fc.name) || rec.name || '';
          }
          if(kind === 'expense') return rec.title || 'Dépense';
          if(kind === 'shot') {
              const soeurs = (state.data.shots || [])
                  .filter(s => s && s.sceneId === rec.sceneId)
                  .sort((a, b) => (a.order || 0) - (b.order || 0));
              const rang = soeurs.indexOf(rec) + 1;
              return 'Plan ' + (rang > 0 ? rang : '') + (rec.name ? ' — ' + rec.name : '');
          }
          return rec.name || '';
      },
      
      // ===== VOISINS DIRECTS =====
      // Rend [{ kind, id, label, rel: [...], linked }]. UN SEUL NIVEAU : les
      // voisins du voisin ne sont pas explores. C'est volontaire — un graphe
      // complet est illisible des qu'un projet depasse la dizaine de scenes.
      neighbors: (kind, id) => {
          if(!kind || !id) return [];
          const out = [];
          const cle = (k, i, t) => k + '|' + (i == null ? ('~' + t) : i);
          const vus = {};
          const add = (k, i, rel, texte) => {
              if(!k) return;
              const lbl = (i != null) ? (Links.label(k, i) || texte || '') : (texte || '');
              if(!lbl) return;   // une cible supprimee depuis n'est pas un voisin
              const c = cle(k, i, lbl);
              if(vus[c]) { if(vus[c].rel.indexOf(rel) < 0) vus[c].rel.push(rel); return; }
              const n = { kind: k, id: (i != null ? i : null), label: lbl, rel: [rel], linked: i != null };
              vus[c] = n;
              out.push(n);
          };
          
          const scenes = state.data.scenes || [];
          const days = state.data.shootingDays || [];
          
          // --- Les cinq familles de fiche ---
          if(Links.COLL[kind] && ['character', 'actor', 'crew', 'location', 'resource'].indexOf(kind) >= 0) {
              if(!Links.exists(kind, id)) return [];
              if(typeof UI !== 'undefined' && UI.scenesForFiche) {
                  UI.scenesForFiche(kind, id).forEach(s => add('scene', s.id, 'depouillement'));
              }
              if(typeof UI !== 'undefined' && UI.shootDaysForFiche) {
                  UI.shootDaysForFiche(kind, id).forEach(d => add('day', d.id, 'planning'));
              }
              if(typeof Expenses !== 'undefined' && Expenses.linkedExpenses) {
                  Expenses.linkedExpenses(kind, id).forEach(e => add('expense', e.id, 'depense'));
              }
              // Proprietaire d'une ressource, ET SA RECIPROQUE, qui n'existait
              // nulle part : la fiche d'un comedien ne disait pas ce qu'il prete.
              if(kind === 'resource') {
                  const o = Links.record('resource', id).owner;
                  if(o && o.id && (o.type === 'actor' || o.type === 'crew')) add(o.type, o.id, 'proprietaire');
              }
              if(kind === 'actor' || kind === 'crew') {
                  (state.data.resources || []).forEach(r => {
                      if(r && r.owner && r.owner.type === kind && String(r.owner.id) === String(id)) add('resource', r.id, 'proprietaire');
                  });
              }
              // Personnage <-> comedien, dans les deux sens.
              if(kind === 'character') {
                  const c = Links.record('character', id);
                  if(c && c.actor_id) add('actor', c.actor_id, 'casting');
              }
              if(kind === 'actor') {
                  (state.data.characters || []).forEach(c => {
                      if(c && String(c.actor_id) === String(id)) add('character', c.id, 'casting');
                  });
              }
              return out;
          }
          
          // --- Une scene ---
          if(kind === 'scene') {
              const sc = Links.record('scene', id);
              if(!sc) return [];
              // Depouillement : les elements RATTACHES donnent une fiche, les
              // autres restent des voisins non rattaches (linked:false).
              Object.keys(sc.breakdown || {}).forEach(cat => {
                  const arr = sc.breakdown[cat];
                  if(!Array.isArray(arr)) return;
                  arr.forEach(it => {
                      const k = Utils.bdKind(it) || Utils.bdKindOf(cat);
                      if(!k) return;   // categorie sans cible possible (animaux, SFX...)
                      const iid = Utils.bdId(it);
                      if(iid && Links.exists(k, iid)) add(k, iid, 'depouillement');
                      else add(k, null, 'depouillement', Utils.bdText(it));
                  });
              });
              days.forEach(d => {
                  const dedans = (d.scenes || []).some(x => (typeof x === 'string' ? x : (x && x.sceneId)) === id);
                  if(dedans) add('day', d.id, 'planning');
              });
              (state.data.shots || []).forEach(s => { if(s && String(s.sceneId) === String(id)) add('shot', s.id, 'storyboard'); });
              if(typeof Expenses !== 'undefined' && Expenses.linkedExpenses) {
                  Expenses.linkedExpenses('scene', id).forEach(e => add('expense', e.id, 'depense'));
              }
              return out;
          }
          
          // --- Un jour de tournage ---
          if(kind === 'day') {
              const d = Links.record('day', id);
              if(!d) return [];
              (d.scenes || []).forEach(x => {
                  const sid = (typeof x === 'string') ? x : (x && x.sceneId);
                  if(sid) add('scene', sid, 'planning');
                  const shots = (x && x.selectedShots) || [];
                  shots.forEach(sh => add('shot', sh, 'planning'));
              });
              if(d.locationId) add('location', d.locationId, 'planning');
              (d.callSheet || []).forEach(c => {
                  if(c && c.personId && (c.type === 'actor' || c.type === 'crew')) add(c.type, c.personId, 'convocation');
              });
              if(typeof Expenses !== 'undefined' && Expenses.linkedExpenses) {
                  Expenses.linkedExpenses('day', id).forEach(e => add('expense', e.id, 'depense'));
              }
              return out;
          }
          
          // --- Une depense : sa cible, et rien d'autre (une seule par depense) ---
          if(kind === 'expense') {
              const e = Links.record('expense', id);
              if(e && e.link && e.link.k && e.link.id) add(e.link.k, e.link.id, 'depense');
              return out;
          }
          
          // --- Un plan : sa scene, et les jours qui l'ont retenu ---
          if(kind === 'shot') {
              const sh = Links.record('shot', id);
              if(!sh) return [];
              if(sh.sceneId) add('scene', sh.sceneId, 'storyboard');
              days.forEach(d => {
                  const pris = (d.scenes || []).some(x => x && typeof x === 'object'
                      && x.sceneId === sh.sceneId && (x.selectedShots || []).indexOf(sh.id) >= 0);
                  if(pris) add('day', d.id, 'planning');
              });
              return out;
          }
          
          // --- Structure et vehicule : scenes ou ils sont depouilles, et
          // depenses qui les visent ---
          if(kind === 'org' || kind === 'vehicle') {
              if(!Links.exists(kind, id)) return [];
              if(typeof UI !== 'undefined' && UI.scenesForFiche) {
                  UI.scenesForFiche(kind, id).forEach(s => add('scene', s.id, 'depouillement'));
              }
              if(typeof Expenses !== 'undefined' && Expenses.linkedExpenses) {
                  Expenses.linkedExpenses(kind, id).forEach(e => add('expense', e.id, 'depense'));
              }
              return out;
          }
          
          return out;
      },
      
      count: (kind, id) => Links.neighbors(kind, id).length,

      // ===== LECTURE FILTREE, POUR LES BLOCS DES FICHES (1er septembre) =====
      // Etape 8a, derniere marche : les trois blocs des fiches (« Apparait
      // dans », « Convoque le », « Depenses liees ») appelaient DIRECTEMENT
      // UI.scenesForFiche, UI.shootDaysForFiche et Expenses.linkedExpenses.
      // Ils passent desormais par ici. Le comportement ne change pas d'un
      // iota — le socle DELEGUE a ces memes trois lectures — mais la question
      // « a quoi cette fiche est-elle reliee ? » n'a plus qu'une seule porte
      // d'entree dans le fichier. C'etait tout l'objet du socle : ce n'est pas
      // un cache ni une couche de calcul, c'est un POINT DE PASSAGE.
      //
      // Rend les ENREGISTREMENTS et non les voisins, parce que les blocs ont
      // besoin de l'objet lui-meme pour le mettre en forme (le rang d'une
      // scene, la date d'un jour). L'ordre est celui de neighbors, qui est
      // celui des lectures d'origine : un tri ici changerait l'affichage
      // sans qu'on l'ait demande.
      //
      // ATTENTION : cette fonction ne filtre AUCUN droit. Les gardes de
      // permission restent dans les blocs, la ou elles etaient — le socle
      // repond a une question de structure, pas de confidentialite, et un
      // ecran qui oublierait sa garde en heriterait a tort.
      recordsOfKind: (kind, id, wantKind) => {
          if(!kind || !id || !wantKind) return [];
          return Links.neighbors(kind, id)
              .filter(n => n.kind === wantKind && n.linked)
              .map(n => Links.record(wantKind, n.id))
              .filter(Boolean);
      }
  };

  // ====================================================================
  // Web — LA TOILE DES LIAISONS (etape 8d, 26 aout)
  // ====================================================================
  // UNE fiche au centre, ses voisins DIRECTS autour, une couleur par famille.
  // Un clic sur un voisin le met au centre : on se deplace de proche en proche.
  //
  // PAS DE GRAPHE COMPLET, jamais : sur un long-metrage, tout afficher donne
  // une pelote illisible. Un seul niveau, c'est la regle posee dans le plan.
  //
  // AUCUNE DONNEE AJOUTEE. Cet ecran ne fait que lire Links.neighbors : il n'y
  // a rien a migrer, et le retirer un jour ne laisserait aucune trace.
  //
  // Il n'ouvre pas les fiches PAR-DESSUS lui : le bouton de la fiche centrale
  // ferme la toile puis ouvre la fiche. La lecon du 25 aout (troisieme etage
  // d'empilement, fenetre invisible sous les deux autres) a coute assez cher.
  // ============================================================
  // MOTEUR DE PLACEMENT PARTAGE (GraphPhysics)
  // ------------------------------------------------------------
  // Extrait de Web le 3 septembre, sans changer une ligne de son
  // comportement, pour que la toile du projet ET la vue en fiches des
  // cours aient EXACTEMENT le meme rendu organique. Le recopier aurait
  // garanti qu'elles divergent au premier reglage.
  //
  // Trois regles, dans cet ordre :
  //   1. chaque fiche est RAPPELEE vers son ancre, exprimee en ecart
  //      depuis le centre (deplacer le centre entraine donc toute la
  //      toile) ;
  //   2. les fiches qui se recouvrent se REPOUSSENT ;
  //   3. quand il n'y a plus de place, le chevauchement est TOLERE, de
  //      preference entre fiches d'une meme famille — la repulsion y est
  //      volontairement plus faible.
  // Ce n'est pas une grille calculee : c'est un equilibre qu'on laisse
  // se faire, ce qui permet aux fiches de SUIVRE quand on en deplace une.
  //
  // N[0] est toujours la fiche centrale.
  // ============================================================