
  const Feedback = {
    QUEUE_KEY: 'moteur_feedback_queue',
    LAST_KEY: 'moteur_feedback_lastsend',
    LABELS: { bug: 'Un probleme', idee: 'Une idee', autre: 'Autre' },
    _type: 'bug',
    _editing: null,   // id de la remarque en cours de modification, null si nouvelle
    _sending: false,
    _timer: null,

    // ---- file d'attente locale ----
    queue: () => {
      try {
        const raw = localStorage.getItem(Feedback.QUEUE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    },
    _saveQueue: (arr) => {
      try { localStorage.setItem(Feedback.QUEUE_KEY, JSON.stringify(arr || [])); } catch (e) {}
    },
    _today: () => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    mount: () => {
      if (document.getElementById('feedback-root')) return;
      const root = document.createElement('div');
      root.id = 'feedback-root';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'feedback-bubble';
      b.title = 'Signaler un probleme ou proposer une idee';
      b.textContent = '💡';
      b.addEventListener('click', Feedback.open);
      const badge = document.createElement('span');
      badge.className = 'feedback-bubble-badge';
      badge.id = 'fb-badge';
      b.appendChild(badge);
      // Le mot du rappel vit en permanence dans l'ampoule, invisible : il est
      // seulement joue par l'animation. Le recreer a chaque fois ne servirait
      // qu'a fabriquer du dechet dans la page.
      const hint = document.createElement('span');
      hint.className = 'feedback-bubble-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'Remarques';
      b.appendChild(hint);
      root.appendChild(b);
      document.body.appendChild(root);
      Feedback._refreshBadge();
      Feedback._flushIfDue();
      Feedback._scheduleMidnight();
      Feedback._scheduleGlow();
    },

    unmount: () => {
      const r = document.getElementById('feedback-root');
      if (r) r.remove();
      if (Feedback._timer) { clearTimeout(Feedback._timer); Feedback._timer = null; }
      if (Feedback._glowTimer) { clearTimeout(Feedback._glowTimer); Feedback._glowTimer = null; }
    },

    _refreshBadge: () => {
      const el = document.getElementById('fb-badge');
      if (!el) return;
      const n = Feedback.queue().length;
      el.textContent = n > 9 ? '9+' : String(n);
      el.style.display = n > 0 ? 'flex' : 'none';
    },

    // ---- RAPPEL DE L'AMPOULE (v601) ----
    // Elle est en bas a gauche et ne bouge jamais : on finit par ne plus la
    // voir. Entre 1 et 10 minutes, elle brille quelques instants et le mot
    // « Remarques » monte au-dessus en fondu. Le delai est RETIRE AU HASARD a
    // chaque fois, jamais fixe : un battement regulier devient du decor au bout
    // d'une heure, et on ne le voit plus non plus.
    GLOW_MIN_MS: 60000,
    GLOW_MAX_MS: 600000,
    GLOW_MS: 2400,
    _glowTimer: null,

    _scheduleGlow: () => {
      if (Feedback._glowTimer) clearTimeout(Feedback._glowTimer);
      const etendue = Feedback.GLOW_MAX_MS - Feedback.GLOW_MIN_MS;
      const ms = Feedback.GLOW_MIN_MS + Math.floor(Math.random() * (etendue + 1));
      Feedback._glowTimer = setTimeout(() => {
        Feedback._glowTimer = null;
        Feedback._glow();
        Feedback._scheduleGlow();
      }, ms);
    },

    _glow: () => {
      const b = document.querySelector('.feedback-bubble');
      // ONGLET EN ARRIERE-PLAN ou panneau des remarques deja ouvert : on passe
      // notre tour sans rien jouer. Briller dans un onglet que personne ne
      // regarde ne previendrait de rien, et le prochain rendez-vous est deja
      // pris par l'appelant.
      if (!b || document.hidden || document.getElementById('fb-ov')) return;
      b.classList.remove('fb-glow');
      void b.offsetWidth;   // sans cette relecture, reposer la classe dans la
                            // foulee ne REJOUE pas l'animation : le navigateur
                            // ne voit aucun changement.
      b.classList.add('fb-glow');
      setTimeout(() => b.classList.remove('fb-glow'), Feedback.GLOW_MS + 100);
    },

    // ---- declenchement a minuit ----
    // Le navigateur peut rester ouvert plusieurs jours : on reprogramme
    // apres chaque passage plutot que de poser un intervalle.
    _scheduleMidnight: () => {
      if (Feedback._timer) clearTimeout(Feedback._timer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
      let ms = next - now;
      // setTimeout deraille au-dela de ~24,8 jours : borne de securite.
      if (ms < 1000 || ms > 86400000) ms = 86400000;
      Feedback._timer = setTimeout(() => {
        Feedback._flushIfDue();
        Feedback._scheduleMidnight();
      }, ms);
    },

    // Envoie s'il reste des remarques d'un jour ANTERIEUR a aujourd'hui.
    // Une remarque ecrite aujourd'hui attend donc bien minuit.
    _flushIfDue: async () => {
      const q = Feedback.queue();
      if (!q.length) return;
      const today = Feedback._today();
      const aEnvoyer = q.some(item => (item.day || '') < today);
      if (!aEnvoyer) return;
      await Feedback.flush();
    },

    // DEPOT EN BASE (v600). Les remarques partaient en MAIL une fois par jour,
    // et la file locale etait videe ensuite : la seule trace vivait dans une
    // boite mail — qui ne se trie pas, ne se compte pas, et ne se relit pas a
    // deux. Elles vont desormais dans la table client_feedback, lue par
    // l'onglet « Retours » du tableau de bord admin.
    // PLUS AUCUN MAIL (decision du 19 septembre) : le recapitulatif quotidien
    // faisait doublon avec cette table. Consequence assumee — la table est
    // ANONYME, donc plus moyen de recontacter qui que ce soit depuis un
    // retour. Qui a vraiment besoin d'une reponse ecrit directement a
    // l'editeur. Ne pas remettre l'un sans rediscuter l'autre.
    // LE RYTHME NE CHANGE PAS : on depose a minuit ce qui date d'un jour
    // ANTERIEUR, jamais ce qui vient d'etre ecrit. C'est ce qui laisse a la
    // personne le temps de relire, corriger ou retirer sa remarque avant
    // qu'elle ne parte.
    flush: async () => {
      const q = Feedback.queue();
      if (!q.length || Feedback._sending) return;
      Feedback._sending = true;
      try {
        const version = (document.getElementById('app-version') || {}).textContent || '';
        const clean = (v, max) => String(v || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
        const lignes = q.map(it => ({
          type: clean(it.type || 'autre', 20),
          texte: clean(it.text, 4000),
          contexte: clean(it.ctx, 600),
          version: clean(version, 20)
        }));
        const { error } = await supabase.from('client_feedback').insert(lignes);
        if (error) throw error;
        // Depose : la file disparait, comme convenu.
        Feedback._saveQueue([]);
        try { localStorage.setItem(Feedback.LAST_KEY, Feedback._today()); } catch (e) {}
        Feedback._refreshBadge();
      } catch (e) {
        // On NE VIDE PAS en cas d'echec : les remarques repartiront demain.
        console.warn('[Feedback] depot differe impossible, on reessaiera', e);
      }
      Feedback._sending = false;
    },

    // Contexte joint automatiquement a chaque remarque : c'est ce qui rend un
    // retour exploitable. Sans lui, « ca ne marche pas » est inutilisable.
    _context: () => {
      const bits = [];
      try {
        const proj = state.currentProject && state.currentProject.title;
        if (proj) bits.push('Projet : ' + proj);
        const tabEl = document.querySelector('#app-view .tab-content.active');
        if (tabEl && tabEl.id) bits.push('Onglet : ' + tabEl.id.replace(/^tab-/, ''));
        else bits.push('Ecran : accueil');
        if (state.currentRole) bits.push('Role : ' + state.currentRole);
        bits.push('Navigateur : ' + navigator.userAgent);
      } catch (e) {}
      return bits.filter(Boolean).join(' | ');
    },

    // ---- fenetre ----
    open: () => {
      Feedback.close();
      const ov = document.createElement('div');
      ov.className = 'fb-ov';
      ov.id = 'fb-ov';
      ov.innerHTML = '<div class="fb-box" role="dialog"><div class="fb-head"><h3>💡 Vos remarques</h3><button class="fb-x" aria-label="Fermer">&times;</button></div><div class="fb-body" id="fb-body"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', Feedback._onClick);
      Feedback._key = (e) => { if (e.key === 'Escape') Feedback.close(); };
      document.addEventListener('keydown', Feedback._key, true);
      const q = Feedback.queue();
      if (q.length) Feedback.showList(); else Feedback.showEditor(null);
    },

    close: () => {
      const ov = document.getElementById('fb-ov');
      if (ov) ov.remove();
      if (Feedback._key) { document.removeEventListener('keydown', Feedback._key, true); Feedback._key = null; }
      Feedback._editing = null;
    },

    _onClick: (e) => {
      const ov = document.getElementById('fb-ov');
      const cl = e.target.classList || { contains: () => false };
      if (e.target === ov || cl.contains('fb-x') || cl.contains('fb-close')) { Feedback.close(); return; }
      const t = e.target.closest ? e.target.closest('.fb-type') : null;
      if (t) {
        Feedback._type = t.getAttribute('data-t');
        ov.querySelectorAll('.fb-type').forEach(x => x.classList.toggle('on', x === t));
        return;
      }
      const item = e.target.closest ? e.target.closest('.fb-item') : null;
      if (item && !cl.contains('fb-del')) { Feedback.showEditor(item.getAttribute('data-id')); return; }
      if (cl.contains('fb-del')) {
        const id = e.target.getAttribute('data-id');
        Feedback._saveQueue(Feedback.queue().filter(x => x.id !== id));
        Feedback._refreshBadge();
        const q = Feedback.queue();
        if (q.length) Feedback.showList(); else Feedback.showEditor(null);
        return;
      }
      if (cl.contains('fb-new')) { Feedback.showEditor(null); return; }
      if (cl.contains('fb-back')) { Feedback.showList(); return; }
      if (cl.contains('fb-save')) { Feedback.save(); return; }
    },

    showList: () => {
      const body = document.getElementById('fb-body');
      if (!body) return;
      const q = Feedback.queue();
      const rows = q.map(it => {
        const apercu = Utils.escape((it.text || '').slice(0, 90)) + ((it.text || '').length > 90 ? '…' : '');
        return '<div class="fb-item" data-id="' + it.id + '">' +
          '<div class="fb-item-txt"><strong>' + (Feedback.LABELS[it.type] || 'Autre') + '</strong><span>' + apercu + '</span></div>' +
          '<button class="fb-del" data-id="' + it.id + '" title="Supprimer">🗑</button>' +
        '</div>';
      }).join('');
      body.innerHTML =
        '<p class="fb-intro">Vos remarques sont conservees ici et me sont envoyees en une seule fois, cette nuit. D\'ici la, vous pouvez les relire, les modifier ou les supprimer.</p>' +
        rows +
        '<div class="fb-foot"><button class="fb-cancel fb-close">Fermer</button><button class="fb-send fb-new">Nouvelle remarque</button></div>';
    },

    showEditor: (id) => {
      const body = document.getElementById('fb-body');
      if (!body) return;
      const q = Feedback.queue();
      const it = id ? q.find(x => x.id === id) : null;
      Feedback._editing = it ? it.id : null;
      Feedback._type = it ? it.type : 'bug';
      const btn = (t, lbl) => '<button class="fb-type' + (Feedback._type === t ? ' on' : '') + '" data-t="' + t + '">' + lbl + '</button>';
      body.innerHTML =
        '<p class="fb-intro">Un bug, une idee, une remarque : tout est utile, meme court. Je lis tout personnellement.</p>' +
        '<div class="fb-types">' + btn('bug', '🐞 Un probleme') + btn('idee', '💡 Une idee') + btn('autre', '💬 Autre') + '</div>' +
        '<textarea id="fb-msg" placeholder="Que s\'est-il passe, ou qu\'aimeriez-vous voir ?" data-tooltip="Que s\'est-il passe, ou qu\'aimeriez-vous voir ?"></textarea>' +
        '<p class="fb-ctx">L\'onglet ouvert et votre navigateur sont joints pour m\'aider a reproduire.</p>' +
        '<div class="fb-foot">' +
          (q.length ? '<button class="fb-cancel fb-back">Retour</button>' : '<button class="fb-cancel fb-close">Annuler</button>') +
          '<button class="fb-send fb-save">' + (it ? 'Enregistrer' : 'Ajouter') + '</button>' +
        '</div>';
      const ta = document.getElementById('fb-msg');
      if (ta) { ta.value = it ? (it.text || '') : ''; setTimeout(() => ta.focus(), 30); }
    },

    save: () => {
      const ta = document.getElementById('fb-msg');
      const txt = ((ta && ta.value) || '').trim();
      if (txt.length < 5) {
        Utils.toast('Ecrivez quelques mots avant d\'enregistrer.', 'info');
        if (ta) ta.focus();
        return;
      }
      const q = Feedback.queue();
      if (Feedback._editing) {
        const it = q.find(x => x.id === Feedback._editing);
        if (it) { it.text = txt; it.type = Feedback._type; it.ctx = Feedback._context(); }
      } else {
        if (q.length >= 30) { Utils.toast('Trop de remarques en attente, envoyez-les d\'abord.', 'info'); return; }
        q.push({
          id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          type: Feedback._type,
          text: txt,
          day: Feedback._today(),
          ctx: Feedback._context()
        });
      }
      Feedback._saveQueue(q);
      Feedback._refreshBadge();
      Utils.toast('Remarque enregistree. Elle me sera envoyee cette nuit.', 'success');
      Feedback.showList();
    }
  };

  // ============================================================
  // MODULE COURSESWEB — les cours vus comme la toile des liaisons
  // ------------------------------------------------------------
  // Meme presentation que la toile du projet : on REPREND SES CLASSES
  // CSS a l'identique (.web-modal, .web-node, .web-link...). Rien n'est
  // duplique cote style.
  //
  // En revanche le PLACEMENT n'est pas repris, et c'est volontaire.
  // La toile du projet doit demeler un reseau quelconque, d'ou son
  // moteur a ressorts. Les cours forment un ARBRE connu d'avance et
  // toujours le meme : Cinema -> 7 chapitres -> 9 a 18 sections. Un
  // arbre se place par le calcul, sans simulation : c'est plus simple,
  // plus stable, et ca ne bouge pas d'une ouverture a l'autre.
  //
  // On ne branche PAS non plus les cours sur Links : ce module est une
  // couche de lecture sur les fiches reelles du projet, y glisser des
  // chapitres de cours le salirait (meme raison qui a fait garder la
  // famille virtuelle « projet » dans Web seul).
  // ============================================================