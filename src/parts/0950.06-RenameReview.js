
// RenameReview — apres un renommage (personnage/decor), NE remplace RIEN
// automatiquement dans le texte du scenario (une machette qui devient un
// pistolet, ca ne se recrit pas mot a mot : la phrase autour doit etre
// repensee). A la place : chaque mention encore ecrite en toutes lettres
// recoit un surlignage orange DANS le scenario — un calque par-dessus en
// position:fixed, JAMAIS injecte dans le texte edite (scriptContent n'est
// jamais touche par ce module). Au survol : ancien -> nouveau nom, et trois
// gestes (ignorer / suivant / corrige+suivant). Liste en memoire pour la
// session (pas sauvegardee en base, ce n'est pas une donnee de projet).
const RenameReview = {
    items: [],   // { id, oldName, newName, sceneId, occIndex, done }
    _repaintT: null, _hideT: null,

    // Appelee juste apres un renommage reussi (FicheLinks.renameCharacter /
    // renameLocation). Recense les mentions hors DOM, sur le texte brut.
    check: (oldName, newName) => {
        try {
            const oldN = String(oldName || '').trim();
            const newN = String(newName || '').trim();
            if(!oldN || oldN.toLowerCase() === newN.toLowerCase()) return;
            const re = new RegExp('(?:^|[^\\wÀ-ÿ-])(' + oldN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\wÀ-ÿ-])', 'gi');
            let total = 0;
            (state.data.scenes || []).forEach(s => {
                if(!s || !s.scriptContent) return;
                const txt = s.scriptContent.replace(/<[^>]+>/g, ' ');
                const n = (txt.match(re) || []).length;
                for(let i = 0; i < n; i++) {
                    RenameReview.items.push({ id: 'rr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), oldName: oldN, newName: newN, sceneId: s.id, occIndex: i, done: false });
                }
                total += n;
            });
            if(total > 0) RenameReview.offer(oldN, total);
        } catch(e) { /* jamais bloquant pour le renommage lui-meme */ }
    },

    offer: (q, n) => {
        const old = document.getElementById('rename-review-offer'); if(old) old.remove();
        const b = document.createElement('div');
        b.id = 'rename-review-offer';
        b.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--panel-bg); border:1px solid var(--border); border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,0.25); padding:10px 14px; z-index:var(--z-tooltip); display:flex; align-items:center; gap:10px; font-size:0.85rem; max-width:90vw;';
        b.innerHTML = '<span>« ' + Utils.escape(q) + ' » encore écrit ' + n + ' fois dans le scénario.</span>'
            + '<button onclick="app.RenameReview.reveal()" style="padding:6px 12px; border:none; border-radius:6px; background:var(--primary); color:#fff; cursor:pointer; white-space:nowrap;">Repérer dans le texte</button>'
            + '<button onclick="document.getElementById(\'rename-review-offer\').remove()" style="padding:6px 10px; border:none; border-radius:6px; background:transparent; color:var(--text-sec); cursor:pointer;">Ignorer</button>';
        document.body.appendChild(b);
    },

    // Bascule sur l'onglet Scenario, en vue continue (tous les editeurs de
    // scene en meme temps), puis peint les surlignages orange.
    reveal: () => {
        const off = document.getElementById('rename-review-offer'); if(off) off.remove();
        if(typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('script');
        if(typeof ScriptEditorViewMode !== 'undefined') ScriptEditorViewMode.set('continuous');
        setTimeout(() => RenameReview._gotoFirstRetry(8), 200);
    },

    // Amene directement sur la premiere occurrence en attente — pas juste
    // en haut de la vue continue (qui peut commencer par des scenes sans
    // rien a verifier). Reessaie plusieurs fois : le temps que la vue
    // continue finisse de se construire, les marques ne sont pas encore la.
    _gotoFirstRetry: (attemptsLeft) => {
        RenameReview.paint();
        setTimeout(() => {
            const target = document.querySelector('.rn-pending-mark');
            if(target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => RenameReview._showTip(target.dataset.reviewId, target), 350);
            } else if(attemptsLeft > 0) {
                RenameReview._gotoFirstRetry(attemptsLeft - 1);
            }
        }, 120);
    },

    // Le seul endroit ou le texte d'une scene est editable : la vue continue
    // (.script-continuous-content).
    _editors: () => {
        const out = [];
        document.querySelectorAll('.script-continuous-content').forEach(el => {
            const wrap = el.closest('.script-continuous-scene');
            if(wrap) out.push({ el, sceneId: wrap.dataset.sceneId });
        });
        return out;
    },

    // Retrouve la n-ieme occurrence (mot entier, insensible a la casse) dans
    // un editeur — meme principe que ScriptEditorSearch, jamais de span
    // injecte : la Range sert juste a mesurer une position a l'ecran.
    _findOcc: (editorEl, term, occIndex) => {
        const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?:^|[^\\wÀ-ÿ-])(' + safe + ')(?![\\wÀ-ÿ-])', 'gi');
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
        let node, seen = 0;
        while(node = walker.nextNode()) {
            const t = node.textContent;
            let m;
            re.lastIndex = 0;
            while((m = re.exec(t))) {
                const start = m.index + (m[0].length - m[1].length);
                if(seen === occIndex) {
                    const range = document.createRange();
                    range.setStart(node, start);
                    range.setEnd(node, start + m[1].length);
                    return range;
                }
                seen++;
                if(re.lastIndex === m.index) re.lastIndex++;
            }
        }
        return null;
    },

    paint: () => {
        if(!RenameReview._listenersBound) {
            RenameReview._listenersBound = true;
            window.addEventListener('resize', RenameReview.paint);
            document.addEventListener('scroll', RenameReview.paint, true);
        }
        clearTimeout(RenameReview._repaintT); RenameReview._repaintT = setTimeout(RenameReview._paintNow, 30);
    },

    _paintNow: () => {
        document.querySelectorAll('.rn-pending-mark').forEach(el => el.remove());
        const pending = RenameReview.items.filter(r => !r.done);
        if(!pending.length) return;
        const editors = RenameReview._editors();
        pending.forEach(rev => {
            const ed = editors.find(e => e.sceneId === rev.sceneId);
            if(!ed) return;
            let range;
            try { range = RenameReview._findOcc(ed.el, rev.oldName, rev.occIndex); } catch(e) { range = null; }
            if(!range) return;
            const rect = range.getBoundingClientRect();
            if(!rect || (!rect.width && !rect.height)) return;
            const mark = document.createElement('div');
            mark.className = 'rn-pending-mark';
            mark.dataset.reviewId = rev.id;
            mark.style.left = rect.left + 'px'; mark.style.top = rect.top + 'px';
            mark.style.width = rect.width + 'px'; mark.style.height = rect.height + 'px';
            mark.addEventListener('mouseenter', () => RenameReview._showTip(rev.id, mark));
            mark.addEventListener('mouseleave', () => RenameReview._scheduleHideTip());
            document.body.appendChild(mark);
        });
    },

    _showTip: (reviewId, markEl) => {
        clearTimeout(RenameReview._hideT);
        RenameReview._hideTip();
        const rev = RenameReview.items.find(r => r.id === reviewId);
        if(!rev) return;
        const rect = markEl.getBoundingClientRect();
        const tip = document.createElement('div');
        tip.id = 'rn-tip';
        const TIP_H = 70; // hauteur approximative, avant mesure reelle
        const placeAbove = (rect.bottom + TIP_H + 10) > window.innerHeight;
        tip.style.cssText = 'position:fixed; z-index:9999; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); padding:10px 12px; min-width:220px; font-size:0.85rem;';
        tip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + 'px';
        if(placeAbove) tip.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        else tip.style.top = (rect.bottom + 6) + 'px';
        tip.innerHTML = '<div style="margin-bottom:8px;">« ' + Utils.escape(rev.oldName) + ' » remplacé par « ' + Utils.escape(rev.newName) + ' » — vérifier le texte</div>'
            + '<div style="display:flex; gap:14px; font-size:0.85rem;">'
            + '<span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.RenameReview.dismiss(\'' + rev.id + '\')">✕ Ignorer</span>'
            + '<span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.RenameReview.next(\'' + rev.id + '\')">➡️ Suivant</span>'
            + '<span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.RenameReview.fixedNext(\'' + rev.id + '\')">✅ Corrigé</span>'
            + '</div>';
        tip.addEventListener('mouseenter', () => clearTimeout(RenameReview._hideT));
        tip.addEventListener('mouseleave', () => RenameReview._scheduleHideTip());
        document.body.appendChild(tip);
    },

    _hideTip: () => { const t = document.getElementById('rn-tip'); if(t) t.remove(); },
    _scheduleHideTip: () => { clearTimeout(RenameReview._hideT); RenameReview._hideT = setTimeout(RenameReview._hideTip, 300); },

    // Croix : on laisse le mot tel quel (choix assume), on l'oublie.
    dismiss: (id) => {
        const rev = RenameReview.items.find(r => r.id === id);
        if(rev) rev.done = true;
        RenameReview._hideTip();
        RenameReview.paint();
    },

    // Fleche : on va voir la suivante sans rien changer au statut de celle-ci.
    next: (id) => {
        RenameReview._hideTip();
        const marks = Array.from(document.querySelectorAll('.rn-pending-mark'));
        const idx = marks.findIndex(m => m.dataset.reviewId === id);
        const target = marks[idx + 1] || marks[0];
        if(target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => RenameReview._showTip(target.dataset.reviewId, target), 350); }
    },

    // Coche : corrigee a la main par l'utilisateur, on l'oublie ET on avance.
    fixedNext: (id) => {
        RenameReview._hideTip();
        const marks = Array.from(document.querySelectorAll('.rn-pending-mark'));
        const idx = marks.findIndex(m => m.dataset.reviewId === id);
        const rev = RenameReview.items.find(r => r.id === id);
        if(rev) rev.done = true;
        RenameReview.paint();
        setTimeout(() => {
            const marks2 = Array.from(document.querySelectorAll('.rn-pending-mark'));
            const target = marks2[idx] || marks2[0];
            if(target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => RenameReview._showTip(target.dataset.reviewId, target), 200); }
        }, 60);
    }
};
