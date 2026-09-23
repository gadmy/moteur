
  const MiniChat = {
      channel: null,
      projectId: null,
      messages: [],
      MAX_MESSAGES: 50,
      MAX_AGE_MS: 50 * 60 * 1000,
      BUCKET: 'minichat',
      MAX_FILE_MB: 20,
      _gcTimer: null,
      _expanded: false,
      _unseen: 0,

      start: (projectId) => {
          if(!projectId || !state.currentUser) return;
          if(MiniChat.projectId === projectId && MiniChat.channel) return;
          MiniChat.stop();
          MiniChat.projectId = projectId;
          MiniChat.messages = [];
          MiniChat._unseen = 0;
          MiniChat._expanded = false;
          MiniChat._buildWidget();
          MiniChat.channel = supabase.channel('minichat_' + projectId, { config: { broadcast: { self: true } } })
              .on('broadcast', { event: 'msg' }, (p) => MiniChat._receive(p.payload))
              .subscribe();
          MiniChat._gcTimer = setInterval(MiniChat._tick, 30000);
          MiniChat._cleanupOldFiles(); // ménage paresseux des fichiers > 24 h (sans await)
      },

      stop: () => {
          if(MiniChat.channel) { try { supabase.removeChannel(MiniChat.channel); } catch(e) {} }
          MiniChat.channel = null;
          MiniChat.projectId = null;
          MiniChat.messages = [];
          if(MiniChat._gcTimer) { clearInterval(MiniChat._gcTimer); MiniChat._gcTimer = null; }
          const w = document.getElementById('minichat-root');
          if(w) w.remove();
          document.body.classList.remove('has-minichat');
      },

      // Construit la bulle + le panneau (DOM créé par JS, aucun HTML statique)
      _buildWidget: () => {
          const oldRoot = document.getElementById('minichat-root');
          if(oldRoot) oldRoot.remove();
          const root = document.createElement('div');
          root.id = 'minichat-root';
          document.body.appendChild(root);
          // Signale a la bulle de retour qu'elle doit remonter d'un cran (CSS).
          document.body.classList.add('has-minichat');
          MiniChat._render();
      },

      toggle: () => {
          MiniChat._expanded = !MiniChat._expanded;
          if(MiniChat._expanded) MiniChat._unseen = 0;
          MiniChat._render();
      },

      _onlineCount: () => {
          const me = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
          const rows = (state.dbPresence || []).filter(r => r.project_id === MiniChat.projectId);
          const emails = new Set(rows.map(r => (r.user_email || '').toLowerCase()));
          emails.delete(me);
          return emails.size;
      },

      _render: () => {
          const root = document.getElementById('minichat-root');
          if(!root) return;
          root.innerHTML = '';
          if(!MiniChat._expanded) {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'minichat-bubble';
              b.title = 'Mini-chat du projet (éphémère)';
              b.textContent = '💬';
              if(MiniChat._unseen > 0) {
                  const badge = document.createElement('span');
                  badge.className = 'minichat-bubble-badge';
                  badge.textContent = MiniChat._unseen > 9 ? '9+' : String(MiniChat._unseen);
                  b.appendChild(badge);
              }
              b.addEventListener('click', MiniChat.toggle);
              root.appendChild(b);
              return;
          }
          const panel = document.createElement('div');
          panel.className = 'minichat-panel';
          const head = document.createElement('div');
          head.className = 'minichat-head';
          const title = document.createElement('div');
          const n = MiniChat._onlineCount();
          title.innerHTML = '💬 Mini-chat <span class="minichat-online">· ' + n + ' autre' + (n > 1 ? 's' : '') + ' en ligne · éphémère</span>';
          const close = document.createElement('button');
          close.type = 'button';
          close.className = 'miniview-btn';
          close.textContent = '▾';
          close.title = 'Réduire';
          close.addEventListener('click', MiniChat.toggle);
          head.appendChild(title);
          head.appendChild(close);
          const body = document.createElement('div');
          body.className = 'minichat-body';
          body.id = 'minichat-body';
          const foot = document.createElement('div');
          foot.className = 'minichat-foot';
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'minichat-input';
          input.id = 'minichat-input';
          input.maxLength = 500;
          input.placeholder = 'Message éphémère...';
          input.addEventListener('keydown', (e) => { if(e.key === 'Enter') MiniChat.send(); });
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.id = 'minichat-file-input';
          fileInput.style.display = 'none';
          fileInput.addEventListener('change', MiniChat.sendFile);
          const attach = document.createElement('button');
          attach.type = 'button';
          attach.className = 'minichat-attach';
          attach.id = 'minichat-file-btn';
          attach.textContent = '📎';
          attach.title = 'Envoyer un fichier (max ' + MiniChat.MAX_FILE_MB + ' Mo, supprimé après 48 h)';
          attach.addEventListener('click', () => fileInput.click());
          const send = document.createElement('button');
          send.type = 'button';
          send.className = 'minichat-send';
          send.textContent = '➤';
          send.title = 'Envoyer';
          send.addEventListener('click', MiniChat.send);
          foot.appendChild(input);
          foot.appendChild(fileInput);
          foot.appendChild(attach);
          foot.appendChild(send);
          panel.appendChild(head);
          panel.appendChild(body);
          panel.appendChild(foot);
          root.appendChild(panel);
          MiniChat._renderMessages();
          input.focus();
      },

      _renderMessages: () => {
          const body = document.getElementById('minichat-body');
          if(!body) return;
          if(MiniChat.messages.length === 0) {
              body.innerHTML = '<div class="minichat-empty">Personne n\'a encore parlé.<br>Les messages s\'effacent au bout de ~50 min<br>et ne sont jamais conservés.</div>';
              return;
          }
          const me = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
          body.innerHTML = '';
          MiniChat.messages.forEach(m => {
              const div = document.createElement('div');
              div.className = 'minichat-msg' + ((m.senderEmail || '').toLowerCase() === me ? ' mine' : '');
              const t = new Date(m.ts);
              const hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
              let content;
              // v602 (audit securite) : un lien de fichier ne peut etre qu'une
              // adresse https — jamais « javascript: », qu'un message forge
              // aurait pu glisser.
              if(m.fileUrl && /^https:\/\//i.test(String(m.fileUrl))) {
                  content = '<a class="minichat-file" href="' + Utils.escape(m.fileUrl) + '" target="_blank" rel="noopener" download>📎 ' + Utils.escape(m.fileName || 'fichier') + '</a> <span class="minichat-msg-meta">' + MiniChat._fmtSize(m.fileSize || 0) + '</span>';
              } else {
                  content = Utils.escape(m.text || '');
              }
              div.innerHTML = '<div class="minichat-msg-meta">' + Utils.escape(m.senderName || '?') + ' · ' + hh + '</div>'
                            + '<div>' + content + '</div>';
              body.appendChild(div);
          });
          body.scrollTop = body.scrollHeight;
      },

      send: () => {
          const input = document.getElementById('minichat-input');
          if(!input || !MiniChat.channel) return;
          const text = input.value.trim();
          if(!text) return;
          const msg = {
              id: 'mc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
              text: text,
              senderEmail: state.currentUser.email,
              senderName: (state.userProfile && (state.userProfile.name || state.userProfile.displayName)) || state.currentUser.email.split('@')[0],
              ts: Date.now()
          };
          // broadcast self:true -> notre propre message revient par le même canal (rendu unique)
          MiniChat.channel.send({ type: 'broadcast', event: 'msg', payload: msg });
          input.value = '';
      },

      // ===== Fichiers éphémères (bucket 'minichat', supprimés après 24 h) =====
      sendFile: async (event) => {
          const fileInput = event.target;
          const file = fileInput.files && fileInput.files[0];
          fileInput.value = '';
          if(!file || !MiniChat.channel) return;
          if(file.size > MiniChat.MAX_FILE_MB * 1024 * 1024) {
              Utils.toast('Fichier trop volumineux (max ' + MiniChat.MAX_FILE_MB + ' Mo)', 'warning');
              return;
          }
          const btn = document.getElementById('minichat-file-btn');
          if(btn) { btn.disabled = true; btn.textContent = '⏳'; }
          try {
              const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
              const path = MiniChat.projectId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + safeName;
              const { error } = await supabase.storage.from(MiniChat.BUCKET).upload(path, file, { upsert: false });
              if(error) throw error;
              const { data: urlData, error: signErr } = await supabase.storage.from(MiniChat.BUCKET).createSignedUrl(path, 172800);
              if(signErr) throw signErr;
              const msg = {
                  id: 'mc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                  fileName: file.name,
                  fileUrl: urlData.signedUrl,
                  fileSize: file.size,
                  senderEmail: state.currentUser.email,
                  senderName: (state.userProfile && (state.userProfile.name || state.userProfile.displayName)) || state.currentUser.email.split('@')[0],
                  ts: Date.now()
              };
              MiniChat.channel.send({ type: 'broadcast', event: 'msg', payload: msg });
          } catch(e) {
              console.error('MiniChat fichier:', e);
              Utils.toast('Échec de l\'envoi du fichier (le bucket \'minichat\' existe-t-il ?)', 'error');
          }
          if(btn) { btn.disabled = false; btn.textContent = '📎'; }
      },

      _fmtSize: (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko',

      // Ménage paresseux : à l'ouverture du projet, supprime les fichiers de plus de 24 h
      // Menage paresseux des fichiers ephemeres, a l'ouverture du chat.
      // 1er septembre — POURQUOI IL NE SUPPRIMAIT RIEN, ET POURQUOI PERSONNE
      // NE L'AVAIT VU. Deux silences superposes :
      //   1. supabase.storage.remove() ne LEVE PAS d'exception quand la RLS
      //      refuse : elle renvoie { data, error }. Le try/catch ne pouvait
      //      donc rien attraper, il ne servait qu'a masquer le reste.
      //   2. La valeur de retour n'etait pas lue du tout.
      // Resultat : un refus serveur ressemblait trait pour trait a un menage
      // reussi. La cause reelle (policy DELETE absente sur le bucket) est
      // hors du fichier ; ce qui est corrige ici, c'est le fait qu'on ne
      // pouvait PAS LE SAVOIR. Le refus part maintenant dans la console —
      // pas en message a l'ecran : c'est une tache de fond, l'utilisateur
      // n'a rien demande et ne peut rien y faire.
      _cleanupOldFiles: async () => {
          try {
              const { data: files, error: errList } = await supabase.storage
                  .from(MiniChat.BUCKET).list(MiniChat.projectId, { limit: 100 });
              if(errList) { console.warn('[MiniChat] menage : lecture du bucket refusee —', errList.message); return; }
              if(!files || !files.length) return;
              const cutoff = Date.now() - 48 * 60 * 60 * 1000;
              const olds = files
                  .filter(f => f.created_at && new Date(f.created_at).getTime() < cutoff)
                  .map(f => MiniChat.projectId + '/' + f.name);
              if(!olds.length) return;
              const { error: errDel } = await supabase.storage.from(MiniChat.BUCKET).remove(olds);
              if(errDel) {
                  console.warn('[MiniChat] menage : ' + olds.length + ' fichier(s) perime(s) NON supprime(s) —',
                               errDel.message, '(policy DELETE manquante sur le bucket minichat ?)');
              }
          } catch(e) {
              console.warn('[MiniChat] menage interrompu —', e && e.message);
          }
      },

      _receive: (m) => {
          if(!m || !m.id) return;
          if(MiniChat.messages.some(x => x.id === m.id)) return;
          MiniChat.messages.push(m);
          if(MiniChat.messages.length > MiniChat.MAX_MESSAGES) {
              MiniChat.messages = MiniChat.messages.slice(-MiniChat.MAX_MESSAGES);
          }
          if(!MiniChat._expanded) {
              const me = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
              if((m.senderEmail || '').toLowerCase() !== me) MiniChat._unseen++;
              MiniChat._render();
          } else {
              MiniChat._renderMessages();
          }
      },

      // Toutes les 30 s : purge des messages trop vieux + rafraîchit le compteur « en ligne »
      _tick: () => {
          const before = MiniChat.messages.length;
          const now = Date.now();
          MiniChat.messages = MiniChat.messages.filter(m => now - m.ts < MiniChat.MAX_AGE_MS);
          if(MiniChat._expanded) MiniChat._render();
          else if(MiniChat.messages.length !== before) MiniChat._renderMessages();
      }
  };

  // GlobalPresence — badges « qui est dans quel projet » sur les cartes du dashboard (source : table user_presence via DBPresence).