
  const ScriptShare = {
      _esc: (s) => Utils.escape(String(s == null ? '' : s)),

      // Ce qui peut etre partage. 'scenario' reste le defaut (retrocompat v585).
      _kinds: {
          scenario:   { title: 'Partager le scénario',   word: 'scénario',   all: 'Tout le scénario',   pick: 'Choisir des scènes',   pickOne: 'scène' },
          synopsis:   { title: 'Partager le synopsis',    word: 'synopsis',   all: 'Tout le synopsis',   pick: 'Choisir des sections', pickOne: 'section' },
          sequencier: { title: 'Partager le séquencier',  word: 'séquencier', all: 'Tout le séquencier', pick: 'Choisir des scènes',   pickOne: 'scène' },
          storyboard: { title: 'Partager le storyboard',  word: 'storyboard', all: 'Tout le storyboard', pick: 'Choisir des scènes',   pickOne: 'scène' },
          moodboard:  { title: 'Partager le moodboard',   word: 'moodboard',  all: 'Tout le moodboard',  pick: 'Choisir des planches', pickOne: 'planche' },
      },

      // Liste des elements selectionnables selon le kind : [{id, label}].
      _elements: (kind, episodeIds) => {
          if(kind === 'synopsis') {
              return [
                  { id: 'idea',  label: 'Synopsis' },
                  { id: 'short', label: 'Résumé court' },
                  { id: 'long',  label: 'Résumé long' },
              ];
          }
          if(kind === 'moodboard') {
              return (state.data.moodboards || []).map((b, i) => ({ id: b.id, label: (b.name || ('Planche ' + (i + 1))) }));
          }
          if(kind === 'storyboard') {
              const shots = state.data.shots || [];
              let sc = (state.data.scenes || []);
              if(episodeIds && episodeIds.length) sc = sc.filter(s => episodeIds.includes(s.episodeId));
              return sc.map((s, i) => ({ s, i })).filter(x => shots.some(sh => sh.sceneId === x.s.id))
                       .map(x => ({ id: x.s.id, label: (x.i + 1) + '. ' + (x.s.title || 'Sans titre') }));
          }
          let scenes = (state.data.scenes || []);
          if(episodeIds && episodeIds.length) scenes = scenes.filter(s => episodeIds.includes(s.episodeId));
          return scenes.map((s, i) => ({ id: s.id, label: (i + 1) + '. ' + (s.title || 'Sans titre') }));
      },

      // FABRICATION DES IMAGES (storyboard / moodboard) cote AUTEUR, au moment du
      // partage. Le relecteur n'a pas de compte : on ne peut pas signer/incorporer
      // les images cote serveur. On rasterise donc ici, dans le navigateur, le meme
      // rendu que l'export PDF (deja eprouve) en une IMAGE FIGEE par element, rangee
      // ensuite dans le partage. Renvoie [{id, number, title, content}] ou content
      // est du HTML d'images pretes a l'emploi.
      _bake: async (kind, ids) => {
          await LazyLib.load('pdfexport');
          if(typeof html2canvas === 'undefined') throw new Error('html2canvas indisponible');
          if(kind === 'moodboard') return ScriptShare._bakeMoodboard(ids);
          if(kind === 'storyboard') return ScriptShare._bakeStoryboard(ids);
          return [];
      },

      _bakeMoodboard: async (ids) => {
          const boards = (state.data.moodboards || []).filter(b => ids.includes(b.id));
          const out = [];
          const canvasEl = document.createElement('div');
          canvasEl.className = 'moodboard-canvas';
          canvasEl.style.cssText = 'position:absolute;left:-99999px;top:0;pointer-events:none;z-index:-9999;background:white;';
          document.body.appendChild(canvasEl);
          try {
              for(let i = 0; i < boards.length; i++) {
                  const board = boards[i];
                  const format = board.format || 'free';
                  const dims = MoodBoard.FORMATS[format] || MoodBoard.FORMATS['free'];
                  canvasEl.className = 'moodboard-canvas format-' + format;
                  canvasEl.style.width = dims.w + 'px';
                  canvasEl.style.height = dims.h + 'px';
                  const elements = board.elements || [];
                  canvasEl.innerHTML = elements.map(el => MoodBoard.renderElement(el)).join('');
                  await new Promise(r => setTimeout(r, 300));
                  const imgs = canvasEl.querySelectorAll('img');
                  await Promise.all(Array.from(imgs).map(img => (img.complete && img.naturalWidth > 0) ? Promise.resolve() : new Promise(res => { img.onload = () => res(); img.onerror = () => res(); setTimeout(res, 5000); })));
                  await new Promise(r => setTimeout(r, 150));
                  let rect;
                  if(elements.length === 0) { rect = { x: 0, y: 0, w: 600, h: 400 }; }
                  else if(format !== 'free') { rect = { x: 0, y: 0, w: dims.w, h: dims.h }; }
                  else {
                      let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
                      elements.forEach(el => { const x = el.x || 0, y = el.y || 0, w = el.width || 100, h = el.height || 100; if(x < bx1) bx1 = x; if(y < by1) by1 = y; if(x + w > bx2) bx2 = x + w; if(y + h > by2) by2 = y + h; });
                      const m = 50;
                      rect = { x: Math.max(0, bx1 - m), y: Math.max(0, by1 - m), w: Math.min(dims.w, (bx2 - bx1) + m * 2), h: Math.min(dims.h, (by2 - by1) + m * 2) };
                  }
                  let dataUrl = '';
                  try {
                      const rendered = await html2canvas(canvasEl, { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false });
                      dataUrl = rendered.toDataURL('image/jpeg', 0.8);
                  } catch(e) { dataUrl = ''; }
                  out.push({ id: board.id, number: i + 1, title: (board.name || ('Planche ' + (i + 1))), content: dataUrl ? ('<img src="' + dataUrl + '" style="max-width:100%;height:auto;display:block;margin:0 auto;">') : '<p style="color:#999;">(planche vide)</p>' });
              }
          } finally { try { document.body.removeChild(canvasEl); } catch(_) {} }
          return out;
      },

      _bakeStoryboard: async (ids) => {
          const scenes = (state.data.scenes || []);
          const shots = state.data.shots || [];
          const wanted = scenes.map((s, i) => ({ s, i })).filter(x => ids.includes(x.s.id) && shots.some(sh => sh.sceneId === x.s.id));
          const out = [];
          const prevCfg = Storyboard.printConfig;
          const prevScope = StoryboardExport._exportSceneIds;
          const shareCfg = { layout: 'standard', shotNumber: true, shotType: true, cameraMove: true, cameraMode: true, description: true, actorDirection: true, techDirection: true, sceneTitle: true, techLayer: 'none' };
          const offscreen = document.createElement('div');
          offscreen.id = 'storyboardOffscreenPreview';
          offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;pointer-events:none;background:white;width:794px;';
          document.body.appendChild(offscreen);
          try {
              for(const x of wanted) {
                  Storyboard.printConfig = { ...shareCfg };
                  StoryboardExport._printCapturing = true;
                  StoryboardExport._printImgPromises = [];
                  StoryboardExport._exportSceneIds = [x.s.id];
                  try { Storyboard.renderPrintPreview('storyboardOffscreenPreview'); }
                  catch(e) { StoryboardExport._exportSceneIds = null; StoryboardExport._printCapturing = false; continue; }
                  StoryboardExport._exportSceneIds = null;
                  await new Promise(r => setTimeout(r, 600));
                  const allImgs = offscreen.querySelectorAll('img');
                  await Promise.all(Array.from(allImgs).map(img => (img.complete && img.naturalWidth > 0) ? Promise.resolve() : new Promise(res => { img.onload = () => res(); img.onerror = () => res(); setTimeout(res, 5000); })));
                  try { await Promise.all(StoryboardExport._printImgPromises); } catch(e) {}
                  StoryboardExport._printCapturing = false;
                  await new Promise(r => setTimeout(r, 500));
                  const pages = offscreen.querySelectorAll('.sb-print-page');
                  let html = '';
                  for(let i = 0; i < pages.length; i++) {
                      let dataUrl = '';
                      try { const rendered = await html2canvas(pages[i], { scale: 1.2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false }); dataUrl = rendered.toDataURL('image/jpeg', 0.8); }
                      catch(e) { dataUrl = ''; }
                      if(dataUrl) html += '<img src="' + dataUrl + '" style="max-width:100%;height:auto;display:block;margin:0 auto 16px;border:1px solid #e2e2e2;">';
                  }
                  offscreen.innerHTML = '';
                  out.push({ id: x.s.id, number: x.i + 1, title: (x.s.title || 'Sans titre'), content: html || '<p style="color:#999;">(aucun plan)</p>' });
              }
          } finally {
              Storyboard.printConfig = prevCfg;
              StoryboardExport._exportSceneIds = prevScope;
              StoryboardExport._printCapturing = false;
              try { document.body.removeChild(offscreen); } catch(_) {}
          }
          return out;
      },

      // Fenetre : perimetre (tout / elements choisis) + nom + generation + liste des liens
      openShareModal: (kind, episodeIds) => {
          const pid = state.currentProjectId;
          if(!pid) { Utils.toast('Aucun projet ouvert', 'warning'); return; }
          kind = (kind && ScriptShare._kinds[kind]) ? kind : 'scenario';
          const cfg = ScriptShare._kinds[kind];
          const elements = ScriptShare._elements(kind, episodeIds);
          const rows = elements.map(el =>
              `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="sshare-scene" value="${ScriptShare._esc(el.id)}" style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.85rem;line-height:1.3;">${ScriptShare._esc(el.label)}</td></tr>`
          ).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.id = 'sshare-overlay';
          overlay.dataset.kind = kind;
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:560px;padding:20px;">
              <div style="font-size:1.05rem;font-weight:bold;margin-bottom:14px;">🔗 ${ScriptShare._esc(cfg.title)}</div>
              <div style="text-align:left;font-size:0.82rem;color:var(--text-sec);margin-bottom:12px;">Envoie une version lecture seule du ${ScriptShare._esc(cfg.word)} à une personne extérieure (non inscrite). Elle pourra le lire et déposer des commentaires, qui te reviendront sur le site.</div>
              <input type="text" id="sshare-label" placeholder="Nom du partage (ex : Relecture Marc) — facultatif" data-tooltip="Nom du partage (ex : Relecture Marc) — facultatif" style="width:100%;padding:8px 10px;margin-bottom:12px;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;box-sizing:border-box;">
              <div style="display:flex;gap:6px;margin-bottom:10px;">
                  <button type="button" class="fmt-btn active" id="sshare-all" data-active="1" style="flex:1;padding:8px;font-size:0.82rem;">${ScriptShare._esc(cfg.all)}</button>
                  <button type="button" class="fmt-btn" id="sshare-pick" data-active="0" style="flex:1;padding:8px;font-size:0.82rem;">${ScriptShare._esc(cfg.pick)}</button>
              </div>
              <div id="sshare-scenes" style="display:none;max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:12px;"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
              <button type="button" id="sshare-create" class="confirm-modal-btn confirm" style="width:100%;margin:0 0 12px 0;">Générer le lien</button>
              <div id="sshare-result" style="display:none;margin-bottom:14px;">
                  <div style="display:flex;gap:6px;">
                      <input type="text" id="sshare-url" readonly style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;background:var(--bg);box-sizing:border-box;">
                      <button type="button" id="sshare-copy" class="confirm-modal-btn" style="margin:0;white-space:nowrap;">Copier</button>
                  </div>
              </div>
              <div style="text-align:left;font-size:0.82rem;font-weight:600;color:var(--text-sec);margin-bottom:6px;">Liens existants</div>
              <div id="sshare-list" style="max-height:160px;overflow-y:auto;font-size:0.82rem;">Chargement…</div>
              <div style="display:flex;justify-content:flex-end;margin-top:14px;">
                  <button class="confirm-modal-btn cancel" id="sshare-close" style="margin:0;">Fermer</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);

          const q = (sel) => overlay.querySelector(sel);
          q('#sshare-all').onclick = () => { q('#sshare-all').classList.add('active'); q('#sshare-all').dataset.active = '1'; q('#sshare-pick').classList.remove('active'); q('#sshare-pick').dataset.active = '0'; q('#sshare-scenes').style.display = 'none'; };
          q('#sshare-pick').onclick = () => { q('#sshare-pick').classList.add('active'); q('#sshare-pick').dataset.active = '1'; q('#sshare-all').classList.remove('active'); q('#sshare-all').dataset.active = '0'; q('#sshare-scenes').style.display = 'block'; };
          q('#sshare-close').onclick = () => overlay.remove();
          overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
          q('#sshare-create').onclick = () => ScriptShare._create(pid, overlay);
          q('#sshare-copy').onclick = () => ScriptShare._copy(q('#sshare-url').value);
          ScriptShare._refresh(pid, overlay);
      },

      _create: async (pid, overlay) => {
          const kind = overlay.dataset.kind || 'scenario';
          const cfg = ScriptShare._kinds[kind] || ScriptShare._kinds.scenario;
          const label = overlay.querySelector('#sshare-label').value.trim();
          const pick = overlay.querySelector('#sshare-pick').dataset.active === '1';
          let sceneIds = null;
          if(pick) {
              sceneIds = Array.from(overlay.querySelectorAll('.sshare-scene:checked')).map(cb => cb.value);
              if(sceneIds.length === 0) { Utils.toast('Sélectionne au moins une ' + cfg.pickOne, 'warning'); return; }
          }
          const btn = overlay.querySelector('#sshare-create');
          btn.disabled = true; btn.textContent = 'Génération…';
          // Storyboard / Moodboard : on fige les images ici (le relecteur n'a pas de compte).
          let payload = null;
          if(kind === 'storyboard' || kind === 'moodboard') {
              const bakeIds = pick ? sceneIds : ScriptShare._elements(kind).map(el => el.id);
              if(!bakeIds || !bakeIds.length) { Utils.toast('Rien à partager', 'warning'); btn.disabled = false; btn.textContent = 'Générer le lien'; return; }
              btn.textContent = 'Préparation des images…';
              try { payload = { scenes: await ScriptShare._bake(kind, bakeIds) }; }
              catch(e) { console.error('[ScriptShare] bake:', e); Utils.toast('Impossible de préparer les images (réessaie)', 'error'); btn.disabled = false; btn.textContent = 'Générer le lien'; return; }
          }
          try {
              const { data, error } = await supabase.functions.invoke('script-share', { body: { action: 'create', projectId: pid, kind, label: label || null, sceneIds, payload } });
              if(error || !data || !data.token) throw (error || new Error('token'));
              const url = window.location.origin + '/scenario/' + data.token;
              overlay.querySelector('#sshare-url').value = url;
              overlay.querySelector('#sshare-result').style.display = 'block';
              ScriptShare._copy(url);
              ScriptShare._refresh(pid, overlay);
          } catch(e) {
              console.error('[ScriptShare] create:', e);
              Utils.toast('Impossible de générer le lien', 'error');
          } finally {
              btn.disabled = false; btn.textContent = 'Générer le lien';
          }
      },

      _refresh: async (pid, overlay) => {
          const kind = overlay.dataset.kind || 'scenario';
          const cfg = ScriptShare._kinds[kind] || ScriptShare._kinds.scenario;
          const listEl = overlay.querySelector('#sshare-list');
          try {
              const { data, error: errShares } = await supabase.functions.invoke('script-share', { body: { action: 'shares', projectId: pid } });
              if(errShares) console.warn('[ScriptShare] _refresh:', errShares);
              let shares = (data && data.shares) || [];
              // Ne montrer que les liens du meme type que la fenetre ouverte.
              shares = shares.filter(sh => (sh.kind || 'scenario') === kind);
              ScriptShare._shares = shares;
              if(shares.length === 0) { listEl.innerHTML = '<div style="color:var(--text-sec);padding:6px 0;">Aucun lien pour l\'instant.</div>'; return; }
              listEl.innerHTML = shares.map(sh => {
                  const scope = sh.scene_ids ? (sh.scene_ids.length + ' ' + cfg.pickOne + (sh.scene_ids.length > 1 ? 's' : '')) : cfg.all;
                  const name = ScriptShare._esc(sh.label || scope);
                  const off = sh.revoked;
                  const url = window.location.origin + '/scenario/' + sh.token;
                  return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);${off ? 'opacity:0.5;' : ''}">
                      <div style="flex:1;min-width:0;"><div style="font-weight:600;">${name}</div><div style="color:var(--text-sec);font-size:0.75rem;">${scope}${off ? ' — révoqué' : ''}</div></div>
                      ${((kind === 'storyboard' || kind === 'moodboard') && !off) ? `<button type="button" class="confirm-modal-btn" style="margin:0;padding:4px 8px;font-size:0.75rem;" onclick="app.ScriptShare._update('${ScriptShare._esc(sh.id)}')" title="Refabriquer les images avec le contenu actuel (le lien ne change pas, les commentaires restent)">Mettre à jour</button>` : ''}
                      <button type="button" class="confirm-modal-btn" style="margin:0;padding:4px 8px;font-size:0.75rem;" onclick="app.ScriptShare._copy('${url}')">Copier</button>
                      <button type="button" class="confirm-modal-btn ${off ? 'confirm' : 'cancel'}" style="margin:0;padding:4px 8px;font-size:0.75rem;" onclick="app.ScriptShare._toggle('${ScriptShare._esc(sh.id)}', ${off ? 'false' : 'true'})">${off ? 'Réactiver' : 'Révoquer'}</button>
                  </div>`;
              }).join('');
          } catch(e) {
              console.error('[ScriptShare] shares:', e);
              listEl.innerHTML = '<div style="color:var(--danger);padding:6px 0;">Erreur de chargement.</div>';
          }
      },

      _update: async (shareId) => {
          const sh = (ScriptShare._shares || []).find(s => String(s.id) === String(shareId));
          if(!sh) { Utils.toast('Lien introuvable', 'warning'); return; }
          const kind = sh.kind;
          if(kind !== 'storyboard' && kind !== 'moodboard') return;
          const ids = (sh.scene_ids && sh.scene_ids.length) ? sh.scene_ids : ScriptShare._elements(kind).map(el => el.id);
          if(!ids || !ids.length) { Utils.toast('Rien à mettre à jour', 'warning'); return; }
          Utils.toast('Préparation des images…', 'info');
          let payload;
          try { payload = { scenes: await ScriptShare._bake(kind, ids) }; }
          catch(e) { console.error('[ScriptShare] bake(update):', e); Utils.toast('Impossible de préparer les images', 'error'); return; }
          try {
              const { data, error } = await supabase.functions.invoke('script-share', { body: { action: 'update', shareId, payload } });
              if(error || !data || !data.ok) throw (error || new Error('update'));
              Utils.toast('Images mises à jour', 'success');
          } catch(e) { console.error('[ScriptShare] update:', e); Utils.toast('Mise à jour impossible', 'error'); }
      },

      _toggle: async (shareId, revoked) => {
          try {
              await supabase.functions.invoke('script-share', { body: { action: 'revoke', shareId, revoked } });
              const ov = document.getElementById('sshare-overlay');
              if(ov && state.currentProjectId) ScriptShare._refresh(state.currentProjectId, ov);
          } catch(e) { console.error('[ScriptShare] revoke:', e); Utils.toast('Erreur', 'error'); }
      },

      _copy: (url) => {
          try { navigator.clipboard.writeText(url); Utils.toast('Lien copié', 'success'); }
          catch(e) { Utils.toast('Copie impossible', 'warning'); }
      },
  };

  // ==================== MODULE SCRIPTREADER (vue lecteur invite, publique) ====================
  // Vue plein ecran autonome (style neutre, independant du theme du site) affichee
  // quand l'URL est /scenario/<jeton>. Court-circuite le flux d'auth : l'invite ne
  // voit QUE le scenario. Colonne gauche = texte en lecture ; colonne droite = deux
  // onglets (Global / Par scene). Tout passe par l'Edge Function script-share.