
  const Web = {
      COLORS: {
          scene: '#e74c3c', character: '#9b59b6', actor: '#e67e22', crew: '#16a085',
          location: '#2980b9', resource: '#8e6c3f', day: '#c0392b', expense: '#27ae60',
          shot: '#607d8b', org: '#b7950b', vehicle: '#5d6d7e',
          // Le projet n'est pas une famille de fiches : c'est la racine.
          __project: '#34495e'
      },
      // ===== LA FICHE PROJET, RACINE DE LA TOILE (31 aout) =====
      // Decision de Guillaume, en reponse a la question laissee ouverte le
      // 26 aout : la toile s'ouvre sur LE PROJET et non sur la premiere scene.
      // Le projet n'est pas un enregistrement — il n'a ni collection ni id de
      // fiche — d'ou cette famille virtuelle, connue de Web seul. Links n'en
      // sait rien et n'a pas a en savoir : c'est une couche de LECTURE sur des
      // objets reels, y glisser une fiction l'aurait salie.
      // Deux etats :
      //   - racine nue        : un voisin par FAMILLE (« 30 scenes », « 6
      //                         personnages »...), chacun cliquable ;
      //   - racine + famille  : les fiches de cette famille autour du projet.
      // De la, un clic sur une fiche recentre dessus et la toile redevient
      // celle qu'on connait.
      ROOT: '__project',
      rootCenter: (family) => ({ kind: Web.ROOT, id: 'projet', family: family || null }),
      isRoot: (c) => !!c && c.kind === Web.ROOT,
      projectLabel: () => (state.data && state.data.title) ? String(state.data.title).slice(0, 60) : 'Projet sans titre',
      // Familles peuplees, dans l'ordre de lecture d'un film : ce qu'on ecrit,
      // qui le joue, ou, avec quoi, quand, combien.
      ROOT_ORDER: ['scene', 'shot', 'character', 'actor', 'crew', 'org', 'location', 'resource', 'vehicle', 'day', 'expense'],
      // Le pluriel ne s'obtient pas en collant un s : « jour de tournage » prend
      // la marque sur le premier mot.
      PLURAL: {
          scene: 'scènes', shot: 'plans', character: 'personnages', actor: 'comédiens',
          crew: 'techniciens', org: 'structures', location: 'décors', resource: 'ressources',
          vehicle: 'véhicules', day: 'jours de tournage', expense: 'dépenses'
      },
      plural: (kind, n) => (n > 1)
          ? (Web.PLURAL[kind] || (Links.kindLabel(kind).toLowerCase() + 's'))
          : Links.kindLabel(kind).toLowerCase(),
      rootFamilies: () => Web.ROOT_ORDER.filter(k => Web.allowed(k))
          .map(k => ({ kind: k, n: (state.data[Links.COLL[k]] || []).filter(x => x && x.id).length }))
          .filter(f => f.n > 0),
      openFamily: (kind) => {
          if(!kind || !Links.COLL[kind]) return;
          if(Web.center) Web.history.push(Web.center);
          Web.center = Web.rootCenter(kind);
          Web.render();
      },
      REL_LABELS: {
          depouillement: 'dépouillement', planning: 'planning', depense: 'dépense',
          proprietaire: 'propriétaire', casting: 'casting', convocation: 'convocation',
          storyboard: 'storyboard'
      },
      // Familles proposees dans le menu de depart. La depense n'y est pas : on
      // l'atteint en naviguant, en ouvrir une au hasard n'a pas de sens.
      PICKABLE: ['scene', 'character', 'actor', 'crew', 'location', 'resource', 'day', 'shot', 'org', 'vehicle'],
      MAX_NODES: 40,
      
      center: null,
      history: [],
      hidden: {},        // { famille: true } — familles masquees par les pastilles
      // Un cran de profondeur : 1 = les voisins directs, 2 = leurs propres
      // voisins, en retrait et grises. Au-dela, on retombe sur le graphe complet
      // que le plan interdit — sur un long-metrage, c'est illisible.
      depth: 1,
      MAX_LOIN: 60,      // plafond du second niveau, tous parents confondus
      MAX_PAR_PARENT: 6, // et par voisin direct
      setDepth: (n) => {
          Web.depth = (n === 2) ? 2 : 1;
          Web.render();
      },
      _onResize: null,
      
      // Une famille dont l'onglet est ferme a cette personne n'apparait pas dans
      // la toile : elle contournerait les permissions par la bande.
      allowed: (kind) => {
          if(typeof Permissions === 'undefined' || !Permissions.canAccess) return true;
          if(state.currentRole === 'owner') return true;
          const sect = { expense: 'depenses', day: 'planning', shot: 'storyboard' }[kind];
          return sect ? !!Permissions.canAccess(sect) : true;
      },
      
      open: (kind, id) => {
          if(!state.currentProjectId) { Utils.toast('Ouvre un projet pour voir sa toile.', 'info'); return; }
          Web.history = [];
          Web.hidden = {};
          Web.center = (kind && id && Links.exists(kind, id)) ? { kind, id } : Web.rootCenter();
          if(!Web.center) { Utils.toast('Ce projet ne contient encore aucune fiche à relier.', 'info'); return; }
          const old = document.getElementById('web-modal');
          if(old) old.remove();
          const wrap = document.createElement('div');
          wrap.id = 'web-modal';
          wrap.className = 'web-modal';
          wrap.innerHTML = '<div class="web-head" id="web-head"></div>'
              + '<div class="web-legend" id="web-legend"></div>'
              + '<div class="web-canvas" id="web-canvas"><svg class="web-svg" id="web-svg"></svg></div>'
              + '<div class="web-note">Un seul niveau : la fiche au centre et ses voisins directs. Clique un voisin pour le mettre au centre.</div>';
          document.body.appendChild(wrap);
          const _wc = document.getElementById('web-canvas');
          if(_wc) _wc.addEventListener('mousedown', Web.onCanvasDown);
          // Le trace depend de la taille du cadre : il faut le refaire quand la
          // fenetre change, sinon les fiches restent la ou elles etaient.
          Web._onResize = () => Web.render();
          window.addEventListener('resize', Web._onResize);
          Web.render();
      },
      // firstAvailable retiree le 31 aout : la toile s'ouvre sur la fiche
      // PROJET, plus sur la premiere scene venue. Plus personne ne l'appelait.
      close: () => {
          if(Web._onResize) { window.removeEventListener('resize', Web._onResize); Web._onResize = null; }
          const m = document.getElementById('web-modal');
          if(m) m.remove();
      },
      recenter: (kind, id) => {
          if(!kind || !id || !Links.exists(kind, id)) { Utils.toast('Fiche introuvable (supprimée depuis ?)', 'info'); return; }
          if(Web.center) Web.history.push(Web.center);
          if(Web.history.length > 40) Web.history.shift();
          Web.center = { kind, id };
          Web.render();
      },
      back: () => {
          if(!Web.history.length) return;
          Web.center = Web.history.pop();
          Web.render();
      },
      pick: (value) => {
          const i = String(value || '').indexOf('|');
          if(i < 0) return;
          const k = value.slice(0, i);
          // Le projet n'est pas une fiche : il ne passe pas par recenter, qui
          // verifie l'existence d'un enregistrement.
          if(k === Web.ROOT) {
              if(Web.center) Web.history.push(Web.center);
              Web.center = Web.rootCenter();
              Web.render();
              return;
          }
          Web.recenter(k, value.slice(i + 1));
      },
      toggleKind: (kind) => {
          Web.hidden[kind] = !Web.hidden[kind];
          Web.render();
      },
      // Ouvre la fiche centrale APRES avoir ferme la toile : jamais par-dessus.
      openCenter: () => {
          if(!Web.center) return;
          const c = Web.center;
          Web.close();
          if(typeof UI !== 'undefined' && UI.openFiche) UI.openFiche(c.kind, c.id);
      },

      // ===== CLIC DROIT SUR UNE FICHE DE LA TOILE (miroir de « Voir dans la toile ») =====
      // Deux actions : ouvrir la fenetre de fiche, ou fermer la toile et se
      // rendre sur l'onglet ou la fiche vit. Le projet-racine, les bulles de
      // famille et les elements non rattaches n'ouvrent rien : pas de menu.
      _nodeIsFiche: (n) => !!n && n.kind !== Web.ROOT && !n.famille && !!n.kind && !!n.id && n.linked !== false,
      // Onglet d'origine par famille. Memes noms que History.goToLink : les
      // onglets s'appellent 'chars' et 'locs', PAS 'characters'/'locations'.
      TAB_OF: { scene: 'board', shot: 'storyboard', character: 'chars', actor: 'actors',
                crew: 'crew', location: 'locs', resource: 'resources', day: 'planning',
                expense: 'expenses', org: 'orgs', vehicle: 'crew' },
      hideNodeMenu: () => { const m = document.getElementById('web-node-menu'); if(m) m.remove(); },
      showNodeMenu: (ev, i) => {
          const n = Web.nodes[i];
          if(!Web._nodeIsFiche(n)) return;   // projet, bulle de famille ou element non rattache : rien a ouvrir
          Web.hideNodeMenu();
          const menu = document.createElement('div');
          menu.id = 'web-node-menu';
          let left = ev.clientX, top = ev.clientY;
          if(left + 220 > window.innerWidth) left = window.innerWidth - 230;
          if(top + 130 > window.innerHeight) top = window.innerHeight - 140;
          if(left < 10) left = 10;
          if(top < 10) top = 10;
          menu.style.cssText = 'position:fixed; top:' + top + 'px; left:' + left + 'px; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); z-index:var(--z-tooltip); min-width:200px; overflow:hidden;';
          const titre = Links.label(n.kind, n.id) || n.label || '';
          menu.innerHTML =
              '<div style="padding:10px 15px; border-bottom:1px solid var(--border); font-weight:600; color:var(--text-sec); font-size:0.85rem;">' + Links.icon(n.kind) + ' ' + Utils.escape(String(titre).substring(0, 28)) + '</div>'
            + '<div class="context-menu-item" onclick="event.stopPropagation(); app.Web.hideNodeMenu(); app.Web.openNode(' + i + ');" style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px;"><span>📄</span> Ouvrir la fiche</div>'
            + '<div class="context-menu-item" onclick="event.stopPropagation(); app.Web.hideNodeMenu(); app.Web.revealInProject(' + i + ');" style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px;"><span>🗂️</span> Voir dans le projet</div>';
          document.body.appendChild(menu);
          setTimeout(() => { document.addEventListener('click', Web.hideNodeMenu, { once: true }); }, 10);
      },
      // IMPRIMER UNE FICHE, QUELLE QUE SOIT SA FAMILLE. Les exports PDF
      // existants travaillent par FAMILLE ENTIERE (tous les personnages, tous
      // les decors) : aucun ne sait sortir une fiche seule, et onze familles
      // n'en ont pas du tout. Plutot que d'en ecrire onze, on ouvre la fiche et
      // on demande au navigateur d'imprimer CETTE fenetre-la — une regle
      // d'impression masque tout le reste. Marche partout, de la meme facon.
      imprimerNode: (i) => {
          const n = Web.nodes[i];
          if(!Web._nodeIsFiche(n)) return;
          Web.openNode(i);
          // Laisser la fenetre se dessiner avant d'appeler l'impression :
          // imprimer trop tot sort une page vide.
          setTimeout(() => {
              document.body.classList.add('impression-fiche');
              const fini = () => {
                  document.body.classList.remove('impression-fiche');
                  window.removeEventListener('afterprint', fini);
              };
              window.addEventListener('afterprint', fini);
              try { window.print(); } catch(e) { fini(); }
              // Filet : certains navigateurs n'annoncent pas la fin.
              setTimeout(fini, 60000);
          }, 350);
      },

      openNode: (i) => {
          const n = Web.nodes[i];
          if(!Web._nodeIsFiche(n)) return;
          const kind = n.kind, id = n.id;
          // « Ouvrir la fiche » SANS quitter la Toile : la fenetre s'ouvre
          // PAR-DESSUS. La Toile partage le palier --z-modal avec les fenetres
          // de fiche ; on la fait passer juste en dessous (--z-overlay) pour que
          // la fiche soit visible et cliquable — sinon elle resterait cachee
          // derriere (le bug d'empilement d'aout). Web.render la remet a son
          // niveau des qu'on renavigue dans la Toile.
          const wm = document.getElementById('web-modal');
          if(wm) wm.style.setProperty('z-index', 'var(--z-overlay)');
          if(typeof UI !== 'undefined' && UI.openFiche) UI.openFiche(kind, id);
      },
      revealInProject: (i) => {
          const n = Web.nodes[i];
          if(!Web._nodeIsFiche(n)) return;
          const kind = n.kind, id = n.id, tab = Web.TAB_OF[kind];
          Web.close();
          if(tab && typeof UI !== 'undefined' && UI.switchTab) {
              UI.switchTab(tab);
              // Laisser l'onglet se rendre avant d'ouvrir la fiche : le plan et le
              // jour de tournage ont besoin de leur contexte deja affiche.
              setTimeout(() => { if(UI.openFiche) UI.openFiche(kind, id); }, 200);
          } else if(typeof UI !== 'undefined' && UI.openFiche) {
              UI.openFiche(kind, id);
          }
      },
      
      // ===== PLACEMENT (26 aout) =====
      // Trois regles, dans cet ordre :
      //   1. les fiches d'une meme famille se REGROUPENT (chaque famille a son
      //      ancre autour du centre, toutes ses fiches y sont attirees) ;
      //   2. elles se REPOUSSENT tant qu'elles se chevauchent ;
      //   3. quand il n'y a plus de place, le chevauchement est TOLERE, et de
      //      preference entre fiches d'une meme famille — la repulsion y est
      //      volontairement trois fois plus faible : mieux vaut deux scenes qui
      //      se touchent qu'une scene posee sur une depense.
      // Ce n'est pas une grille calculee : c'est un equilibre qu'on laisse se
      // faire, ce qui permet aux fiches de SUIVRE quand on en deplace une.
      NODE_W: 160, NODE_H: 62, CENTER_W: 210, CENTER_H: 84, FAR_W: 128, FAR_H: 48,
      nodes: [],
      _drag: null,
      
      layout: () => {
          const canvas = document.getElementById('web-canvas');
          if(!canvas) return;
          const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
          const cx = W / 2, cy = H / 2;
          const centre = Web.nodes[0];
          if(centre && !centre.pinned) { centre.x = cx; centre.y = cy; }
          const voisins = Web.nodes.filter(n => n.lvl === 1);
          const lointains = Web.nodes.filter(n => n.lvl === 2);
          if(!voisins.length) return;
          
          // Une part de cadran par famille, proportionnelle a son effectif : une
          // famille nombreuse a besoin de plus de tour d'horloge qu'une autre.
          const familles = [];
          voisins.forEach(n => { if(familles.indexOf(n.kind) < 0) familles.push(n.kind); });
          const parFam = {};
          voisins.forEach(n => { (parFam[n.kind] = parFam[n.kind] || []).push(n); });
          
          // ELLIPSE et non cercle : le cadre est large et peu haut, un cercle
          // laisserait les cotes vides et tasserait tout en haut et en bas.
          const rxMax = Math.max(200, cx - Web.NODE_W / 2 - 24);
          const ryMax = Math.max(130, cy - Web.NODE_H / 2 - 24);
          
          let angle = -Math.PI / 2;
          familles.forEach(k => {
              const liste = parFam[k];
              const part = 2 * Math.PI * (liste.length / voisins.length);
              // Chaque fiche a SA place dans la part de sa famille : anneau apres
              // anneau, en commencant par le plus proche du centre. Une seule
              // ancre pour toute une famille tassait vingt scenes sur un point,
              // et la repulsion n'arrivait plus a les separer.
              let pose = 0, anneau = 0;
              while(pose < liste.length) {
                  const rx = Math.min(rxMax, 210 + anneau * 92);
                  const ry = Math.min(ryMax, 140 + anneau * 82);
                  const rMoy = (rx + ry) / 2;
                  const pas = (Web.NODE_W + 18) / Math.max(1, rMoy);
                  const cap = Math.max(1, Math.floor(part / pas));
                  const n = Math.min(cap, liste.length - pose);
                  for(let i = 0; i < n; i++) {
                      const a = angle + part * ((i + 0.5) / n);
                      const nd = liste[pose + i];
                      // Ecart MEMORISE PAR RAPPORT AU CENTRE : deplacer la fiche
                      // centrale entraine mecaniquement toute la toile.
                      nd.ox = rx * Math.cos(a);
                      nd.oy = ry * Math.sin(a);
                      if(!nd.pinned) { nd.x = centre.x + nd.ox; nd.y = centre.y + nd.oy; }
                  }
                  pose += n;
                  anneau++;
              }
              angle += part;
          });
          
          // Second niveau : place DERRIERE son parent, dans le prolongement du
          // rayon qui part du centre. Chaque fiche lointaine reste ainsi du cote
          // de celle qui l'a amenee, au lieu de se meler aux voisins directs.
          const parParent = {};
          lointains.forEach(n => { (parParent[n.parent] = parParent[n.parent] || []).push(n); });
          Object.keys(parParent).forEach(pi => {
              const parent = Web.nodes[pi];
              const enfants = parParent[pi];
              const base = Math.atan2(parent.oy || 0, parent.ox || 1);
              const rayon = Math.hypot(parent.ox || 0, parent.oy || 0);
              const ouverture = Math.PI / 2.6;
              enfants.forEach((n, i) => {
                  const a = base + ouverture * ((i + 0.5) / enfants.length - 0.5);
                  const r = rayon + 132 + (i % 2) * 34;
                  n.ox = r * Math.cos(a);
                  n.oy = r * Math.sin(a) * (ryMax / Math.max(1, rxMax) < 0.75 ? 0.8 : 1);
                  if(!n.pinned) { n.x = centre.x + n.ox; n.y = centre.y + n.oy; }
              });
          });
          Web.relax(220);
      },
      
      relax: (tours) => {
          const canvas = document.getElementById('web-canvas');
          if(!canvas) return;
          // Le moteur vit desormais dans GraphPhysics, partage avec la vue en
          // fiches des cours : un seul reglage, deux toiles identiques.
          GraphPhysics.relax(Web.nodes, canvas.clientWidth || 900, canvas.clientHeight || 600, tours);
      },
      
      paint: () => {
          const svg = document.getElementById('web-svg');
          const centre = Web.nodes[0];
          if(!centre) return;
          Web.nodes.forEach(n => {
              if(!n.el) return;
              n.el.style.left = n.x + 'px';
              n.el.style.top = n.y + 'px';
          });
          if(svg) {
              svg.innerHTML = Web.nodes.slice(1).map(n => {
                  // Une fiche lointaine se raccroche a SON parent, pas au centre :
                  // sinon le trait traverserait la toile et ne dirait plus par ou
                  // passe la liaison.
                  const p = (n.lvl === 2 && Web.nodes[n.parent]) ? Web.nodes[n.parent] : centre;
                  const cls = (n.lvl === 2) ? 'web-link is-far' : 'web-link';
                  return `<line class="${cls}" x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}"></line>`;
              }).join('');
          }
      },
      
      // ===== DEPLACEMENT A LA MAIN =====
      // Toute fiche se deplace, centre compris. Celle qu'on tient est EPINGLEE
      // (elle ne repart plus vers son ancre) ; les autres se reorganisent en
      // continu, en gardant leurs regroupements. Deplacer le centre entraine
      // toute la toile, les ancres etant posees par rapport a lui.
      _sel: null,
      _clearSel: () => {
          Web._sel = null;
          const c = document.getElementById('web-canvas');
          if(c) c.querySelectorAll('.web-node.is-sel').forEach(el => el.classList.remove('is-sel'));
      },
      onCanvasDown: (e) => {
          if(e.target.closest('.web-node')) return;   // clic sur une fiche : gere par onDown
          const canvas = document.getElementById('web-canvas');
          if(!canvas) return;
          e.preventDefault();
          Web._clearSel();
          const rect = canvas.getBoundingClientRect();
          const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
          const box = document.createElement('div');
          box.className = 'web-rubber';
          canvas.appendChild(box);
          const move = (ev) => {
              const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
              box.style.left = Math.min(x0, x1) + 'px'; box.style.top = Math.min(y0, y1) + 'px';
              box.style.width = Math.abs(x1 - x0) + 'px'; box.style.height = Math.abs(y1 - y0) + 'px';
          };
          const up = (ev) => {
              const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
              const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
              box.remove();
              document.removeEventListener('mousemove', move);
              document.removeEventListener('mouseup', up);
              const sel = new Set();
              Web.nodes.forEach((n, i) => { if(i > 0 && !n.center && n.x >= l && n.x <= r && n.y >= t && n.y <= b) sel.add(i); });
              if(sel.size) {
                  Web._sel = sel;
                  sel.forEach(i => { if(Web.nodes[i] && Web.nodes[i].el) Web.nodes[i].el.classList.add('is-sel'); });
              }
          };
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
      },
      onDownGroup: (ev) => {
          const sel = Web._sel;
          if(!sel) return;
          let lastX = ev.clientX, lastY = ev.clientY;
          sel.forEach(i => { if(Web.nodes[i]) Web.nodes[i].pinned = true; });
          const move = (e2) => {
              const dx = e2.clientX - lastX, dy = e2.clientY - lastY;
              lastX = e2.clientX; lastY = e2.clientY;
              sel.forEach(i => { if(Web.nodes[i]) { Web.nodes[i].x += dx; Web.nodes[i].y += dy; } });
              Web.relax(2); Web.paint();
          };
          const up = () => {
              document.removeEventListener('mousemove', move);
              document.removeEventListener('mouseup', up);
              Web.relax(40); Web.paint();
          };
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
      },
      onDown: (ev, i) => {
          const n = Web.nodes[i];
          if(!n) return;
          // Bouton droit : reserve au menu contextuel (voir onNodeContext), il ne
          // doit ni recentrer ni deplacer.
          if(ev.button === 2) return;
          ev.preventDefault();
          if(!n.center && Web._sel && Web._sel.size > 1 && Web._sel.has(i)) { Web.onDownGroup(ev); return; }
          Web._clearSel();
          Web._drag = { i, dx: n.x - ev.clientX, dy: n.y - ev.clientY, bouge: false };
          if(n.el) n.el.style.zIndex = '20';
          document.addEventListener('mousemove', Web.onMove);
          document.addEventListener('mouseup', Web.onUp);
      },
      onMove: (ev) => {
          const d = Web._drag;
          if(!d) return;
          const n = Web.nodes[d.i];
          const nx = ev.clientX + d.dx, ny = ev.clientY + d.dy;
          if(!d.bouge && (Math.abs(nx - n.x) > 3 || Math.abs(ny - n.y) > 3)) d.bouge = true;
          n.x = nx; n.y = ny;
          if(!n.center) n.pinned = true;
          // Deux tours par image : assez pour que les autres suivent, pas assez
          // pour qu'elles sautent d'un coup a leur nouvelle place.
          Web.relax(2);
          Web.paint();
      },
      onUp: () => {
          const d = Web._drag;
          document.removeEventListener('mousemove', Web.onMove);
          document.removeEventListener('mouseup', Web.onUp);
          Web._drag = null;
          if(!d) return;
          const n = Web.nodes[d.i];
          if(n && n.el) n.el.style.zIndex = '';
          if(!d.bouge) {
              // Un clic sans deplacement reste un clic : on recentre.
              // Sur une bulle de FAMILLE, il n'y a pas de fiche a mettre au
              // centre — on descend d'un cran dans la racine.
              if(n && !n.center && n.famille) { Web.openFamily(n.famille); return; }
              if(n && !n.center && n.linked) Web.recenter(n.kind, n.id);
              return;
          }
          Web.relax(40);
          Web.paint();
      },
      // Remet chaque fiche a sa place calculee : la seule facon de rattraper
      // une toile qu'on a trop malmenee.
      reset: () => {
          Web.nodes.forEach(n => { n.pinned = false; });
          if(Web.nodes[0]) Web.nodes[0].pinned = false;
          Web.layout();
          Web.paint();
      },
      
      render: () => {
          const canvas = document.getElementById('web-canvas');
          const svg = document.getElementById('web-svg');
          if(!canvas || !svg || !Web.center) return;
          // Si une fiche a ete ouverte PAR-DESSUS la Toile (openNode l'abaisse
          // sous le palier modal), on la remet a son niveau des qu'on renavigue.
          const _wm = document.getElementById('web-modal'); if(_wm) _wm.style.zIndex = '';
          Web._sel = null;
          const esc = Utils.escape;
          const c = Web.center;
          
          // --- en-tete : retour, menu de depart, ouverture de la fiche ---
          const head = document.getElementById('web-head');
          const racine = Web.isRoot(c);
          if(head) {
              // Le projet ouvre le menu : c'est le point de depart, il doit etre
              // joignable d'un geste depuis n'importe quelle fiche.
              let opts = `<option value="${Web.ROOT}|projet"${racine && !c.family ? ' selected' : ''}>🎬 ${esc(Web.projectLabel())}</option>`;
              Web.PICKABLE.forEach(k => {
                  if(!Web.allowed(k)) return;
                  const arr = (state.data[Links.COLL[k]] || []).filter(x => x && x.id);
                  if(!arr.length) return;
                  const items = arr.map(x => {
                      const lbl = Links.label(k, x.id);
                      if(!lbl) return '';
                      const v = k + '|' + x.id;
                      const sel = (k === c.kind && String(x.id) === String(c.id)) ? ' selected' : '';
                      return `<option value="${esc(v)}"${sel}>${esc(lbl.slice(0, 60))}</option>`;
                  }).filter(Boolean).join('');
                  if(items) opts += `<optgroup label="${esc(Links.icon(k) + ' ' + Links.kindLabel(k))}">${items}</optgroup>`;
              });
              head.innerHTML = `<h3>🕸️ Toile des liaisons</h3>
                  <button onclick="app.Web.back()" ${Web.history.length ? '' : 'disabled'} title="Revenir à la fiche précédente">↩️ Retour</button>
                  <select onchange="app.Web.pick(this.value)" title="Choisir la fiche à mettre au centre">${opts}</select>
                  <button onclick="app.Web.setDepth(${Web.depth === 2 ? 1 : 2})" ${racine ? 'disabled' : ''} title="${Web.depth === 2 ? 'Ne montrer que les voisins directs' : 'Montrer aussi les voisins des voisins, en retrait'}">${Web.depth === 2 ? '🔎 Niveau 2' : '🔍 Niveau 1'}</button>
                  <button onclick="app.Web.openCenter()" ${racine ? 'disabled title="Le projet n\'est pas une fiche"' : 'title="Ouvrir la fiche centrale (ferme la toile)"'}>📄 Ouvrir la fiche</button>
                  <button onclick="app.Web.reset()" title="Remettre les fiches à leur place calculée">🔄 Ranger</button>
                  <button onclick="app.Web.close()" style="margin-left:auto;">✕ Fermer</button>`;
          }
          
          // --- voisins, filtres de famille ---
          // Trois sources possibles selon ce qui est au centre. Les deux
          // premieres sont propres a la racine et ne passent pas par Links :
          // une famille n'est pas un objet, et la liste d'une famille est une
          // simple lecture de sa collection, pas une relation.
          let tous;
          if(racine && !c.family) {
              tous = Web.rootFamilies().map(f => ({
                  kind: f.kind, id: null, famille: f.kind, n: f.n, linked: true,
                  label: f.n + ' ' + Web.plural(f.kind, f.n),
                  rel: []
              }));
          } else if(racine) {
              tous = (state.data[Links.COLL[c.family]] || []).filter(x => x && x.id).map(x => ({
                  kind: c.family, id: x.id, linked: true,
                  label: Links.label(c.family, x.id) || '(sans nom)', rel: []
              }));
          } else {
              tous = Links.neighbors(c.kind, c.id).filter(n => Web.allowed(n.kind));
          }
          const parFamille = {};
          tous.forEach(n => { parFamille[n.kind] = (parFamille[n.kind] || 0) + 1; });
          const legend = document.getElementById('web-legend');
          if(legend) {
              if(racine && !c.family) {
                  // Une pastille par famille repeterait exactement les bulles :
                  // on met une consigne a la place.
                  legend.innerHTML = '<span style="font-size:0.75rem; color:var(--text-sec);">Clique une famille pour voir ses fiches, puis une fiche pour partir de là.</span>';
              } else {
              const chips = Object.keys(parFamille).map(k => {
                  const off = Web.hidden[k] ? ' is-off' : '';
                  return `<span class="web-chip${off}" onclick="app.Web.toggleKind('${k}')" title="Afficher ou masquer cette famille">
                              <span class="web-chip-dot" style="background:${Web.COLORS[k] || '#999'}"></span>
                              ${esc(Links.kindLabel(k))} (${parFamille[k]})
                          </span>`;
              }).join('');
              legend.innerHTML = chips || '<span style="font-size:0.75rem; color:var(--text-sec);">Aucune liaison sur cette fiche.</span>';
              }
          }
          
          let vus = tous.filter(n => !Web.hidden[n.kind]);
          const tropNombreux = vus.length > Web.MAX_NODES;
          if(tropNombreux) vus = vus.slice(0, Web.MAX_NODES);
          
          // --- fabrication des fiches, puis placement ---
          const centreLbl = racine
              ? (c.family ? (Web.plural(c.family, 2).charAt(0).toUpperCase() + Web.plural(c.family, 2).slice(1)) + ' — ' + Web.projectLabel() : Web.projectLabel())
              : (Links.label(c.kind, c.id) || '(sans nom)');
          Web.nodes = [{ center: true, lvl: 0, kind: c.kind, id: c.id, label: centreLbl, linked: true,
                         w: Web.CENTER_W, h: Web.CENTER_H, x: 0, y: 0, pinned: false }]
              .concat(vus.map(v => ({
                  center: false, lvl: 1, kind: v.kind, id: v.id, famille: v.famille || null,
                  label: v.label, linked: v.linked,
                  rel: (v.rel || []).map(r => Web.REL_LABELS[r] || r).join(', '),
                  w: Web.NODE_W, h: Web.NODE_H, x: 0, y: 0, pinned: false
              })));
          
          // --- second niveau, si demande ---
          // Les voisins DES voisins. Deja vus (le centre, un voisin direct, un
          // voisin de niveau 2 partage) : on ne les redessine pas, on rattache
          // simplement le trait au premier parent rencontre. Sans cette regle,
          // deux voisins qui se connaissent produiraient chacun une copie de
          // l'autre en niveau 2.
          if(Web.depth === 2 && !racine) {
              const connus = {};
              Web.nodes.forEach(n => { if(n.id) connus[n.kind + '|' + n.id] = true; });
              let poses = 0;
              Web.nodes.filter(n => n.lvl === 1 && n.linked).forEach((parent, pi) => {
                  if(poses >= Web.MAX_LOIN) return;
                  const iParent = Web.nodes.indexOf(parent);
                  let pris = 0;
                  Links.neighbors(parent.kind, parent.id).forEach(v => {
                      if(poses >= Web.MAX_LOIN || pris >= Web.MAX_PAR_PARENT) return;
                      if(!v.linked || !Web.allowed(v.kind) || Web.hidden[v.kind]) return;
                      const k = v.kind + '|' + v.id;
                      if(connus[k]) return;
                      connus[k] = true;
                      pris++; poses++;
                      Web.nodes.push({
                          center: false, lvl: 2, parent: iParent, kind: v.kind, id: v.id,
                          label: v.label, linked: true,
                          rel: v.rel.map(r => Web.REL_LABELS[r] || r).join(', '),
                          w: Web.FAR_W, h: Web.FAR_H, x: 0, y: 0, pinned: false
                      });
                  });
              });
          }
          Web.layout();
          
          canvas.querySelectorAll('.web-node, .web-empty').forEach(el => el.remove());
          // v601 — LES TROIS ACTIONS D'UNE FICHE, au survol. Elles etaient
          // cachees dans un menu au clic droit ; le clic droit sert maintenant a
          // RECULER. Elles arretent la propagation : sans cela, cliquer
          // « Imprimer » recentrerait aussi la toile sur la fiche.
          // La fabrique est sortie de la boucle pour servir AUSSI la fiche du
          // centre : elle en est une, elle doit avoir les memes boutons.
          const actionsDe = (n, i) => {
              if(!Web._nodeIsFiche(n)) return '';
              return `<div class="web-node-actions">
                        <button class="web-node-btn" title="Imprimer cette fiche" onmousedown="event.stopPropagation();" onclick="event.stopPropagation(); app.Web.imprimerNode(${i});">🖨️</button>
                        <button class="web-node-btn" title="Ouvrir la fiche" onmousedown="event.stopPropagation();" onclick="event.stopPropagation(); app.Web.openNode(${i});">📄</button>
                        <button class="web-node-btn" title="Voir dans le projet" onmousedown="event.stopPropagation();" onclick="event.stopPropagation(); app.Web.revealInProject(${i});">📍</button>
                     </div>`;
          };
          const html = Web.nodes.map((n, i) => {
              const col = Web.COLORS[n.kind] || '#999';
              // Le centre de la racine ne porte pas de nom de famille : ce
              // n'est pas une fiche, c'est le film.
              const tete = (n.center && racine)
                  ? `<div class="web-node-kind">🎬 Projet</div><div class="web-node-label">${esc(n.label)}</div>`
                  : `<div class="web-node-kind">${Links.icon(n.kind)} ${esc(Links.kindLabel(n.kind))}</div>
                            <div class="web-node-label">${esc(n.label)}</div>`;
              if(n.center) {
                  const actC = actionsDe(n, i);
                  const tC = racine ? 'Le projet — point de départ de la toile' : 'Fiche au centre — déplaçable';
                  return actC
                      ? `<div class="web-node is-center a-actions" data-i="${i}" style="--c:${col}" title="${tC}"><div class="web-node-inner">${tete}</div>${actC}</div>`
                      : `<div class="web-node is-center" data-i="${i}" style="--c:${col}" title="${tC}">${tete}</div>`;
              }
              if(n.famille) {
                  // Bulle de famille : « 30 scènes ». Elle n'ouvre pas de fiche,
                  // elle DESCEND d'un cran dans la toile.
                  return `<div class="web-node" data-i="${i}" style="--c:${col}" title="Voir les ${esc(Web.plural(n.famille, 2))} du projet">
                              <div class="web-node-kind">${Links.icon(n.famille)} ${esc(Links.kindLabel(n.famille))}</div>
                              <div class="web-node-label">${esc(n.label)}</div>
                          </div>`;
              }
              if(n.lvl === 2) {
                  // Second niveau : grise, plus petit, et DESSOUS — il donne le
                  // contexte, il ne doit pas disputer la lecture aux voisins
                  // directs. Cliquable quand meme : c'est la facon la plus
                  // rapide d'aller sauter dessus.
                  return `<div class="web-node is-far" data-i="${i}" style="--c:${col}" title="Voisin de ${esc(Links.label(Web.nodes[n.parent].kind, Web.nodes[n.parent].id) || '')} — clic : mettre au centre">
                              <div class="web-node-label">${esc(n.label)}</div>
                          </div>`;
              }
              if(!n.linked) {
                  // Element depouille sans fiche derriere : il compte dans le
                  // film, mais il n'y a rien a ouvrir. Trait pointille.
                  return `<div class="web-node is-loose" data-i="${i}" style="--c:${col}" title="Élément non rattaché à une fiche">
                              ${tete}<div class="web-node-rel">non rattaché</div>
                          </div>`;
              }
              // v601 — LES TROIS ACTIONS SORTENT DU CLIC DROIT. Elles etaient
              // cachees dans un menu contextuel : personne ne pense a faire un
              // clic droit sur une toile ou l'on navigue au clic gauche. Elles
              // apparaissent maintenant au SURVOL de la fiche, et le clic droit
              // est rendu a la navigation — reculer, symetrique du clic gauche
              // qui avance.
              // Ces boutons arretent la propagation : sans cela, cliquer
              // « Imprimer » recentrerait aussi la toile sur la fiche.
              const actions = actionsDe(n, i);
              // v601 — LES BOUTONS PASSENT AU-DESSUS DE LA FICHE. Ils sont poses
              // sur le bord haut, or la pastille coupe ce qui depasse (c'est ce
              // qui garde les longs noms dans leur cadre) : ils arrivaient donc
              // tranches en deux. On deplace la coupe d'un cran vers l'interieur
              // — un enveloppe qui ne contient QUE le texte — et la pastille
              // laisse desormais sortir ses boutons.
              if(!actions) {
                  return `<div class="web-node" data-i="${i}" style="--c:${col}" title="Clic : mettre au centre — clic droit : revenir en arrière">
                              ${tete}<div class="web-node-rel">${esc(n.rel)}</div>
                          </div>`;
              }
              return `<div class="web-node a-actions" data-i="${i}" style="--c:${col}" title="Clic : mettre au centre — clic droit : revenir en arrière">
                          <div class="web-node-inner">${tete}<div class="web-node-rel">${esc(n.rel)}</div></div>${actions}
                      </div>`;
          }).join('');
          canvas.insertAdjacentHTML('beforeend', html);
          // Reculer marche aussi en cliquant droit dans le VIDE : on ne vise pas
          // une pastille quand on veut revenir en arriere.
          if(!canvas._reculBranche) {
              canvas._reculBranche = true;
              canvas.addEventListener('contextmenu', (ev) => { ev.preventDefault(); Web.back(); });
          }
          
          // Les gestionnaires sont poses en JS et non en attribut : le clic et
          // le glisser partagent le meme geste, seul le deplacement les separe.
          canvas.querySelectorAll('.web-node').forEach(el => {
              const i = parseInt(el.dataset.i, 10);
              if(isNaN(i) || !Web.nodes[i]) return;
              Web.nodes[i].el = el;
              el.addEventListener('mousedown', (ev) => Web.onDown(ev, i));
              // v601 : le clic droit ne montre plus de menu, il RECULE. Le geste
              // est desormais symetrique — gauche pour avancer, droit pour
              // revenir — ce qui est la seule chose qu'on fait vraiment ici.
              el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); Web.back(); });
          });
          Web.paint();
          
          if(!vus.length) {
              const vide = racine
                  ? 'Ce projet ne contient encore aucune fiche. Crée une scène, un personnage ou un décor et la toile se remplira.'
                  : (tous.length
                      ? 'Toutes les familles sont masquées : reclique une pastille au-dessus pour les faire revenir.'
                      : 'Cette fiche n\'est reliée à rien pour l\'instant. Elle le sera dès qu\'elle sera dépouillée dans une scène, convoquée un jour de tournage ou visée par une dépense.');
              canvas.insertAdjacentHTML('beforeend', `<div class="web-empty">${vide}</div>`);
          }
          
          const note = document.querySelector('#web-modal .web-note');
          if(note) {
              note.textContent = tropNombreux
                  ? `Trop de liaisons pour un seul écran : ${Web.MAX_NODES} affichées sur ${tous.length}. Masque une famille avec les pastilles ci-dessus pour voir le reste.`
                  : (racine && !c.family
                      ? 'Le projet et ses familles de fiches. Clique une famille pour l\'ouvrir.'
                      : (racine
                          ? 'Toutes les fiches de cette famille. Clique-en une pour partir de l\u00e0 — ↩️ Retour ramène au projet.'
                          : 'Clique une fiche pour la mettre au centre, glisse-la pour la déplacer — les autres suivent en restant groupées par famille.'));
          }
      }
  };