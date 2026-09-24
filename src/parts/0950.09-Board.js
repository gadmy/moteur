
// PLANCHE D'IDEES / CASTING (v588).
// Les idees (notes + photos de reference) sont stockees SUR la fiche elle-meme,
// dans item.board = [{ id, kind:'note'|'photo', text?, url?, ts }]. Elles heritent
// donc des droits de la section de leur fiche (aucune nouvelle cle de projet).
const Board = {
    _familyArray: (family) => {
        const map = { character: 'characters', actor: 'actors', crew: 'crew', location: 'locations', resource: 'resources', org: 'orgs', scene: 'scenes' };
        const key = map[family];
        return key ? (state.data[key] || null) : null;
    },
    _findItem: (family, id) => {
        const arr = Board._familyArray(family);
        return arr ? (arr.find(x => String(x.id) === String(id)) || null) : null;
    },
    list: (family, id) => { const it = Board._findItem(family, id); return (it && it.board) || []; },
    _newId: () => 'idea_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
    _rerender: (family, id) => {
        const w = document.getElementById('board-wrap-' + family + '-' + id);
        if(w) w.innerHTML = Board._inner(family, id, false);
    },
    addNote: (family, id) => {
        const it = Board._findItem(family, id);
        if(!it) return;
        if(!it.board) it.board = [];
        it.board.push({ id: Board._newId(), kind: 'note', text: '', ts: Date.now() });
        Store.save();
        Board._rerender(family, id);
    },
    updateNote: (family, id, ideaId, text) => {
        const it = Board._findItem(family, id);
        if(!it || !it.board) return;
        const idea = it.board.find(b => b.id === ideaId);
        if(idea) { idea.text = text; Store.saveDebounced(); }
    },
    remove: (family, id, ideaId) => {
        const it = Board._findItem(family, id);
        if(!it || !it.board) return;
        it.board = it.board.filter(b => b.id !== ideaId);
        Store.save();
        Board._rerender(family, id);
    },
    addPhoto: async (family, id) => {
        const it = Board._findItem(family, id);
        if(!it) return;
        const input = document.getElementById('board-photo-' + family + '-' + id);
        if(!input || !input.files || !input.files[0]) { Utils.toast('Choisissez une image.', 'warning'); return; }
        const file = input.files[0];
        input.value = '';
        Utils.toast('Envoi de la photo...', 'info', 1500);
        const url = await Utils.uploadProjectFile(file, { category: family, entityId: it.id || 'x', kind: 'board', maxDimension: 1920, quality: 0.9, maxKb: 1500 });
        if(!url) return;
        if(!it.board) it.board = [];
        it.board.push({ id: Board._newId(), kind: 'photo', url: url, ts: Date.now() });
        Store.save();
        Board._rerender(family, id);
    },
    // Ajoute un profil de l'Univers comme IDEE de casting sur la planche d'un
    // personnage : photo de reference (si dispo) + note « Idee casting : Nom ».
    // Utilise par la fenetre de casting (clic droit sur une carte ou bouton de
    // la fiche profil).
    addProfileIdea: (charId, profile) => {
        if(!charId || !profile) return;
        const it = Board._findItem('character', charId);
        if(!it) { Utils.toast('Personnage introuvable', 'warning'); return; }
        if(!it.board) it.board = [];
        const name = profile.name || profile.displayName || 'Profil';
        const photo = profile.photo || profile.photoURL || profile.mainPhoto || '';
        if(photo) it.board.push({ id: Board._newId(), kind: 'photo', url: photo, ts: Date.now() });
        const bits = [name]; if(profile.city) bits.push(profile.city);
        it.board.push({ id: Board._newId(), kind: 'note', text: 'Idée casting : ' + bits.join(' — '), ts: Date.now() });
        Store.save();
        Board._rerender('character', charId);
        Utils.toast('Ajouté aux idées de ' + (it.name || 'la fiche'), 'success');
    },
    // Contenu de la planche (sans l'enveloppe) : boutons d'ajout, bande de photos, liste de notes.
    _inner: (family, id, isView) => {
        const items = Board.list(family, id);
        const esc = Utils.escape;
        const fam = esc(family), sid = esc(String(id));
        let html = '';
        if(!isView) {
            html += `<div class="board-actions">
                <button class="btn btn--primary btn--sm" onclick="app.Board.addNote('${fam}','${sid}')">➕ Note</button>
                <input type="file" id="board-photo-${fam}-${sid}" accept="image/*" style="display:none;" onchange="app.Board.addPhoto('${fam}','${sid}')">
                <button class="btn btn--primary btn--sm" onclick="document.getElementById('board-photo-${fam}-${sid}').click()">📸 Photo</button>
            </div>`;
        }
        if(!items.length) {
            html += `<div class="board-empty">Aucune idée pour l'instant. Ajoute des notes ou des photos de référence.</div>`;
            return html;
        }
        const photos = items.filter(b => b.kind === 'photo');
        const notes = items.filter(b => b.kind === 'note');
        if(photos.length) {
            html += `<div class="board-scroller">`;
            photos.forEach(p => {
                html += `<div class="board-photo"><img src="${Utils.safeMediaUrl(p.url)}" alt="Idée de référence">${!isView ? `<button class="board-del" title="Supprimer" onclick="app.Board.remove('${fam}','${sid}',${Utils.jsArg(p.id)})">✕</button>` : ''}</div>`;
            });
            html += `</div>`;
        }
        if(notes.length) {
            html += `<div class="board-notes">`;
            notes.forEach(n => {
                if(isView) {
                    html += `<div class="board-note">${esc(n.text || '')}</div>`;
                } else {
                    html += `<div class="board-note"><textarea class="board-note-input" placeholder="Idée, référence, remarque..." data-tooltip="Idée, référence, remarque..." oninput="app.Board.updateNote('${fam}','${sid}',${Utils.jsArg(n.id)}, this.value)">${esc(n.text || '')}</textarea><button class="board-del" title="Supprimer" onclick="app.Board.remove('${fam}','${sid}',${Utils.jsArg(n.id)})">✕</button></div>`;
                }
            });
            html += `</div>`;
        }
        return html;
    },
    // ---- VUE SATELLITES (idees autour de la fiche, esprit Toile de liaisons) ----
    _satCtx: null,
    _onSatResize: null,
    _satNodes: null,
    _satZ: 10,
    _satSel: null,
    _satClearSel: () => {
        Board._satSel = null;
        const c = document.getElementById('board-sat-canvas');
        if(c) c.querySelectorAll('.board-sat-node.is-sel').forEach(el => el.classList.remove('is-sel'));
    },
    _satStartRubber: (e, canvas) => {
        e.preventDefault();
        Board._satClearSel();
        const rect = canvas.getBoundingClientRect();
        const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
        const box = document.createElement('div');
        box.className = 'board-sat-rubber';
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
            const nodes = Board._satNodes || [];
            const sel = new Set();
            for(let i = 1; i < nodes.length; i++) {
                const n = nodes[i];
                if(n.x >= l && n.x <= r && n.y >= t && n.y <= b) sel.add(i);
            }
            if(sel.size) {
                Board._satSel = sel;
                canvas.querySelectorAll('.board-sat-node').forEach(el => {
                    if(!el.classList.contains('board-sat-centre') && sel.has(parseInt(el.dataset.si, 10))) el.classList.add('is-sel');
                });
            }
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },
    _satDragGroup: (e, canvas, nodes) => {
        e.preventDefault();
        const sel = Board._satSel;
        let lastX = e.clientX, lastY = e.clientY;
        const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
        sel.forEach(i => { if(nodes[i]) nodes[i].pinned = true; });
        const move = (ev) => {
            const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
            lastX = ev.clientX; lastY = ev.clientY;
            sel.forEach(i => { if(nodes[i]) { nodes[i].x += dx; nodes[i].y += dy; } });
            GraphPhysics.relax(nodes, W, H, 3);
            Board._satPaint();
        };
        const up = () => {
            sel.forEach(i => { if(nodes[i]) nodes[i].pinned = false; });
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },
    _satPaint: () => {
        const canvas = document.getElementById('board-sat-canvas');
        const nodes = Board._satNodes;
        if(!canvas || !nodes || !nodes.length) return;
        canvas.querySelectorAll('.board-sat-node').forEach(el => {
            const n = el.classList.contains('board-sat-centre') ? nodes[0] : nodes[parseInt(el.dataset.si, 10)];
            if(!n) return;
            el.style.left = (n.x - n.w / 2) + 'px';
            el.style.top = (n.y - n.h / 2) + 'px';
            el.style.width = n.w + 'px';
            el.style.height = n.h + 'px';
        });
        const svg = document.getElementById('board-sat-svg');
        if(svg) {
            const cx = nodes[0].x, cy = nodes[0].y;
            svg.querySelectorAll('.board-sat-line').forEach(line => {
                const n = nodes[parseInt(line.dataset.si, 10)];
                if(n) { line.setAttribute('x1', cx); line.setAttribute('y1', cy); line.setAttribute('x2', n.x); line.setAttribute('y2', n.y); }
            });
        }
    },
    _satMouseDown: (e) => {
        if(e.button && e.button !== 0) return;   // clic droit/milieu -> laisse le menu contextuel
        const canvas = document.getElementById('board-sat-canvas');
        const nodes = Board._satNodes || [];
        if(!canvas || !nodes.length) return;
        const el = e.target.closest('.board-sat-node');
        if(!el) { Board._satStartRubber(e, canvas); return; }   // clic dans le vide -> cadre
        e.preventDefault();
        const isCentre = el.classList.contains('board-sat-centre');
        const idx = isCentre ? 0 : parseInt(el.dataset.si, 10);
        if(!isCentre && Board._satSel && Board._satSel.size > 1 && Board._satSel.has(idx)) {
            Board._satDragGroup(e, canvas, nodes);              // pastille selectionnee -> groupe
            return;
        }
        Board._satClearSel();
        const nd = nodes[idx];
        if(!nd) return;
        if(!isCentre) el.style.zIndex = String(++Board._satZ); // au premier plan
        let lastX = e.clientX, lastY = e.clientY;
        const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
        const move = (ev) => {
            const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
            lastX = ev.clientX; lastY = ev.clientY;
            nd.x += dx; nd.y += dy;
            if(!isCentre) nd.pinned = true;          // la pastille tenue est figee
            GraphPhysics.relax(nodes, W, H, 3);       // les autres suivent et se repoussent (centre compris)
            Board._satPaint();
        };
        const up = () => { nd.pinned = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },
    _satWheel: (e) => {
        const el = e.target.closest('.board-sat-node');
        if(!el || el.classList.contains('board-sat-centre')) return;
        const idx = parseInt(el.dataset.si, 10);
        const n = (Board._satNodes || [])[idx];
        if(!n) return;
        e.preventDefault();
        const canvas = document.getElementById('board-sat-canvas');
        const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        // Fraction du curseur DANS la pastille avant zoom (pour garder le point
        // sous la souris a la meme place apres redimensionnement).
        const fx = n.w ? (mx - (n.x - n.w / 2)) / n.w : 0.5;
        const fy = n.h ? (my - (n.y - n.h / 2)) / n.h : 0.5;
        n._scale = Math.max(0.4, Math.min(8, (n._scale || 1) + (e.deltaY < 0 ? 0.18 : -0.18)));
        n.w = n.bw * n._scale; n.h = n.bh * n._scale;
        // Recentre pour que le point vise reste sous le curseur
        n.x = mx - fx * n.w + n.w / 2;
        n.y = my - fy * n.h + n.h / 2;
        el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
        el.style.left = (n.x - n.w / 2) + 'px'; el.style.top = (n.y - n.h / 2) + 'px';
        const svg = document.getElementById('board-sat-svg');
        if(svg) { const line = svg.querySelector('.board-sat-line[data-si="' + idx + '"]'); if(line) { line.setAttribute('x2', n.x); line.setAttribute('y2', n.y); } }
    },
    _satDblClick: (e) => {
        const el = e.target.closest('.board-sat-node');
        if(!el || el.classList.contains('board-sat-centre')) return;
        const n = (Board._satNodes || [])[parseInt(el.dataset.si, 10)];
        if(!n) return;
        n._big = !n._big;
        n._scale = n._big ? 1.9 : 1;
        n.w = n.bw * n._scale; n.h = n.bh * n._scale;
        el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
        el.style.left = (n.x - n.w / 2) + 'px'; el.style.top = (n.y - n.h / 2) + 'px';
    },
    // Peut-on ecrire sur la planche de la fiche au centre ? (droit de sa section)
    _satCanEdit: () => {
        const ctx = Board._satCtx;
        if(!ctx) return false;
        return (typeof Permissions === 'undefined' || !Permissions.canEditFiche) ? true : Permissions.canEditFiche(ctx.family);
    },
    _satCloseMenu: () => {
        const m = document.getElementById('board-sat-menu');
        if(m) m.remove();
    },
    // Clic droit sur la fiche au centre : petit menu « Ajouter une note » /
    // « Ajouter une image » pour enrichir la planche sans repasser par la fiche.
    _satCtxMenu: (e) => {
        const centre = e.target.closest('.board-sat-centre');
        if(!centre) return;
        e.preventDefault();
        Board._satCloseMenu();
        if(!Board._satCanEdit()) return;
        const canvas = document.getElementById('board-sat-canvas');
        if(!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.id = 'board-sat-menu';
        menu.style.cssText = 'position:absolute; z-index:10000; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,0.35); padding:4px; min-width:190px;';
        menu.style.left = Math.max(0, Math.min(e.clientX - rect.left, rect.width - 200)) + 'px';
        menu.style.top = Math.max(0, Math.min(e.clientY - rect.top, rect.height - 96)) + 'px';
        const mk = (label, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText = 'display:block; width:100%; text-align:left; background:none; border:none; padding:9px 12px; border-radius:6px; cursor:pointer; color:var(--text-main); font-size:0.9rem;';
            b.onmouseover = () => { b.style.background = 'var(--highlight)'; };
            b.onmouseout = () => { b.style.background = 'none'; };
            b.addEventListener('click', () => { Board._satCloseMenu(); fn(); });
            return b;
        };
        menu.appendChild(mk('📝 Ajouter une note', Board._satAddNote));
        menu.appendChild(mk('📸 Ajouter une image', Board._satAddPhoto));
        canvas.appendChild(menu);
        setTimeout(() => {
            const off = (ev) => { if(!ev.target.closest('#board-sat-menu')) { Board._satCloseMenu(); document.removeEventListener('mousedown', off, true); } };
            document.addEventListener('mousedown', off, true);
        }, 0);
    },
    _satAddNote: async () => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it) return;
        let text = '';
        try { text = await ConfirmModal.prompt('Texte de la note', '📝 Nouvelle note', 'Idée, référence, remarque…'); } catch(_) { text = ''; }
        if(text == null) return;
        text = String(text).trim();
        if(!text) return;
        if(!it.board) it.board = [];
        it.board.push({ id: Board._newId(), kind: 'note', text: text, ts: Date.now() });
        Store.save();
        Board._renderSatellites();
    },
    _satAddPhoto: () => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if(file) {
                Utils.toast('Envoi de la photo...', 'info', 1500);
                const url = await Utils.uploadProjectFile(file, { category: ctx.family, entityId: it.id || 'x', kind: 'board', maxDimension: 1920, quality: 0.9, maxKb: 1500 });
                if(url) {
                    if(!it.board) it.board = [];
                    it.board.push({ id: Board._newId(), kind: 'photo', url: url, ts: Date.now() });
                    Store.save();
                    Board._renderSatellites();
                }
            }
            input.remove();
        });
        input.click();
    },
    // Croix : supprime la note/photo directement depuis la vue satellites.
    _satRemove: (i) => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const n = (Board._satNodes || [])[i];
        if(!n || !n.idea) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it || !it.board) return;
        it.board = it.board.filter(b => b.id !== n.idea.id);
        Store.save();
        Board._renderSatellites();
    },
    // Coeur : marque/demarque une idee comme favorite (la fait ressortir).
    _satToggleFav: (i) => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const n = (Board._satNodes || [])[i];
        if(!n || !n.idea) return;
        n.idea.fav = !n.idea.fav;
        Store.save();
        // Mise a jour EN PLACE (pas de re-render) : les zooms restent.
        const canvas = document.getElementById('board-sat-canvas');
        const el = canvas && canvas.querySelector('.board-sat-node[data-si="' + i + '"]');
        if(el) {
            el.classList.toggle('is-fav', !!n.idea.fav);
            const btn = el.querySelector('.board-sat-fav');
            if(btn) { btn.classList.toggle('on', !!n.idea.fav); btn.textContent = n.idea.fav ? '❤' : '🤍'; btn.title = n.idea.fav ? 'Retirer des favoris' : "J'aime"; }
        }
    },
    // Ajuste la pastille photo au FORMAT reel de l'image une fois chargee
    // (fini le carre qui rognait) ; conserve le centre et le zoom courant.
    _satFitPhoto: (img) => {
        try {
            const el = img.closest('.board-sat-node');
            if(!el) return;
            const i = parseInt(el.dataset.si, 10);
            const n = (Board._satNodes || [])[i];
            if(!n) return;
            const nw = img.naturalWidth, nh = img.naturalHeight;
            if(!nw || !nh) return;
            const L = 150; // plus grand cote de base
            let w, h;
            if(nw >= nh) { w = L; h = Math.round(L * nh / nw); }
            else { h = L; w = Math.round(L * nw / nh); }
            n.bw = w; n.bh = h;
            const sc = n._scale || 1;
            n.w = w * sc; n.h = h * sc;
            el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
            el.style.left = (n.x - n.w / 2) + 'px'; el.style.top = (n.y - n.h / 2) + 'px';
        } catch(_) {}
    },
    openSatellites: (family, id) => {
        const it = Board._findItem(family, id);
        if(!it) return;
        const old = document.getElementById('board-sat-modal');
        if(old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'board-sat-modal';
        wrap.className = 'board-sat-modal';
        wrap.onclick = (e) => { if(e.target === wrap) Board.closeSatellites(); };
        wrap.innerHTML = `<div class="board-sat-head"><span class="board-sat-title">💡 Idées — ${Utils.escape(it.name || '')}</span><button class="board-sat-close" type="button" onclick="app.Board.closeSatellites()">✖</button></div><div class="board-sat-canvas" id="board-sat-canvas"><svg class="board-sat-svg" id="board-sat-svg"></svg></div>`;
        document.body.appendChild(wrap);
        const _c = document.getElementById('board-sat-canvas');
        if(_c) { _c.addEventListener('mousedown', Board._satMouseDown); _c.addEventListener('dblclick', Board._satDblClick); _c.addEventListener('wheel', Board._satWheel, { passive: false }); _c.addEventListener('contextmenu', Board._satCtxMenu); }
        Board._satCtx = { family: family, id: id };
        Board._onSatResize = () => Board._renderSatellites();
        window.addEventListener('resize', Board._onSatResize);
        requestAnimationFrame(() => Board._renderSatellites());
    },
    closeSatellites: () => {
        if(Board._onSatResize) { window.removeEventListener('resize', Board._onSatResize); Board._onSatResize = null; }
        const m = document.getElementById('board-sat-modal');
        if(m) m.remove();
        Board._satCtx = null;
    },
    _renderSatellites: () => {
        const ctx = Board._satCtx;
        if(!ctx) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it) return;
        const canvas = document.getElementById('board-sat-canvas');
        const svg = document.getElementById('board-sat-svg');
        if(!canvas || !svg) return;
        const items = it.board || [];
        // Memoriser zoom/format/position par idee pour les restituer apres
        // reconstruction (un ajout/suppression ne doit pas remettre les zooms a zero).
        const prev = {};
        (Board._satNodes || []).forEach(nd => { if(nd && nd.idea && nd.idea.id) prev[nd.idea.id] = nd; });
        Board._satSel = null;
        const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
        const cx = W / 2, cy = H / 2;
        const centre = { center: true, x: cx, y: cy, w: 160, h: 64 };
        const nodes = [centre];
        const R = Math.max(150, Math.min(W, H) / 2 - 90);
        const ring = (arr, kind, baseDeg, w, h) => {
            const n = arr.length;
            arr.forEach((b, i) => {
                const t = n <= 1 ? 0.5 : i / (n - 1);
                const ang = (baseDeg - 70 + 140 * t) * Math.PI / 180;
                const ox = Math.cos(ang) * R, oy = Math.sin(ang) * R;
                nodes.push({ kind: kind, idea: b, w: w, h: h, bw: w, bh: h, ox: ox, oy: oy, x: cx + ox, y: cy + oy });
            });
        };
        ring(items.filter(b => b.kind === 'photo'), 'photo', 0, 116, 116);
        ring(items.filter(b => b.kind === 'note'), 'note', 180, 168, 78);
        GraphPhysics.relax(nodes, W, H, 140);
        // Restituer l'etat memorise (zoom, format image, position) des idees deja affichees.
        for(let k = 1; k < nodes.length; k++) {
            const nd = nodes[k];
            if(!nd.idea) continue;
            const p = prev[nd.idea.id];
            if(!p) continue;
            if(p.bw) { nd.bw = p.bw; nd.bh = p.bh; }
            if(p._scale) nd._scale = p._scale;
            nd._big = p._big;
            const sc = nd._scale || 1;
            nd.w = nd.bw * sc; nd.h = nd.bh * sc;
            if(typeof p.x === 'number' && typeof p.y === 'number') { nd.x = p.x; nd.y = p.y; }
        }
        Board._satNodes = nodes;
        svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        let lines = '';
        for(let i = 1; i < nodes.length; i++) {
            lines += `<line x1="${cx}" y1="${cy}" x2="${nodes[i].x}" y2="${nodes[i].y}" class="board-sat-line" data-si="${i}"></line>`;
        }
        svg.innerHTML = lines;
        const esc = Utils.escape;
        const canEdit = Board._satCanEdit();
        // Coeur (favori) + croix (supprimer) sur chaque pastille. En lecture
        // seule, seul le coeur plein reste, comme repere.
        const ctrls = (i, fav) => {
            const heart = canEdit
                ? `<button class="board-sat-fav${fav ? ' on' : ''}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.Board._satToggleFav(${i})" title="${fav ? 'Retirer des favoris' : "J'aime"}">${fav ? '❤' : '🤍'}</button>`
                : (fav ? `<span class="board-sat-fav on">❤</span>` : '');
            const cross = canEdit
                ? `<button class="board-sat-x" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.Board._satRemove(${i})" title="Supprimer">✕</button>`
                : '';
            const topHtml = heart ? `<div class="board-sat-ctrls">${heart}</div>` : '';
            const botHtml = cross ? `<div class="board-sat-ctrls board-sat-ctrls-br">${cross}</div>` : '';
            return topHtml + botHtml;
        };
        let bubbles = `<div class="board-sat-node board-sat-centre" style="left:${centre.x - centre.w / 2}px; top:${centre.y - centre.h / 2}px; width:${centre.w}px; height:${centre.h}px;">${esc(it.name || 'Fiche')}</div>`;
        for(let i = 1; i < nodes.length; i++) {
            const n = nodes[i];
            const st = `left:${n.x - n.w / 2}px; top:${n.y - n.h / 2}px; width:${n.w}px; height:${n.h}px;`;
            const fav = !!(n.idea && n.idea.fav);
            const favCls = fav ? ' is-fav' : '';
            if(n.kind === 'photo') {
                bubbles += `<div class="board-sat-node board-sat-photo${favCls}" data-si="${i}" style="${st}"><img src="${Utils.safeMediaUrl(n.idea.url)}" alt="Idée de référence" onload="app.Board._satFitPhoto(this)">${ctrls(i, fav)}</div>`;
            } else {
                bubbles += `<div class="board-sat-node board-sat-noteb${favCls}" data-si="${i}" style="${st}">${esc(n.idea.text || '(note vide)')}${ctrls(i, fav)}</div>`;
            }
        }
        if(nodes.length === 1) {
            bubbles += `<div class="board-sat-empty">Aucune idée pour l'instant. Clic droit sur la fiche au centre pour ajouter une note ou une image.</div>`;
        }
        canvas.querySelectorAll('.board-sat-node,.board-sat-empty').forEach(el => el.remove());
        canvas.insertAdjacentHTML('beforeend', bubbles);
    },
    render: (family, id, isView) => `<div class="board-wrap" id="board-wrap-${Utils.escape(family)}-${Utils.escape(String(id))}">${Board._inner(family, id, isView)}</div>`
};
