
  const ScriptReader = {
      _token: null, _first: '', _last: '', _email: '', _scenes: [], _title: '', _kind: 'scenario', _mine: { project: '', scenes: {} },

      // Libelles adaptes au type de partage. 'scenario' reste le defaut.
      _labels: {
          scenario:   { per: 'Par scène',   one: 'scène',   hint: 'Votre remarque sur cette scène…' },
          synopsis:   { per: 'Par section', one: 'section', hint: 'Votre remarque sur cette section…' },
          sequencier: { per: 'Par scène',   one: 'scène',   hint: 'Votre remarque sur cette scène…' },
          storyboard: { per: 'Par scène',   one: 'scène',   hint: 'Votre remarque sur cette scène…' },
          moodboard:  { per: 'Par planche', one: 'planche', hint: 'Votre remarque sur cette planche…' },
      },
      _lab: () => ScriptReader._labels[ScriptReader._kind] || ScriptReader._labels.scenario,

      // Detecte /scenario/<jeton> ; si oui, monte le lecteur et renvoie true.
      boot: () => {
          const m = (window.location.pathname || '').match(/^\/scenario\/([A-Za-z0-9]+)\/?$/);
          if(!m) return false;
          ScriptReader._token = m[1];
          try { document.title = 'Relecture — Moteur'; } catch(_) {}
          ScriptReader._injectCss();
          ScriptReader._renderGate();
          return true;
      },

      _esc: (s) => { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; },

      _root: () => {
          let r = document.getElementById('reader-view');
          if(!r) { r = document.createElement('div'); r.id = 'reader-view'; document.body.appendChild(r); }
          return r;
      },

      _injectCss: () => {
          if(document.getElementById('reader-css')) return;
          const st = document.createElement('style');
          st.id = 'reader-css';
          st.textContent = [
              '#reader-view{position:fixed;inset:0;z-index:99999;background:#f4f4f5;color:#1a1a1a;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden;}',
              '#reader-view *{box-sizing:border-box;}',
              '.rd-top{flex:0 0 auto;background:#fff;border-bottom:1px solid #ddd;padding:10px 18px;display:flex;align-items:center;gap:12px;}',
              '.rd-top .rd-logo{font-weight:800;font-size:1.05rem;}',
              '.rd-top .rd-sub{color:#666;font-size:0.85rem;}',
              '.rd-body{flex:1 1 auto;display:flex;min-height:0;}',
              '.rd-left{flex:1 1 60%;overflow-y:auto;padding:24px;}',
              '.rd-right{flex:1 1 40%;max-width:460px;border-left:1px solid #ddd;background:#fff;display:flex;flex-direction:column;min-height:0;}',
              ".rd-page{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e2e2;border-radius:6px;padding:36px 48px;font-family:'Courier New',monospace;font-size:15px;line-height:1.5;}",
              '.rd-scene{margin-bottom:34px;}',
              '.rd-scene-h{font-weight:700;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:4px;}',
              '.rd-tabs{display:flex;border-bottom:1px solid #ddd;flex:0 0 auto;}',
              '.rd-tab{flex:1;padding:12px;text-align:center;cursor:pointer;font-weight:600;font-size:0.88rem;color:#666;border-bottom:2px solid transparent;}',
              '.rd-tab.active{color:#111;border-bottom-color:#2563eb;}',
              '.rd-pane{flex:1 1 auto;overflow-y:auto;padding:16px;display:none;}',
              '.rd-pane.active{display:block;}',
              '.rd-pane textarea{width:100%;border:1px solid #ccc;border-radius:6px;padding:10px;font-size:0.9rem;font-family:inherit;resize:vertical;}',
              '.rd-sc-block{margin-bottom:16px;}',
              '.rd-sc-title{font-size:0.82rem;font-weight:700;margin-bottom:4px;color:#333;}',
              '.rd-foot{flex:0 0 auto;border-top:1px solid #ddd;padding:12px 16px;background:#fafafa;}',
              '.rd-btn{background:#2563eb;color:#fff;border:none;border-radius:6px;padding:11px 18px;font-size:0.92rem;font-weight:600;cursor:pointer;width:100%;}',
              '.rd-btn:disabled{opacity:0.6;cursor:default;}',
              '.rd-gate{max-width:420px;margin:8vh auto;background:#fff;border:1px solid #e2e2e2;border-radius:10px;padding:28px;}',
              '.rd-gate h2{margin:0 0 8px;font-size:1.15rem;}',
              '.rd-gate p{color:#555;font-size:0.9rem;margin:0 0 18px;}',
              '.rd-gate input{width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid #ccc;border-radius:6px;font-size:0.92rem;}',
              '@media(max-width:820px){.rd-body{flex-direction:column;}.rd-right{max-width:none;border-left:none;border-top:1px solid #ddd;}}'
          ].join('');
          document.head.appendChild(st);
      },

      // Ecran de presentation (prenom / nom / e-mail).
      _renderGate: () => {
          const r = ScriptReader._root();
          r.innerHTML = `<div class="rd-top"><span class="rd-logo">🎬 Moteur</span><span class="rd-sub">Relecture</span></div>
              <div style="flex:1;overflow-y:auto;">
                  <div class="rd-gate">
                      <h2>Vous avez été invité à relire un document</h2>
                      <p>Présentez-vous pour accéder au texte et laisser vos commentaires à l'auteur.</p>
                      <input type="text" id="rd-first" placeholder="Prénom" data-tooltip="Prénom" data-allow-emojis="true">
                      <input type="text" id="rd-last" placeholder="Nom" data-tooltip="Nom" data-allow-emojis="true">
                      <input type="email" id="rd-email" placeholder="Adresse e-mail" data-tooltip="Adresse e-mail" data-allow-emojis="true">
                      <button class="rd-btn" id="rd-enter">Accéder</button>
                      <div id="rd-gate-err" style="color:#c0392b;font-size:0.82rem;margin-top:8px;"></div>
                  </div>
              </div>`;
          r.querySelector('#rd-enter').onclick = ScriptReader._enter;
      },

      _enter: async () => {
          const r = ScriptReader._root();
          const first = r.querySelector('#rd-first').value.trim();
          const last = r.querySelector('#rd-last').value.trim();
          const email = r.querySelector('#rd-email').value.trim().toLowerCase();
          const err = r.querySelector('#rd-gate-err');
          if(!first || !last) { err.textContent = "Merci d'indiquer votre prénom et votre nom."; return; }
          if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Adresse e-mail invalide.'; return; }
          ScriptReader._first = first; ScriptReader._last = last; ScriptReader._email = email;
          const btn = r.querySelector('#rd-enter'); btn.disabled = true; btn.textContent = 'Chargement…';
          try {
              const { data, error } = await supabase.functions.invoke('script-share', { body: { action: 'read', token: ScriptReader._token, email } });
              if(error || !data || !data.scenes) throw (error || new Error('read'));
              ScriptReader._scenes = data.scenes;
              ScriptReader._kind = (data.kind && ScriptReader._labels[data.kind]) ? data.kind : 'scenario';
              ScriptReader._title = data.project_title || '';
              ScriptReader._mine = { project: '', scenes: {} };
              (data.mine || []).forEach(c => { if(c.scope === 'project') ScriptReader._mine.project = c.body || ''; else ScriptReader._mine.scenes[c.scene_id] = c.body || ''; });
              ScriptReader._renderReader();
          } catch(e) {
              console.error('[ScriptReader] read:', e);
              err.textContent = 'Ce lien est invalide, expiré ou révoqué.';
              btn.disabled = false; btn.textContent = 'Accéder';
          }
      },

      _renderReader: () => {
          const r = ScriptReader._root();
          const esc = ScriptReader._esc;
          const lab = ScriptReader._lab();
          const left = ScriptReader._scenes.map(s => `<div class="rd-scene" id="rdL-${esc(s.id)}"><div class="rd-scene-h" style="cursor:pointer;" title="Voir les commentaires" onclick="app.ScriptReader._toComment('${esc(s.id)}')">${s.number}. ${esc(s.title)}</div><div class="rd-scene-body">${s.content || ''}</div></div>`).join('') || '<p>(Document vide)</p>';
          const perScene = ScriptReader._scenes.map(s => `<div class="rd-sc-block" id="rdR-${esc(s.id)}"><div class="rd-sc-title" style="cursor:pointer;" title="Aller à cet endroit du document" onclick="app.ScriptReader._toScene('${esc(s.id)}')">${s.number}. ${esc(s.title)}</div><textarea rows="3" class="rd-sc-input" data-scene="${esc(s.id)}" data-allow-emojis="true" placeholder="${esc(lab.hint)}" data-tooltip="${esc(lab.hint)}">${esc(ScriptReader._mine.scenes[s.id] || '')}</textarea></div>`).join('');
          r.innerHTML = `<div class="rd-top"><span class="rd-logo">🎬 Moteur</span><span class="rd-sub">${esc(ScriptReader._title)} — relecture</span></div>
              <div class="rd-body">
                  <div class="rd-left"><div class="rd-page">${left}</div></div>
                  <div class="rd-right">
                      <div class="rd-tabs"><div class="rd-tab active" data-pane="global">Global</div><div class="rd-tab" data-pane="scene">${esc(lab.per)}</div></div>
                      <div class="rd-pane active" id="rd-pane-global"><textarea rows="12" id="rd-global" data-allow-emojis="true" placeholder="Vos remarques générales sur le projet…" data-tooltip="Vos remarques générales sur le projet…">${esc(ScriptReader._mine.project || '')}</textarea></div>
                      <div class="rd-pane" id="rd-pane-scene">${perScene}</div>
                      <div class="rd-foot"><button class="rd-btn" id="rd-send">Envoyer les commentaires</button><div id="rd-send-msg" style="text-align:center;font-size:0.82rem;margin-top:8px;"></div></div>
                  </div>
              </div>`;
          r.querySelectorAll('.rd-tab').forEach(t => t.onclick = () => {
              r.querySelectorAll('.rd-tab').forEach(x => x.classList.remove('active'));
              r.querySelectorAll('.rd-pane').forEach(x => x.classList.remove('active'));
              t.classList.add('active');
              const pane = r.querySelector('#rd-pane-' + t.dataset.pane);
              if(pane) pane.classList.add('active');
          });
          r.querySelector('#rd-send').onclick = ScriptReader._submit;
      },

      _submit: async () => {
          const r = ScriptReader._root();
          const comments = [];
          const g = r.querySelector('#rd-global').value.trim();
          if(g) comments.push({ scope: 'project', sceneId: '', body: g });
          r.querySelectorAll('.rd-sc-input').forEach(ta => {
              const v = ta.value.trim();
              if(v) comments.push({ scope: 'scene', sceneId: ta.dataset.scene, body: v });
          });
          if(comments.length === 0) { ScriptReader._msg("Écrivez au moins une remarque avant d'envoyer.", true); return; }
          const btn = r.querySelector('#rd-send'); btn.disabled = true; btn.textContent = 'Envoi…';
          try {
              const { data, error } = await supabase.functions.invoke('script-share', { body: { action: 'submit', token: ScriptReader._token, first: ScriptReader._first, last: ScriptReader._last, email: ScriptReader._email, comments } });
              if(error || !data || !data.ok) throw (error || new Error('submit'));
              ScriptReader._msg('Merci ! Vos commentaires ont été envoyés à l\'auteur.', false);
          } catch(e) {
              console.error('[ScriptReader] submit:', e);
              ScriptReader._msg('Envoi impossible. Réessayez dans un instant.', true);
          } finally {
              btn.disabled = false; btn.textContent = 'Envoyer les commentaires';
          }
      },

      _msg: (txt, isErr) => {
          const el = document.getElementById('rd-send-msg');
          if(el) { el.style.color = isErr ? '#c0392b' : '#16a34a'; el.textContent = txt; }
      },

      // Clic sur une scene (gauche) -> onglet Par scene + amene son champ en vue.
      _toComment: (id) => {
          const r = ScriptReader._root();
          r.querySelectorAll('.rd-tab').forEach(x => x.classList.remove('active'));
          r.querySelectorAll('.rd-pane').forEach(x => x.classList.remove('active'));
          const tab = r.querySelector('.rd-tab[data-pane="scene"]'); if(tab) tab.classList.add('active');
          const pane = r.querySelector('#rd-pane-scene'); if(pane) pane.classList.add('active');
          const block = document.getElementById('rdR-' + id);
          if(block) { block.scrollIntoView({ behavior: 'smooth', block: 'center' }); const ta = block.querySelector('textarea'); if(ta) ta.focus(); }
      },

      // Clic sur un champ de scene (droite) -> defile le scenario jusqu'a la scene.
      _toScene: (id) => {
          const el = document.getElementById('rdL-' + id);
          if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
  };

  // ==================== MODULE SCRIPTREVIEW (reception des commentaires invites, cote site) ====================
  // Reutilise le panneau lateral #comments-panel comme "2e colonne". Meme presentation
  // que chez l'invite : deux onglets Global / Par scene. Ajoute un selecteur d'auteur
  // (plusieurs invites possibles) et un toggle "valide" par commentaire. Lecture via
  // l'Edge Function script-share (action 'list' / 'validate').