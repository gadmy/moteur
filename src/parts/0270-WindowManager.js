
  const WindowManager = {
      wins: {},
      zTop: 1000,
      taskbar: null,

      init: () => {
          if(WindowManager.taskbar) return;
          const tb = document.createElement('div');
          tb.id = 'wm-taskbar';
          document.body.appendChild(tb);
          WindowManager.taskbar = tb;
      },

      open: (id, title, content, opts) => {
          WindowManager.init();
          if(WindowManager.wins[id]) { WindowManager.restore(id); WindowManager.focus(id); return WindowManager.wins[id]; }
          opts = opts || {};
          const n = Object.keys(WindowManager.wins).length;
          const x = (opts.x != null) ? opts.x : (60 + n * 28);
          const y = (opts.y != null) ? opts.y : (70 + n * 28);
          const w = opts.w || 540, h = opts.h || 400;
          const win = document.createElement('div');
          win.className = 'wm-window';
          win.dataset.wmId = id;
          win.style.cssText = 'left:' + x + 'px; top:' + y + 'px; width:' + w + 'px; height:' + h + 'px; z-index:' + (++WindowManager.zTop) + ';';
          const isTab = id.indexOf('tab:') === 0;
          win.innerHTML =
              '<div class="wm-titlebar"><span class="wm-title"></span>'
              + (isTab ? '<button class="wm-toggle" title="Consultation — clique pour passer en modification"></button><span class="wm-holder" style="display:none"></span>' : '')
              + '<div class="wm-actions">'
              + '<button class="wm-btn wm-min" title="Réduire">—</button>'
              + '<button class="wm-btn wm-max" title="Agrandir">▢</button>'
              + '<button class="wm-btn wm-close" title="Fermer">✕</button>'
              + '</div></div>'
              + '<div class="wm-body"></div>'
              + '<div class="wm-resize wm-r-n"></div><div class="wm-resize wm-r-s"></div>'
              + '<div class="wm-resize wm-r-e"></div><div class="wm-resize wm-r-w"></div>'
              + '<div class="wm-resize wm-r-ne"></div><div class="wm-resize wm-r-nw"></div>'
              + '<div class="wm-resize wm-r-se"></div><div class="wm-resize wm-r-sw"></div>';
          win.querySelector('.wm-title').textContent = title || '';
          const body = win.querySelector('.wm-body');
          if(typeof content === 'string') body.innerHTML = content;
          else if(content instanceof HTMLElement) body.appendChild(content);
          document.body.appendChild(win);
          const rec = { el: win, body: body, title: title || '', id: id, onClose: opts.onClose, editMode: false, state: { x: x, y: y, w: w, h: h, min: false, max: false } };
          WindowManager.wins[id] = rec;
          WindowManager._wireButtons(rec);
          const tg = win.querySelector('.wm-toggle');
          if(tg) {
              tg.addEventListener('mousedown', (e) => e.stopPropagation());
              tg.addEventListener('click', (e) => { e.stopPropagation(); WindowManager.toggleEdit(id); });
          }
          WindowManager._wireDrag(rec);
          WindowManager._wireResize(rec);
          win.addEventListener('mousedown', () => WindowManager.focus(id), true);
          WindowManager.focus(id);
          WindowManager._persist();
          return rec;
      },

      focus: (id) => {
          const rec = WindowManager.wins[id]; if(!rec) return;
          rec.el.style.zIndex = ++WindowManager.zTop;
      },

      _wireButtons: (rec) => {
          rec.el.querySelector('.wm-close').addEventListener('click', () => WindowManager.close(rec.id));
          rec.el.querySelector('.wm-min').addEventListener('click', () => WindowManager.minimize(rec.id));
          rec.el.querySelector('.wm-max').addEventListener('click', () => WindowManager.toggleMax(rec.id));
          rec.el.querySelector('.wm-titlebar').addEventListener('dblclick', (e) => { if(!e.target.closest('.wm-btn')) WindowManager.toggleMax(rec.id); });
      },

      _wireDrag: (rec) => {
          const bar = rec.el.querySelector('.wm-titlebar');
          bar.addEventListener('mousedown', (e) => {
              if(e.target.closest('.wm-btn') || rec.state.max) return;
              e.preventDefault();
              WindowManager.focus(rec.id);
              const sx = e.clientX, sy = e.clientY, ox = rec.el.offsetLeft, oy = rec.el.offsetTop;
              const move = (ev) => {
                  let nx = ox + (ev.clientX - sx), ny = oy + (ev.clientY - sy);
                  nx = Math.max(0, Math.min(nx, window.innerWidth - 80));
                  ny = Math.max(0, Math.min(ny, window.innerHeight - 40));
                  rec.el.style.left = nx + 'px'; rec.el.style.top = ny + 'px';
                  rec.state.x = nx; rec.state.y = ny;
              };
              const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); WindowManager._persist(); };
              document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
          });
      },

      _wireResize: (rec) => {
          rec.el.querySelectorAll('.wm-resize').forEach((handle) => {
              handle.addEventListener('mousedown', (e) => {
                  if(rec.state.max) return;
                  e.preventDefault(); e.stopPropagation();
                  WindowManager.focus(rec.id);
                  const dir = (handle.className.match(/wm-r-([a-z]+)/) || [])[1] || '';
                  const sx = e.clientX, sy = e.clientY;
                  const ox = rec.el.offsetLeft, oy = rec.el.offsetTop, ow = rec.el.offsetWidth, oh = rec.el.offsetHeight;
                  const minW = 260, minH = 160;
                  const move = (ev) => {
                      const dx = ev.clientX - sx, dy = ev.clientY - sy;
                      let nx = ox, ny = oy, nw = ow, nh = oh;
                      if(dir.indexOf('e') > -1) nw = Math.max(minW, ow + dx);
                      if(dir.indexOf('s') > -1) nh = Math.max(minH, oh + dy);
                      if(dir.indexOf('w') > -1) { nw = Math.max(minW, ow - dx); nx = ox + (ow - nw); }
                      if(dir.indexOf('n') > -1) { nh = Math.max(minH, oh - dy); ny = oy + (oh - nh); }
                      rec.el.style.width = nw + 'px'; rec.el.style.height = nh + 'px';
                      rec.el.style.left = nx + 'px'; rec.el.style.top = ny + 'px';
                      rec.state.x = nx; rec.state.y = ny; rec.state.w = nw; rec.state.h = nh;
                  };
                  const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); WindowManager._persist(); };
                  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
              });
          });
      },

      minimize: (id) => {
          const rec = WindowManager.wins[id]; if(!rec) return;
          rec.state.min = true; rec.el.style.display = 'none';
          WindowManager._renderTaskbar(); WindowManager._persist();
      },

      restore: (id) => {
          const rec = WindowManager.wins[id]; if(!rec) return;
          rec.state.min = false; rec.el.style.display = 'flex';
          WindowManager.focus(id); WindowManager._renderTaskbar(); WindowManager._persist();
      },

      toggleMax: (id) => {
          const rec = WindowManager.wins[id]; if(!rec) return;
          if(rec.state.max) {
              rec.state.max = false;
              rec.el.classList.remove('wm-maximized');
              rec.el.style.left = rec.state.x + 'px'; rec.el.style.top = rec.state.y + 'px';
              rec.el.style.width = rec.state.w + 'px'; rec.el.style.height = rec.state.h + 'px';
          } else {
              rec.state.max = true;
              rec.el.classList.add('wm-maximized');
          }
          WindowManager.focus(id); WindowManager._persist();
      },

      close: (id) => {
          const rec = WindowManager.wins[id]; if(!rec) return;
          if(typeof rec.onClose === 'function') { try { rec.onClose(rec); } catch(_) {} }
          rec.el.remove(); delete WindowManager.wins[id];
          WindowManager._renderTaskbar(); WindowManager._persist();
      },

      closeAllMin: () => {
          Object.keys(WindowManager.wins)
              .filter(id => WindowManager.wins[id].state.min)
              .forEach(id => WindowManager.close(id));
      },

      // Ferme TOUTES les fenetres flottantes (casting, sous-onglets detaches) :
      // appelee au retour au HUB pour qu'aucune ne survive au projet quitte.
      closeAll: () => {
          Object.keys(WindowManager.wins).forEach(id => WindowManager.close(id));
      },

      _renderTaskbar: () => {
          const tb = WindowManager.taskbar; if(!tb) return;
          const mins = Object.keys(WindowManager.wins).map(k => WindowManager.wins[k]).filter(r => r.state.min);
          tb.innerHTML = '';
          tb.style.display = mins.length ? 'flex' : 'none';
          mins.forEach((r) => {
              const chip = document.createElement('div');
              chip.className = 'wm-chip';
              chip.textContent = r.title;
              chip.title = r.title;
              chip.addEventListener('click', () => WindowManager.restore(r.id));
              tb.appendChild(chip);
          });
          if(mins.length > 1) {
              const x = document.createElement('div');
              x.className = 'wm-chip wm-chip-closeall';
              x.textContent = '✕';
              x.title = 'Fermer toutes les fenêtres réduites';
              x.addEventListener('click', () => WindowManager.closeAllMin());
              tb.appendChild(x);
          }
          document.body.classList.toggle('wm-taskbar-open', mins.length > 0);
          document.body.style.setProperty('--wm-taskbar-h', (mins.length ? tb.offsetHeight : 0) + 'px');
      },

      poppedTabs: {},
      _homes: {},
      _wired: false,

      _ensureWired: () => {
          if(WindowManager._wired) return;
          WindowManager._wired = true;
          // Filet de sécurité : si on tente de switcher vers un onglet sorti, on focus sa fenêtre
          if(typeof UI !== 'undefined' && typeof UI.switchTab === 'function') {
              UI._origSwitchTab = UI.switchTab;
              UI.switchTab = function(tabName) {
                  if(WindowManager.poppedTabs[tabName]) {
                      WindowManager.restore('tab:' + tabName); WindowManager.focus('tab:' + tabName);
                      return;
                  }
                  const _r = UI._origSwitchTab.apply(this, arguments);
                  WindowManager._arbitrate();
                  WindowManager.syncSubnav();
                  return _r;
              };
          }
          // Ré-applique le masquage des sous-onglets sortis après chaque rendu de la sous-barre
          const sub = document.getElementById('tabsSubnav');
          if(sub && typeof MutationObserver !== 'undefined' && !WindowManager._obs) {
              WindowManager._obs = new MutationObserver(() => {
                  WindowManager.syncSubnav();
                  try { if(typeof LockManager !== 'undefined') LockManager.applyUI(); } catch(_) {}
              });
              WindowManager._obs.observe(sub, { childList: true });
          }
      },

      syncSubnav: () => {
          let myInitial = '?';
          let myMail = '';
          try { myMail = ((typeof state !== 'undefined' && state.currentUser && state.currentUser.email) || '').toLowerCase(); } catch(_) {}
          try { myInitial = ((myMail || '?').charAt(0) || '?').toUpperCase(); } catch(_) {}
          // v570 : cette pastille signale MA propre occupation d'un onglet. Elle etait
          // au bleu du theme (var(--primary)), ce qui la rendait incoherente avec mon
          // avatar de presence en haut de page — on croyait a une autre personne alors
          // qu'on etait seul. Elle porte desormais MA couleur, comme partout ailleurs.
          const myColor = myMail ? Utils.getColor(myMail) : '';
          // Domaines occupes par MES fenetres
          const busyDomains = {};
          try {
              Object.keys(WindowManager.poppedTabs).forEach(t => {
                  const d = (typeof LockDomains !== 'undefined') ? LockDomains.forTab(t) : null;
                  if(d) busyDomains[d] = true;
              });
              // ... et le domaine de l'onglet principal ou JE travaille en ce moment
              const act = document.querySelector('.tab-content.active:not(.wm-hosted)');
              if(act) {
                  const dAct = (typeof LockDomains !== 'undefined') ? LockDomains.forTab(act.id.replace('tab-','')) : null;
                  if(dAct) busyDomains[dAct] = true;
              }
          } catch(_) {}
          const setBadge = (el, on, title) => {
              el.classList.toggle('wm-occupied', on);
              let av = el.querySelector('.wm-self-avatar');
              if(on && !av) {
                  av = document.createElement('span');
                  av.className = 'wm-self-avatar';
                  av.textContent = myInitial;
                  if(myColor) av.style.background = myColor;
                  av.title = title;
                  el.appendChild(av);
              } else if(on && av) {
                  av.textContent = myInitial; av.title = title;
                  if(myColor) av.style.background = myColor;
              } else if(!on && av) {
                  av.remove();
              }
          };
          // Sous-onglets et onglets plats : badge sur TOUT le domaine concerne
          document.querySelectorAll('.tab-subbtn[data-tab], .tab-btn[data-tab]').forEach((b) => {
              const popped = !!WindowManager.poppedTabs[b.dataset.tab];
              const d = (typeof LockDomains !== 'undefined') ? LockDomains.forTab(b.dataset.tab) : null;
              const busy = popped || (d && busyDomains[d]);
              b.classList.toggle('wm-popped', popped);
              setBadge(b, !!busy, popped ? 'Ouvert dans une de tes fenêtres (clic = ramener la fenêtre)' : 'En cours d\'utilisation par toi');
          });
          // Onglets-categories : PAS de badge (trop charge) — nettoyage d'eventuels residus
          document.querySelectorAll('.tab-category .wm-self-avatar').forEach(el => el.remove());
          document.querySelectorAll('.tab-category.wm-occupied').forEach(el => el.classList.remove('wm-occupied'));
          // Signaler aux autres ce que je regarde (presence enrichie)
          try { if(typeof DBPresence !== 'undefined' && DBPresence.beatSoon) DBPresence.beatSoon(); } catch(_) {}
      },

      popFromMenu: () => {
          const tab = (typeof UICategories !== 'undefined') ? UICategories.currentTabTarget : null;
          const menu = document.getElementById('tab-color-menu'); if(menu) menu.classList.remove('visible');
          if(!tab || !tab.dataset || !tab.dataset.tab) return;
          const label = (tab.textContent || tab.dataset.tab).replace(/\s*×\s*$/, '').trim();
          WindowManager.popTab(tab.dataset.tab, label);
      },

      popTab: (name, label, geom) => {
          WindowManager._ensureWired();
          const content = document.getElementById('tab-' + name);
          if(!content) { if(typeof Utils !== 'undefined') Utils.toast('Contenu introuvable pour cet onglet', 'error'); return; }
          if(WindowManager.poppedTabs[name]) { WindowManager.restore('tab:' + name); WindowManager.focus('tab:' + name); return; }
          const wasActive = content.classList.contains('active');
          // mémorise l'emplacement d'origine via un commentaire repère
          const home = document.createComment('wm-home:' + name);
          content.parentNode.insertBefore(home, content);
          WindowManager._homes[name] = home;
          WindowManager.poppedTabs[name] = true;
          content.classList.add('wm-hosted');
          const _g = geom || {};
          WindowManager.open('tab:' + name, label || name, content, { onClose: () => WindowManager._restoreTab(name), x: _g.x, y: _g.y, w: _g.w, h: _g.h });
          if(_g.max) WindowManager.toggleMax('tab:' + name);
          if(_g.min) WindowManager.minimize('tab:' + name);
          if(_g.edit) { try { WindowManager.toggleEdit('tab:' + name); } catch(_) {} }
          WindowManager.syncSubnav();
          if(wasActive) WindowManager._switchAway(name);
          WindowManager._arbitrate();
          WindowManager._persist();
      },

      _switchAway: (name) => {
          const others = Array.prototype.slice.call(document.querySelectorAll('#tabsSubnav .tab-subbtn[data-tab]'))
              .map(b => b.dataset.tab).filter(t => t && t !== name && !WindowManager.poppedTabs[t]);
          if(others.length && typeof UI !== 'undefined' && typeof UI._origSwitchTab === 'function') {
              UI._origSwitchTab.call(UI, others[0]);
          }
      },

      _restoreTab: (name) => {
          const content = document.getElementById('tab-' + name);
          const home = WindowManager._homes[name];
          if(content) {
              content.classList.remove('wm-hosted');
              content.classList.remove('active');
              if(home && home.parentNode) { home.parentNode.insertBefore(content, home); home.remove(); }
          }
          delete WindowManager._homes[name];
          delete WindowManager.poppedTabs[name];
          try {
              const d = (typeof LockDomains !== 'undefined') ? LockDomains.forTab(name) : null;
              if(d && typeof LockManager !== 'undefined' && LockManager.winDomains[d]) {
                  delete LockManager.winDomains[d];
                  if(LockManager.currentDomain !== d) LockManager.release(d);
              }
          } catch(_) {}
          WindowManager.syncSubnav();
          WindowManager._arbitrate();
          WindowManager._persist();
      },

      // Arbitrage intra-session : 1 seul propriétaire éditable par domaine (onglet courant prioritaire).
      // Verrou serveur tenu par quelqu'un d'autre (frais) sur ce domaine ?
      _foreignLock: (dom) => {
          if(!dom || typeof state === 'undefined') return null;
          const l = (state.domainLocks || {})[dom];
          if(!l) return null;
          if(typeof LockManager !== 'undefined' && LockManager._mine(l)) return null;
          if(l.heartbeat_at && (Date.now() - new Date(l.heartbeat_at).getTime()) > 180000) return null;
          return l;
      },

      // Interrupteur consultation/modification d'une fenetre
      toggleEdit: (id) => {
          const rec = WindowManager.wins[id];
          if(!rec || id.indexOf('tab:') !== 0) return;
          if(typeof state !== 'undefined' && state.currentRole === 'viewer') { Utils.toast('Ton rôle est en lecture seule sur ce projet.', 'info'); return; }
          const name = id.slice(4);
          let dom = null;
          try { dom = (typeof LockDomains !== 'undefined') ? LockDomains.forTab(name) : null; } catch(_) {}
          if(!rec.editMode) {
              if(dom) {
                  const f = WindowManager._foreignLock(dom);
                  if(f) { Utils.toast('En travaux par ' + (LockManager._who(f) || 'quelqu\u2019un') + ' — modification impossible pour le moment.', 'info'); WindowManager._arbitrate(); return; }
                  const mainActive = document.querySelector('.tab-content.active:not(.wm-hosted)');
                  const mainDom = mainActive ? LockDomains.forTab(mainActive.id.replace('tab-','')) : null;
                  if(mainDom && mainDom === dom) { Utils.toast('Tu modifies déjà ce domaine dans l\u2019onglet principal.', 'info'); return; }
                  const clash = Object.keys(WindowManager.wins).some(oid => oid !== id && oid.indexOf('tab:') === 0 && WindowManager.wins[oid].editMode && LockDomains.forTab(oid.slice(4)) === dom);
                  if(clash) { Utils.toast('Ce domaine est déjà en modification dans une autre de tes fenêtres.', 'info'); return; }
              }
              rec.editMode = true;
              if(dom && typeof LockManager !== 'undefined' && !LockManager.isAlone()) {
                  LockManager.winDomains[dom] = true;
                  LockManager.acquire(dom).then((ok) => {
                      if(!ok) {
                          rec.editMode = false;
                          delete LockManager.winDomains[dom];
                          Utils.toast('Impossible de prendre la main : quelqu\u2019un vient de la prendre.', 'info');
                          WindowManager._arbitrate(); WindowManager._persist();
                      }
                  });
              }
          } else {
              rec.editMode = false;
              if(dom && typeof LockManager !== 'undefined') {
                  delete LockManager.winDomains[dom];
                  if(LockManager.currentDomain !== dom) LockManager.release(dom);
              }
          }
          WindowManager._arbitrate();
          WindowManager._persist();
      },

      _arbitrate: () => {
          let mainDomain = null;
          try {
              const mainActive = document.querySelector('.tab-content.active:not(.wm-hosted)');
              const mainTab = mainActive ? mainActive.id.replace('tab-', '') : null;
              mainDomain = (mainTab && typeof LockDomains !== 'undefined') ? LockDomains.forTab(mainTab) : null;
          } catch(_) {}
          const claimed = {};
          if(mainDomain) claimed[mainDomain] = 'main';
          Object.keys(WindowManager.wins).forEach((id) => {
              if(id.indexOf('tab:') !== 0) return;
              const rec = WindowManager.wins[id];
              const name = id.slice(4);
              let dom = null;
              try { dom = (typeof LockDomains !== 'undefined') ? LockDomains.forTab(name) : null; } catch(_) {}
              const foreign = dom ? WindowManager._foreignLock(dom) : null;
              if(foreign && rec.editMode) { rec.editMode = false; if(typeof LockManager !== 'undefined') delete LockManager.winDomains[dom]; }
              let readonly = true, roText = '';
              if(!rec.editMode) {
                  roText = foreign
                      ? ('🚧 En travaux par ' + ((typeof LockManager !== 'undefined' && LockManager._who(foreign)) || '?') + ' — consultation seule')
                      : '👁 Consultation — active l\u2019interrupteur pour modifier';
              } else if(dom && claimed[dom] && claimed[dom] !== id) {
                  rec.editMode = false;
                  if(typeof LockManager !== 'undefined') delete LockManager.winDomains[dom];
                  roText = '👁 Consultation — domaine déjà en modification ailleurs';
              } else {
                  if(dom) claimed[dom] = id;
                  readonly = false;
              }
              WindowManager._setReadonly(rec, readonly, roText);
              WindowManager._syncChrome(rec, foreign);
          });
      },

      // Met a jour l'interrupteur et le badge du detenteur dans la barre de titre
      _syncChrome: (rec, foreign) => {
          if(!rec || !rec.el) return;
          const tg = rec.el.querySelector('.wm-toggle');
          if(tg) {
              tg.classList.toggle('on', !!rec.editMode);
              tg.classList.toggle('disabled', !!foreign);
              tg.title = foreign
                  ? ('Verrouillé : en travaux par ' + ((typeof LockManager !== 'undefined' && LockManager._who(foreign)) || '?'))
                  : (rec.editMode ? 'Modification activée — clique pour repasser en consultation' : 'Consultation — clique pour passer en modification');
          }
          const hd = rec.el.querySelector('.wm-holder');
          if(hd) {
              if(foreign) {
                  const who = (typeof LockManager !== 'undefined' && LockManager._who(foreign)) || '?';
                  hd.style.display = '';
                  hd.textContent = (who.charAt(0) || '?').toUpperCase();
                  // v570 : couleur de la personne, comme partout ailleurs (etait un rouge fixe).
                  const em = (foreign.holder_email || '').toLowerCase();
                  hd.style.background = em ? Utils.getColor(em) : '';
                  hd.title = 'En travaux par ' + who;
              } else {
                  hd.style.display = 'none';
              }
          }
      },

      _setReadonly: (rec, ro, text) => {
          if(!rec || !rec.el) return;
          rec.el.classList.toggle('wm-readonly', !!ro);
          let banner = rec.el.querySelector(':scope > .wm-ro-banner');
          if(ro) {
              if(!banner) {
                  banner = document.createElement('div');
                  banner.className = 'wm-ro-banner';
                  rec.el.insertBefore(banner, rec.body);
              }
              banner.textContent = text || '🔒 Lecture seule';
          } else if(banner) {
              banner.remove();
          }
      },

      // Persistance : mémorise quels sous-onglets sont en fenêtre + leur géométrie.
      _persist: () => {
          try {
              const data = {};
              Object.keys(WindowManager.wins).forEach((id) => {
                  if(id.indexOf('tab:') !== 0) return;
                  const r = WindowManager.wins[id];
                  data[id.slice(4)] = { x: r.state.x, y: r.state.y, w: r.state.w, h: r.state.h, min: !!r.state.min, max: !!r.state.max, edit: !!r.editMode };
              });
              localStorage.setItem('moteur_wm_windows', JSON.stringify(data));
          } catch(_) {}
      },

      restoreSaved: () => {
          let data;
          try { data = JSON.parse(localStorage.getItem('moteur_wm_windows') || '{}'); } catch(_) { data = {}; }
          Object.keys(data).forEach((name) => {
              if(WindowManager.poppedTabs[name]) return;
              if(!document.getElementById('tab-' + name)) return;
              let label = name;
              const btn = document.querySelector('.tab-subbtn[data-tab="' + name + '"]');
              if(btn) label = (btn.textContent || name).replace(/\s*×\s*$/, '').trim();
              WindowManager.popTab(name, label, data[name]);
          });
          WindowManager._arbitrate();
          WindowManager._ensureWired();
          WindowManager.syncSubnav();
      }
  };
  if(typeof window !== 'undefined') window.WindowManager = WindowManager;
