
  const CoursesWeb = {
      COLORS: {
          racine: '#34495e', scenario: '#e74c3c', realisation: '#9b59b6',
          image: '#2980b9', son: '#16a085', montage: '#e67e22',
          production: '#27ae60', glossaire: '#b7950b'
      },
      ICONS: {
          scenario: '📝', realisation: '🎬', image: '📷', son: '🎤',
          montage: '✂️', production: '💼', glossaire: '📖'
      },
      ORDER: ['scenario', 'realisation', 'image', 'son', 'montage', 'production', 'glossaire'],

      NODE_W: 160, NODE_H: 62, CENTER_W: 210, CENTER_H: 84,
      center: null,      // null = racine « Cinema », sinon la cle du chapitre
      nodes: [],
      _sections: {},     // cache : { chapitre: [ {titre, html} ] }
      _drag: null,
      _onResize: null,

      // ---- decoupage du contenu en sections ----
      // Les six chapitres sont decoupes sur leurs titres <h3> ; le glossaire
      // sur ses blocs .courses-term, qui sont ses entrees.
      sections: (chap) => {
          if(CoursesWeb._sections[chap]) return CoursesWeb._sections[chap];
          const bac = document.createElement('div');
          bac.innerHTML = (Courses.getCourses()[chap] || '');
          const out = [];
          if(chap === 'glossaire') {
              bac.querySelectorAll('.courses-term').forEach(t => {
                  const dt = t.querySelector('dt');
                  if(dt) out.push({ titre: dt.textContent.trim(), html: t.outerHTML });
              });
          } else {
              bac.querySelectorAll('h3').forEach(h => {
                  let html = h.outerHTML;
                  let n = h.nextElementSibling;
                  while(n && n.tagName !== 'H3' && n.tagName !== 'H2') { html += n.outerHTML; n = n.nextElementSibling; }
                  out.push({ titre: h.textContent.trim(), html: html });
              });
          }
          CoursesWeb._sections[chap] = out;
          return out;
      },

      open: () => {
          CoursesWeb.center = null;
          const old = document.getElementById('cw-modal');
          if(old) old.remove();
          const wrap = document.createElement('div');
          wrap.id = 'cw-modal';
          wrap.className = 'web-modal';
          wrap.innerHTML = '<div class="web-head" id="cw-head"></div>'
              + '<div class="web-canvas" id="cw-canvas"><svg class="web-svg" id="cw-svg"></svg></div>'
              + '<div class="web-note" id="cw-note"></div>';
          document.body.appendChild(wrap);
          CoursesWeb._onResize = () => CoursesWeb.render();
          window.addEventListener('resize', CoursesWeb._onResize);
          CoursesWeb._key = (e) => {
              if(e.key !== 'Escape') return;
              if(document.getElementById('cw-read')) { CoursesWeb.closeRead(); return; }
              if(CoursesWeb.center) { CoursesWeb.back(); return; }
              CoursesWeb.close();
          };
          document.addEventListener('keydown', CoursesWeb._key, true);
          CoursesWeb.render();
      },
      close: () => {
          if(CoursesWeb._onResize) { window.removeEventListener('resize', CoursesWeb._onResize); CoursesWeb._onResize = null; }
          if(CoursesWeb._key) { document.removeEventListener('keydown', CoursesWeb._key, true); CoursesWeb._key = null; }
          const m = document.getElementById('cw-modal');
          if(m) m.remove();
          CoursesWeb.closeRead();
      },
      goChapter: (chap) => { CoursesWeb.center = chap; CoursesWeb.render(); },
      back: () => { CoursesWeb.center = null; CoursesWeb.render(); },

      // ---- lecture d'une section, par-dessus la toile ----
      // Meme geste que « Ouvrir la fiche » : on lit, on ferme, on revient
      // exactement la ou on etait.
      read: (chap, i) => {
          const s = CoursesWeb.sections(chap)[i];
          if(!s) return;
          CoursesWeb.closeRead();
          const ov = document.createElement('div');
          ov.id = 'cw-read';
          ov.className = 'cw-read-ov';
          ov.innerHTML = '<div class="cw-read-box" style="--c:' + (CoursesWeb.COLORS[chap] || '#999') + '">'
              + '<div class="cw-read-head"><span>' + (CoursesWeb.ICONS[chap] || '') + ' ' + Utils.escape(Courses.LABELS[chap] || chap) + '</span>'
              + '<button class="cw-read-x" aria-label="Fermer">&times;</button></div>'
              + '<div class="cw-read-body courses-section">' + s.html + '</div>'
              + '<div class="cw-read-foot">'
                  + '<button id="cw-read-prev">Section précédente</button>'
                  + '<button id="cw-read-next">Section suivante</button>'
              + '</div>'
          + '</div>';
          document.body.appendChild(ov);
          const liste = CoursesWeb.sections(chap);
          const prev = ov.querySelector('#cw-read-prev'), next = ov.querySelector('#cw-read-next');
          prev.disabled = (i === 0);
          next.disabled = (i >= liste.length - 1);
          prev.addEventListener('click', () => CoursesWeb.read(chap, i - 1));
          next.addEventListener('click', () => CoursesWeb.read(chap, i + 1));
          ov.addEventListener('click', (e) => {
              if(e.target === ov || (e.target.classList && e.target.classList.contains('cw-read-x'))) CoursesWeb.closeRead();
          });
          // Les mots soulignes gardent leurs infobulles ici aussi.
          try { Courses.initNotions(); } catch (e) {}
      },
      closeRead: () => {
          const r = document.getElementById('cw-read');
          if(r) r.remove();
      },

      // ---- placement : le MEME que la toile des liaisons ----
      // Anneaux a distance FIXE du centre (210 px, puis +92 par anneau), pas
      // une ellipse qui remplit l'ecran : c'est ce qui gardait les fiches
      // colles a leur fiche maitresse. Puis on laisse le moteur partage
      // detendre l'ensemble, exactement comme dans la toile du projet.
      layout: () => {
          const canvas = document.getElementById('cw-canvas');
          if(!canvas) return;
          const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
          const cx = W / 2, cy = H / 2;
          const centre = CoursesWeb.nodes[0];
          if(!centre) return;
          if(!centre.pinned) { centre.x = cx; centre.y = cy; }
          const tour = CoursesWeb.nodes.slice(1);
          if(!tour.length) return;

          // Bornes du cadre : on ne s'ecarte jamais au-dela.
          const rxMax = Math.max(200, cx - CoursesWeb.NODE_W / 2 - 24);
          const ryMax = Math.max(130, cy - CoursesWeb.NODE_H / 2 - 24);

          // Anneau apres anneau, en commencant par le plus proche du centre.
          // Le nombre de places d'un anneau se deduit de la largeur d'une fiche
          // rapportee a son rayon moyen : un anneau ne se remplit jamais au
          // point que deux fiches se recouvrent des le depart.
          let pose = 0, anneau = 0;
          while(pose < tour.length) {
              const rx = Math.min(rxMax, 210 + anneau * 92);
              const ry = Math.min(ryMax, 140 + anneau * 82);
              const rMoy = (rx + ry) / 2;
              const pas = (CoursesWeb.NODE_W + 18) / Math.max(1, rMoy);
              const cap = Math.max(1, Math.floor((2 * Math.PI) / pas));
              const n = Math.min(cap, tour.length - pose);
              for(let i = 0; i < n; i++) {
                  // Demi-pas de decalage d'un anneau a l'autre, sinon les fiches
                  // s'alignent radialement et le second anneau se cache derriere
                  // le premier.
                  const a = -Math.PI / 2 + 2 * Math.PI * ((i + (anneau % 2) * 0.5) / n);
                  const nd = tour[pose + i];
                  // Ecart MEMORISE PAR RAPPORT AU CENTRE : deplacer la fiche
                  // centrale entraine mecaniquement toute la toile.
                  nd.ox = rx * Math.cos(a);
                  nd.oy = ry * Math.sin(a);
                  if(!nd.pinned) { nd.x = centre.x + nd.ox; nd.y = centre.y + nd.oy; }
              }
              pose += n;
              anneau++;
          }
          CoursesWeb.relax(220);
      },

      relax: (tours) => {
          const canvas = document.getElementById('cw-canvas');
          if(!canvas) return;
          GraphPhysics.relax(CoursesWeb.nodes, canvas.clientWidth || 900, canvas.clientHeight || 600, tours);
      },

      paint: () => {
          const svg = document.getElementById('cw-svg');
          const centre = CoursesWeb.nodes[0];
          if(!centre) return;
          CoursesWeb.nodes.forEach(n => {
              if(!n.el) return;
              n.el.style.left = n.x + 'px';
              n.el.style.top = n.y + 'px';
          });
          if(svg) {
              svg.innerHTML = CoursesWeb.nodes.slice(1)
                  .map(n => `<line class="web-link" x1="${centre.x}" y1="${centre.y}" x2="${n.x}" y2="${n.y}"></line>`)
                  .join('');
          }
      },

      // ---- deplacement a la main, comme dans la toile ----
      onDown: (ev, i) => {
          const n = CoursesWeb.nodes[i];
          if(!n) return;
          ev.preventDefault();
          CoursesWeb._drag = { i, dx: n.x - ev.clientX, dy: n.y - ev.clientY, bouge: false };
          if(n.el) n.el.style.zIndex = '20';
          document.addEventListener('mousemove', CoursesWeb.onMove);
          document.addEventListener('mouseup', CoursesWeb.onUp);
      },
      onMove: (ev) => {
          const d = CoursesWeb._drag;
          if(!d) return;
          const n = CoursesWeb.nodes[d.i];
          const nx = ev.clientX + d.dx, ny = ev.clientY + d.dy;
          if(!d.bouge && (Math.abs(nx - n.x) > 3 || Math.abs(ny - n.y) > 3)) d.bouge = true;
          n.x = nx; n.y = ny;
          if(!n.center) n.pinned = true;
          // Deux tours par image : assez pour que les autres suivent, pas assez
          // pour qu'elles sautent d'un coup a leur nouvelle place. Deplacer le
          // centre entraine toute la toile, les ancres etant posees par rapport
          // a lui — c'est le moteur qui s'en charge, pas un calcul a part.
          CoursesWeb.relax(2);
          CoursesWeb.paint();
      },
      onUp: () => {
          const d = CoursesWeb._drag;
          document.removeEventListener('mousemove', CoursesWeb.onMove);
          document.removeEventListener('mouseup', CoursesWeb.onUp);
          CoursesWeb._drag = null;
          if(!d) return;
          const n = CoursesWeb.nodes[d.i];
          if(n && n.el) n.el.style.zIndex = '';
          if(!d.bouge) {
              // Un clic sans deplacement reste un clic.
              if(!n || n.center) return;
              if(n.i === undefined) CoursesWeb.goChapter(n.chapitre);
              else CoursesWeb.read(n.chapitre, n.i);
              return;
          }
          CoursesWeb.relax(40);
          CoursesWeb.paint();
      },
      reset: () => {
          CoursesWeb.nodes.forEach(n => { n.pinned = false; });
          CoursesWeb.layout();
          CoursesWeb.paint();
      },

      render: () => {
          const canvas = document.getElementById('cw-canvas');
          if(!canvas) return;
          const esc = Utils.escape;
          const chap = CoursesWeb.center;
          const racine = !chap;

          const head = document.getElementById('cw-head');
          if(head) {
              const opts = '<option value=""' + (racine ? ' selected' : '') + '>🎬 Cinéma</option>'
                  + CoursesWeb.ORDER.map(k =>
                      '<option value="' + k + '"' + (k === chap ? ' selected' : '') + '>'
                      + CoursesWeb.ICONS[k] + ' ' + esc(Courses.LABELS[k] || k) + '</option>').join('');
              head.innerHTML = '<h3>🕸️ Cours en fiches</h3>'
                  + '<button onclick="app.CoursesWeb.back()"' + (racine ? ' disabled' : '') + ' title="Revenir au centre">↩️ Retour</button>'
                  + '<select onchange="app.CoursesWeb.pick(this.value)" title="Aller à un chapitre">' + opts + '</select>'
                  + '<button onclick="app.CoursesWeb.reset()" title="Remettre les fiches à leur place calculée">🔄 Ranger</button>'
                  + '<button onclick="app.CoursesWeb.close()" style="margin-left:auto;">✕ Fermer</button>';
          }

          // --- fabrication des fiches ---
          const colC = racine ? CoursesWeb.COLORS.racine : (CoursesWeb.COLORS[chap] || '#999');
          CoursesWeb.nodes = [{
              center: true, label: racine ? 'Cinéma' : (Courses.LABELS[chap] || chap),
              kindLabel: racine ? '🎓 Les cours' : (CoursesWeb.ICONS[chap] + ' Chapitre'),
              col: colC, w: CoursesWeb.CENTER_W, h: CoursesWeb.CENTER_H, x: 0, y: 0, pinned: false
          }];
          if(racine) {
              CoursesWeb.ORDER.forEach(k => {
                  const n = CoursesWeb.sections(k).length;
                  CoursesWeb.nodes.push({
                      center: false, chapitre: k, kind: k, label: Courses.LABELS[k] || k,
                      kindLabel: CoursesWeb.ICONS[k] + ' Chapitre',
                      rel: n + (k === 'glossaire' ? ' termes' : ' sections'),
                      col: CoursesWeb.COLORS[k] || '#999',
                      w: CoursesWeb.NODE_W, h: CoursesWeb.NODE_H, x: 0, y: 0, pinned: false
                  });
              });
          } else {
              CoursesWeb.sections(chap).forEach((s, i) => {
                  CoursesWeb.nodes.push({
                      center: false, chapitre: chap, kind: chap, i: i, label: s.titre,
                      kindLabel: chap === 'glossaire' ? '📖 Terme' : '📄 Section',
                      rel: 'lire', col: CoursesWeb.COLORS[chap] || '#999',
                      w: CoursesWeb.NODE_W, h: CoursesWeb.NODE_H, x: 0, y: 0, pinned: false
                  });
              });
          }
          CoursesWeb.layout();

          canvas.querySelectorAll('.web-node').forEach(el => el.remove());
          const html = CoursesWeb.nodes.map((n, i) => {
              const tete = '<div class="web-node-kind">' + n.kindLabel + '</div>'
                  + '<div class="web-node-label">' + esc(n.label) + '</div>';
              if(n.center) return '<div class="web-node is-center" data-i="' + i + '" style="--c:' + n.col + '" title="Déplaçable">' + tete + '</div>';
              const t = (n.i === undefined) ? 'Clic : ouvrir ce chapitre' : 'Clic : lire cette section';
              return '<div class="web-node" data-i="' + i + '" style="--c:' + n.col + '" title="' + t + ' — glisser : déplacer">'
                  + tete + '<div class="web-node-rel">' + esc(n.rel || '') + '</div></div>';
          }).join('');
          canvas.insertAdjacentHTML('beforeend', html);
          canvas.querySelectorAll('.web-node').forEach(el => {
              const i = parseInt(el.dataset.i, 10);
              if(isNaN(i) || !CoursesWeb.nodes[i]) return;
              CoursesWeb.nodes[i].el = el;
              el.addEventListener('mousedown', (ev) => CoursesWeb.onDown(ev, i));
          });
          CoursesWeb.paint();

          const note = document.getElementById('cw-note');
          if(note) note.textContent = racine
              ? 'Les sept chapitres des cours. Clique-en un pour voir ses sections.'
              : 'Les sections de ce chapitre. Clique-en une pour la lire — ↩️ Retour ramène au centre.';
      },
      pick: (v) => { CoursesWeb.center = v || null; CoursesWeb.render(); }
  };
