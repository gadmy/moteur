
  const ScriptReview = {
      _comments: [],
      _author: 'all',
      _tab: 'global',
      _kind: 'scenario',
      _esc: (s) => Utils.escape(String(s == null ? '' : s)),

      // A quel onglet s'accroche la bulle, et le libelle de l'onglet "par element".
      _kindTab: { scenario: 'script', synopsis: 'synopsis', sequencier: 'board', storyboard: 'storyboard', moodboard: 'moodboard' },
      _kindPer: { scenario: 'Par scène', synopsis: 'Par section', sequencier: 'Par scène', storyboard: 'Par scène', moodboard: 'Par planche' },

      // Elements groupables selon le kind : [{id, label}].
      _elements: (kind) => {
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
          return (state.data.scenes || []).map((s, i) => ({ id: s.id, label: (i + 1) + '. ' + (s.title || '') }));
      },

      open: async (elementId, kind) => {
          const panel = document.getElementById('comments-panel');
          if(!panel) return;
          ScriptReview._kind = (kind && ScriptReview._kindTab[kind]) ? kind : 'scenario';
          ScriptReview._ensureDelegation();
          ScriptReview._tab = elementId ? 'scene' : 'global';
          panel.classList.add('open');
          ScriptReview._renderShell();
          await ScriptReview._load();
      },

      close: () => { const p = document.getElementById('comments-panel'); if(p) p.classList.remove('open'); },

      _load: async () => {
          const pid = state.currentProjectId;
          if(!pid) { ScriptReview._comments = []; ScriptReview._render(); return; }
          try {
              const { data, error: errLoadCom } = await supabase.functions.invoke('script-share', { body: { action: 'list', projectId: pid } });
              if(errLoadCom) console.error('[ScriptReview] list:', errLoadCom);
              ScriptReview._comments = (data && data.comments) || [];
          } catch(e) { console.error('[ScriptReview] list:', e); ScriptReview._comments = []; }
          ScriptReview._render();
      },

      _authors: () => {
          const map = {};
          ScriptReview._comments.forEach(c => { map[c.author_email] = ((c.author_first || '') + ' ' + (c.author_last || '')).trim() || c.author_email; });
          return map;
      },

      _renderShell: () => {
          const panel = document.getElementById('comments-panel');
          panel.innerHTML = `<div class="comments-header">
                  <h3>💬 Commentaires</h3>
                  <button class="comments-close" onclick="app.ScriptReview.close()">✕</button>
              </div>
              <div style="padding:10px 14px;border-bottom:1px solid var(--border);">
                  <select id="sr-author" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--panel-bg);color:var(--text-main);font-size:0.85rem;"></select>
              </div>
              <div class="sr-tabs" style="display:flex;border-bottom:1px solid var(--border);">
                  <div class="sr-tab" data-tab="global" style="flex:1;text-align:center;padding:10px;cursor:pointer;font-weight:600;font-size:0.85rem;">Global</div>
                  <div class="sr-tab" data-tab="scene" style="flex:1;text-align:center;padding:10px;cursor:pointer;font-weight:600;font-size:0.85rem;">${ScriptReview._esc(ScriptReview._kindPer[ScriptReview._kind] || 'Par scène')}</div>
              </div>
              <div class="comments-body" id="sr-body" style="flex:1;overflow-y:auto;padding:12px;"></div>`;
          panel.querySelectorAll('.sr-tab').forEach(t => t.onclick = () => { ScriptReview._tab = t.dataset.tab; ScriptReview._render(); });
          panel.querySelector('#sr-author').onchange = (e) => { ScriptReview._author = e.target.value; ScriptReview._render(); };
      },

      _render: () => {
          const body = document.getElementById('sr-body');
          if(!body) return;
          const sel = document.getElementById('sr-author');
          if(sel) {
              const authors = ScriptReview._authors();
              sel.innerHTML = '<option value="all">Tous les auteurs</option>' + Object.keys(authors).map(em => `<option value="${ScriptReview._esc(em)}">${ScriptReview._esc(authors[em])}</option>`).join('');
              sel.value = ScriptReview._author;
          }
          document.querySelectorAll('.sr-tab').forEach(t => {
              const on = t.dataset.tab === ScriptReview._tab;
              t.style.borderBottom = on ? '2px solid var(--primary)' : '2px solid transparent';
              t.style.color = on ? 'var(--text-main)' : 'var(--text-sec)';
          });
          // Ne montrer que les commentaires du type de partage courant.
          let list = ScriptReview._comments.filter(c => (c.kind || 'scenario') === ScriptReview._kind);
          if(ScriptReview._author !== 'all') list = list.filter(c => c.author_email === ScriptReview._author);
          if(ScriptReview._tab === 'global') {
              const g = list.filter(c => c.scope === 'project').sort((a, b) => (a.validated ? 1 : 0) - (b.validated ? 1 : 0));
              body.innerHTML = g.length ? g.map(ScriptReview._card).join('') : '<div style="color:var(--text-sec);text-align:center;padding:20px;font-size:0.85rem;">Aucune remarque générale.</div>';
          } else {
              const byElem = list.filter(c => c.scope === 'scene');
              const els = ScriptReview._elements(ScriptReview._kind);
              const groups = els.map(el => {
                  const cs = byElem.filter(c => c.scene_id === el.id).sort((a, b) => (a.validated ? 1 : 0) - (b.validated ? 1 : 0));
                  if(cs.length === 0) return '';
                  return `<div id="sr-grp-${ScriptReview._esc(el.id)}" style="margin-bottom:16px;"><div style="font-weight:700;font-size:0.85rem;margin-bottom:6px;">${ScriptReview._esc(el.label)}</div>${cs.map(ScriptReview._card).join('')}</div>`;
              }).filter(Boolean).join('');
              const empty = ScriptReview._kind === 'synopsis' ? 'Aucune remarque sur les sections.' : ScriptReview._kind === 'moodboard' ? 'Aucune remarque sur les planches.' : 'Aucune remarque sur les scènes.';
              body.innerHTML = groups || '<div style="color:var(--text-sec);text-align:center;padding:20px;font-size:0.85rem;">' + empty + '</div>';
          }
      },

      _card: (c) => {
          const who = ((c.author_first || '') + ' ' + (c.author_last || '')).trim() || c.author_email;
          const d = c.updated_at ? new Date(c.updated_at).toLocaleDateString('fr-FR') : '';
          const on = c.validated;
          const clickable = c.scope === 'scene' && c.scene_id;
          let clickAttr = '';
          if(clickable) {
              if(ScriptReview._kind === 'synopsis') {
                  const secMap = { idea: 'synopsis', short: 'short', long: 'long' };
                  const sec = secMap[c.scene_id] || 'synopsis';
                  clickAttr = ` onclick="app.Synopsis.switchSection('${sec}')" title="Aller à cette section"`;
              } else if(ScriptReview._kind === 'scenario') {
                  clickAttr = ` onclick="app.ScriptReview._scrollScript('${ScriptReview._esc(c.scene_id)}')" title="Voir cette scène dans le scénario"`;
              }
              // sequencier : la scene est deja nommee par l'en-tete du groupe,
              // et il n'y a pas de colonne script a faire defiler ici -> pas de clic.
          }
          const hasClick = !!clickAttr;
          return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;${hasClick ? 'cursor:pointer;' : ''}${on ? 'opacity:0.7;background:rgba(22,163,74,0.08);' : ''}"${clickAttr}>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
                  <div style="font-size:0.78rem;color:var(--text-sec);"><strong style="color:var(--text-main);">${ScriptReview._esc(who)}</strong> · ${d}</div>
                  <label style="display:flex;align-items:center;gap:4px;font-size:0.72rem;cursor:pointer;white-space:nowrap;" onclick="event.stopPropagation()"><input type="checkbox" ${on ? 'checked' : ''} onchange="app.ScriptReview._validate('${ScriptReview._esc(c.id)}', this.checked)"> validé</label>
              </div>
              <div style="font-size:0.88rem;white-space:pre-wrap;word-break:break-word;">${ScriptReview._esc(c.body)}</div>
          </div>`;
      },

      _validate: async (id, val) => {
          try {
              await supabase.functions.invoke('script-share', { body: { action: 'validate', commentId: id, validated: val } });
              const c = ScriptReview._comments.find(x => x.id === id);
              if(c) c.validated = val;
              ScriptReview._render();
          } catch(e) { console.error('[ScriptReview] validate:', e); Utils.toast('Erreur', 'error'); }
      },

      // --- Bulles clignotantes (commentaires invites non vus), une par onglet ---
      refreshBadge: async () => {
          const pid = state.currentProjectId;
          if(!pid) return;
          try {
              const { data } = await supabase.functions.invoke('script-share', { body: { action: 'list', projectId: pid } });
              const comments = (data && data.comments) || [];
              Object.keys(ScriptReview._kindTab).forEach(kind => {
                  const unseen = comments.some(c => !c.seen && (c.kind || 'scenario') === kind);
                  ScriptReview._setBadge(kind, unseen);
              });
          } catch(e) { /* silencieux : le badge est secondaire */ }
      },

      markSeen: async (kind) => {
          const k = (kind && ScriptReview._kindTab[kind]) ? kind : 'scenario';
          ScriptReview._setBadge(k, false);
          const pid = state.currentProjectId;
          if(!pid) return;
          try { await supabase.functions.invoke('script-share', { body: { action: 'seen', projectId: pid, kind: k } }); } catch(e) { /* silencieux */ }
      },

      _setBadge: (kind, on) => {
          ScriptReview._injectBadgeCss();
          const tabName = ScriptReview._kindTab[kind] || 'script';
          const tab = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
          if(!tab) return;
          let b = tab.querySelector('.sr-blink');
          if(on) {
              if(getComputedStyle(tab).position === 'static') tab.style.position = 'relative';
              if(!b) { b = document.createElement('span'); b.className = 'sr-blink'; b.textContent = '💬'; tab.appendChild(b); }
          } else if(b) { b.remove(); }
      },

      _injectBadgeCss: () => {
          if(document.getElementById('sr-blink-css')) return;
          const st = document.createElement('style');
          st.id = 'sr-blink-css';
          st.textContent = '.sr-blink{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:0.95rem;pointer-events:none;animation:sr-blink-kf 1.6s ease-in-out infinite;filter:drop-shadow(0 0 2px rgba(0,0,0,0.45));}@keyframes sr-blink-kf{0%,100%{opacity:1;}50%{opacity:0.2;}}';
          document.head.appendChild(st);
      },

      // Clic sur une carte de commentaire -> defile le scenario jusqu'a la scene.
      // Les deux vues coexistent dans le DOM (l'inactive est cachee). On prend
      // l'element REELLEMENT visible (offsetParent === null quand cache), ce qui
      // marche quelle que soit la maniere dont l'autre vue est masquee.
      _scrollScript: (sceneId) => {
          if(!sceneId) return;
          const c = document.querySelector('.script-continuous-scene[data-scene-id="' + sceneId + '"]');
          const e = document.getElementById('editor-' + sceneId);
          const el = (c && c.offsetParent !== null) ? c : ((e && e.offsetParent !== null) ? e : (c || e));
          if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },

      // Clic sur l'en-tete d'une scene (scenario) quand le panneau est ouvert ->
      // onglet Par scene + defile jusqu'aux commentaires de cette scene.
      _alignToScene: (sceneId) => {
          ScriptReview._tab = 'scene';
          ScriptReview._render();
          const grp = document.getElementById('sr-grp-' + sceneId);
          if(grp) grp.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },

      // Delegation : un seul ecouteur global. Un clic sur la colonne info d'une
      // scene (uniquement si le panneau commentaires est ouvert) aligne le panneau.
      _ensureDelegation: () => {
          if(ScriptReview._delegated) return;
          ScriptReview._delegated = true;
          document.addEventListener('click', (e) => {
              const panel = document.getElementById('comments-panel');
              if(!panel || !panel.classList.contains('open')) return;
              if(!e.target || !e.target.closest) return;
              // Vue Scenes : la colonne info de la scene.
              const col = e.target.closest('.script-info-col');
              if(col && col.parentElement) {
                  const box = col.parentElement.querySelector('.script-editor-box[id^="editor-"]');
                  if(box) { ScriptReview._alignToScene(box.id.slice('editor-'.length)); return; }
              }
              // Vue Script continue : l'en-tete (numero). Le titre editable stoppe
              // sa propre propagation, il ne declenche donc pas l'alignement.
              const head = e.target.closest('.script-continuous-heading');
              if(head) {
                  const sc = head.closest('.script-continuous-scene');
                  if(sc && sc.dataset && sc.dataset.sceneId) ScriptReview._alignToScene(sc.dataset.sceneId);
              }
          });
      },
  };

  // ==================== MODULE PROJECTWELCOME (message d'accueil) ====================
  // Affiche une fois (drapeau global synchronise, comme la visite guidee) un message
  // d'accueil a la premiere ouverture d'un projet : ou trouver l'aide, comment masquer
  // les onglets inutiles, et la methode d'ecriture (idee -> resume court -> resume long
  // -> scenario). Reouvrable depuis le menu Fichier. Aucun contenu dynamique : rien a
  // echapper. La route publique /scenario/<jeton> court-circuite loadProject en amont,
  // ce message n'y apparait donc jamais.