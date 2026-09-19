
  const UIPrint = {
  // ===== IMPRESSION SÉQUENCIER — [UIPrint] =====
    printBoard: (episodeIds) => {
        const isSeries = state.currentProjectType === 'series';
        if(isSeries && !episodeIds) { UIPrint.openBoardPrintEpisodeChooser(); return; }
        let scenes;
        if(isSeries && episodeIds && episodeIds.length > 0) {
            // Séries : on prend directement les scènes des épisodes choisis (pas WYSIWYG DOM)
            const seasons = state.data.seasons || [];
            const episodes = state.data.episodes || [];
            const epOrder = (epId) => {
                const ep = episodes.find(e => e.id === epId);
                if(!ep) return 99999;
                const sea = seasons.find(s => s.id === ep.seasonId);
                return ((sea && sea.number) || 0) * 1000 + (ep.number || 0);
            };
            scenes = (state.data.scenes || []).filter(s => episodeIds.includes(s.episodeId));
            scenes.sort((a, b) => {
                const oa = epOrder(a.episodeId);
                const ob = epOrder(b.episodeId);
                if(oa !== ob) return oa - ob;
                return (a.order || 0) - (b.order || 0);
            });
        } else {
            // Films : WYSIWYG depuis le DOM (respecte filtres futurs)
            const visibleIds = Array.from(document.querySelectorAll('#boardList .card')).map(c => c.dataset.id);
            scenes = (state.data.scenes || []).filter(s => visibleIds.includes(s.id));
        }
        if(scenes.length === 0) { Utils.toast('Aucune scène à imprimer', 'warning'); return; }
        UIPrint._launchBoardPrint(scenes);
    },
    
    _launchBoardPrint: (scenes) => {
        const title = `Séquencier ${state.data.title || ''}`.trim();
        const tags = state.data.tags || [];
        const isSeries = state.currentProjectType === 'series';
        const seasons = state.data.seasons || [];
        const episodes = state.data.episodes || [];
        // Helper rendu d'une card
        const renderCard = (s, idx) => {
            const tag = tags.find(t => t.id === s.tag_id);
            const tagColor = (tag && tag.color !== 'transparent') ? tag.color : '#ddd';
            const tagName = tag ? tag.name : '';
            const tagLine = tagName ? `<div class="seq-tag"><strong>${Utils.escape(tagName)}</strong></div>` : '';
            const isFinal = s.isFinal === true;
            const statusLabel = isFinal ? '✅ FINALE' : '📝 BROUILLON';
            const num = UI.formatSceneNumber(s, idx);
            const meta = `${Utils.escape(s.perso || '')} • ${Utils.escape(String(s.time || 0))} min`;
            const resume = s.resume ? `<div class="seq-resume">${Utils.escape(s.resume)}</div>` : '';
            return `<div class="seq-card" style="border-left:6px solid ${tagColor};">
                <div class="seq-head"><span class="seq-num">${num}</span> <span class="seq-status">${statusLabel}</span></div>
                <h3 class="seq-title">${Utils.escape(s.title || '')}</h3>
                ${tagLine}
                <div class="seq-meta">${meta}</div>
                ${resume}
            </div>`;
        };
        // Construction du HTML : grouper par saison/épisode si série
        let bodyHTML = '';
        if(isSeries && episodes.length > 0) {
            // Grouper scènes par saisonId, puis par episodeId
            const sceneIdxMap = new Map();
            scenes.forEach((s, idx) => sceneIdxMap.set(s.id, idx));
            const grouped = {};
            scenes.forEach(s => {
                const ep = episodes.find(e => e.id === s.episodeId);
                const seaId = ep ? ep.seasonId : 'orphan';
                const epId = ep ? ep.id : 'orphan';
                if(!grouped[seaId]) grouped[seaId] = {};
                if(!grouped[seaId][epId]) grouped[seaId][epId] = [];
                grouped[seaId][epId].push(s);
            });
            // Tri saisons par numéro
            const seaOrder = Object.keys(grouped).sort((a, b) => {
                const sa = seasons.find(x => x.id === a);
                const sb = seasons.find(x => x.id === b);
                return ((sa && sa.number) || 999) - ((sb && sb.number) || 999);
            });
            seaOrder.forEach(seaId => {
                const sea = seasons.find(x => x.id === seaId);
                const seaNum = sea ? String(sea.number).padStart(2, '0') : '??';
                const seaTitle = sea && sea.title ? ' — ' + Utils.escape(sea.title) : '';
                bodyHTML += `<div class="seq-season">SAISON ${seaNum}${seaTitle}</div>`;
                const epOrder = Object.keys(grouped[seaId]).sort((a, b) => {
                    const ea = episodes.find(x => x.id === a);
                    const eb = episodes.find(x => x.id === b);
                    return ((ea && ea.number) || 999) - ((eb && eb.number) || 999);
                });
                epOrder.forEach(epId => {
                    const ep = episodes.find(x => x.id === epId);
                    const epNum = ep ? String(ep.number).padStart(2, '0') : '??';
                    const epTitle = ep && ep.title ? ' — ' + Utils.escape(ep.title) : '';
                    bodyHTML += `<div class="seq-episode">Épisode ${epNum}${epTitle}</div>`;
                    grouped[seaId][epId].forEach(s => {
                        bodyHTML += renderCard(s, sceneIdxMap.get(s.id));
                    });
                });
            });
        } else {
            // Films : juste les cards
            bodyHTML = scenes.map((s, idx) => renderCard(s, idx)).join('');
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: white; color: #222; }
            h1.doc-title { font-size: 1.4rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #333; }
            .seq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; align-items: start; }
            .seq-season { grid-column: 1 / -1; background: #333; color: white; padding: 8px 14px; font-size: 1rem; font-weight: bold; letter-spacing: 0.5px; margin: 6mm 0 2mm 0; border-radius: 4px; page-break-after: avoid; break-after: avoid; }
            .seq-season:first-child { margin-top: 0; }
            .seq-episode { grid-column: 1 / -1; font-size: 0.85rem; font-weight: bold; color: #555; padding: 4px 0 2px 0; margin-top: 2mm; border-bottom: 1px solid #ccc; page-break-after: avoid; break-after: avoid; }
            .seq-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #999; border-radius: 6px; padding: 10px 12px; background: white; }
            .seq-head { display: flex; justify-content: space-between; font-size: 0.75rem; color: #555; margin-bottom: 4px; }
            .seq-num { font-weight: bold; color: #333; }
            .seq-status { font-size: 0.7rem; padding: 2px 6px; border: 1px solid #999; border-radius: 3px; }
            .seq-title { font-size: 0.95rem; margin: 4px 0 6px 0; line-height: 1.25; }
            .seq-tag { font-size: 0.75rem; margin: 4px 0; color: #333; }
            .seq-meta { font-size: 0.78rem; color: #555; font-style: italic; margin-bottom: 6px; }
            .seq-resume { font-size: 0.8rem; line-height: 1.4; color: #333; margin-top: 4px; padding-top: 6px; border-top: 1px dashed #ccc; white-space: pre-wrap; }
        </style></head><body>
            <h1 class="doc-title">${title}</h1>
            <div class="seq-grid">${bodyHTML}</div>
            <scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});<\/scr` + `ipt>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(printWindow) {
            printWindow.addEventListener('afterprint', () => { URL.revokeObjectURL(blobUrl); printWindow.close(); }, { once: true });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        }
    },
    
openBoardPrintEpisodeChooser: () => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { UIPrint._launchBoardPrint(episodes.map(e => e.id)); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="seachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">📋 Imprimer le séquencier</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="sea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="sea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="sea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="sea-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#sea-all').onclick = () => overlay.querySelectorAll('.seachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#sea-none').onclick = () => overlay.querySelectorAll('.seachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#sea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#sea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.seachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => UIPrint.printBoard(epIds), 100);
        };
    },
    
    printChars: (episodeIds, mode) => {
        const isSeries = state.currentProjectType === 'series';
        // Étape 1 : si série et pas de saisons choisies, ouvrir le chooser
        if(isSeries && !episodeIds) { UIPrint._openCharsSeasonChooser(); return; }
        // Étape 2 : si pas encore de mode choisi, ouvrir le chooser
        if(!mode) { UIPrint._openCharsModeChooser(episodeIds); return; }
        // Étape 3 : déterminer les scènes à utiliser pour le filtrage des personnages
        let scenesScope;
        if(isSeries && episodeIds && episodeIds.length > 0) {
            scenesScope = (state.data.scenes || []).filter(s => episodeIds.includes(s.episodeId));
        } else {
            scenesScope = state.data.scenes || [];
        }
        UIPrint._launchCharsPrint(scenesScope, mode);
    },
    
    _openCharsSeasonChooser: () => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { UIPrint.printChars([], null); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="cseachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">👥 Imprimer les personnages</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="csea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="csea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="csea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="csea-ok" style="margin:0;">Suivant</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#csea-all').onclick = () => overlay.querySelectorAll('.cseachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#csea-none').onclick = () => overlay.querySelectorAll('.cseachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#csea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#csea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.cseachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => UIPrint.printChars(epIds), 100);
        };
    },
    
    _openCharsModeChooser: (episodeIds) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">👥 Mode d'impression</div>
            <div style="text-align:left;margin-bottom:14px;">
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;"><input type="radio" name="cmode" value="detailed" checked style="margin-right:8px;"><strong>Détaillé</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 personnage par ligne, photo + bio + sexe + comédien lié + liste des scènes</span></label>
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;"><input type="radio" name="cmode" value="list" style="margin-right:8px;"><strong>Liste</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">2 colonnes compactes, juste nom + nombre de scènes</span></label>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="cmode-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="cmode-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#cmode-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#cmode-ok').onclick = () => {
            const mode = overlay.querySelector('input[name="cmode"]:checked').value;
            overlay.remove();
            setTimeout(() => UIPrint.printChars(episodeIds, mode), 100);
        };
    },
    
    _launchCharsPrint: (scenesScope, mode) => {
        const filmTitle = state.data.title || '';
        const docTitle = `Personnages — ${filmTitle}`.trim();
        const allChars = state.data.characters || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'perso');
        const actors = state.data.actors || [];
        const isSeries = state.currentProjectType === 'series';
        // Filtrer personnages : garder ceux qui apparaissent dans au moins une scène du scope OU sans filtrage si film
        const charsInScope = isSeries ? allChars.filter(ch => scenesScope.some(s => FicheLinks.sceneHasChar(s, ch))) : allChars;
        if(charsInScope.length === 0) { Utils.toast('Aucun personnage à imprimer', 'warning'); return; }
        // Calcul des scènes par personnage (dans le scope)
        const allScenes = state.data.scenes || [];
        const sceneLabel = (s) => {
            if(isSeries) {
                const ep = (state.data.episodes || []).find(e => e.id === s.episodeId);
                if(ep) {
                    const scenesInEp = allScenes.filter(x => x.episodeId === ep.id);
                    return UI.formatSceneNumber(s, scenesInEp.indexOf(s));
                }
            }
            return '#' + (allScenes.indexOf(s) + 1);
        };
        // v580 : test par identifiant (sceneHasChar garde le nom en repli).
        const charScenes = (ch) => scenesScope.filter(s => FicheLinks.sceneHasChar(s, ch));
        // Grouper par groupe
        const grouped = {};
        charsInScope.forEach(ch => {
            const gid = ch.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(ch);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        // Helpers HTML
        const renderDetailed = (ch) => {
            const actor = ch.actor_id ? actors.find(a => a.id === ch.actor_id) : null;
            const photoSrc = (actor && actor.photo) ? actor.photo : '';
            const photoBlock = photoSrc 
                ? `<img src="${photoSrc}" alt="Photo" style="width:80px;height:100px;object-fit:cover;border:1px solid #999;border-radius:4px;flex-shrink:0;">`
                : `<div style="width:80px;height:100px;border:1px dashed #bbb;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:0.7rem;flex-shrink:0;">Pas de photo</div>`;
            const genderLabel = { homme: 'Homme', femme: 'Femme', 'non-binaire': 'Non-binaire' }[ch.gender] || ch.gender || '';
            const genderLine = genderLabel ? `<div class="ch-meta"><strong>Sexe :</strong> ${Utils.escape(genderLabel)}</div>` : '';
            const actorLine = actor ? `<div class="ch-meta"><strong>🎭 Joué par :</strong> ${Utils.escape(actor.name)}</div>` : `<div class="ch-meta" style="color:#999;font-style:italic;">Aucun comédien lié</div>`;
            const bioLine = ch.bio ? `<div class="ch-bio">${Utils.escape(ch.bio)}</div>` : '';
            const cs = charScenes(ch);
            const scenesLine = cs.length > 0
                ? `<div class="ch-scenes"><strong>📍 Apparaît dans (${cs.length}) :</strong> ${cs.map(s => `<span class="ch-tag">${sceneLabel(s)}</span>`).join(' ')}</div>`
                : `<div class="ch-scenes" style="color:#999;font-style:italic;">N'apparaît dans aucune scène</div>`;
            return `<div class="ch-card-detailed">
                ${photoBlock}
                <div class="ch-info">
                    <h3 class="ch-name">${Utils.escape(ch.name)}</h3>
                    ${genderLine}
                    ${actorLine}
                    ${bioLine}
                    ${scenesLine}
                </div>
            </div>`;
        };
        const renderList = (ch) => {
            const cs = charScenes(ch);
            return `<div class="ch-card-list"><span class="ch-list-name">${Utils.escape(ch.name)}</span><span class="ch-list-count">${cs.length} sc.</span></div>`;
        };
        // Construction body
        let bodyHTML = '';
        groupOrder.forEach(gid => {
            const group = groups.find(g => g.id === gid);
            const groupName = group ? group.name : 'Non classé';
            bodyHTML += `<div class="ch-group">${Utils.escape(groupName)}</div>`;
            if(mode === 'detailed') {
                grouped[gid].forEach(ch => { bodyHTML += renderDetailed(ch); });
            } else {
                bodyHTML += '<div class="ch-list-grid">';
                grouped[gid].forEach(ch => { bodyHTML += renderList(ch); });
                bodyHTML += '</div>';
            }
        });
        const css = `
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: white; color: #222; }
            h1.doc-title { font-size: 1.4rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #333; }
            .ch-group { background: #333; color: white; padding: 8px 14px; font-size: 1rem; font-weight: bold; letter-spacing: 0.5px; margin: 6mm 0 3mm 0; border-radius: 4px; page-break-after: avoid; break-after: avoid; }
            .ch-group:first-child { margin-top: 0; }
            .ch-card-detailed { display: flex; gap: 12px; border: 1px solid #999; border-radius: 6px; padding: 12px; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid; background: white; }
            .ch-info { flex: 1; min-width: 0; }
            .ch-name { font-size: 1.05rem; margin: 0 0 6px 0; }
            .ch-meta { font-size: 0.82rem; color: #444; margin-bottom: 3px; }
            .ch-bio { font-size: 0.82rem; color: #333; margin: 6px 0; padding-top: 6px; border-top: 1px dashed #ccc; line-height: 1.4; white-space: pre-wrap; }
            .ch-scenes { font-size: 0.78rem; color: #444; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ccc; line-height: 1.6; }
            .ch-tag { display: inline-block; background: #e8e8e8; padding: 1px 6px; border-radius: 3px; font-size: 0.72rem; margin: 1px 2px; color: #333; }
            .ch-list-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-bottom: 4mm; }
            .ch-card-list { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 8px; border-bottom: 1px dotted #ccc; font-size: 0.85rem; page-break-inside: avoid; break-inside: avoid; }
            .ch-list-name { font-weight: 500; }
            .ch-list-count { font-size: 0.75rem; color: #777; flex-shrink: 0; margin-left: 8px; }
        `;
        // Charger les images photo et les convertir en data URL avant d'imprimer
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title><style>${css}</style></head><body>
            <h1 class="doc-title">${docTitle}</h1>
            ${bodyHTML}
            <scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.print();},500);});<\/scr` + `ipt>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(printWindow) {
            printWindow.addEventListener('afterprint', () => { URL.revokeObjectURL(blobUrl); printWindow.close(); }, { once: true });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        }
    },
    
    printActors: (episodeIds, mode) => {
        const isSeries = state.currentProjectType === 'series';
        if(isSeries && !episodeIds) { UIPrint._openActorsSeasonChooser(); return; }
        if(!mode) { UIPrint._openActorsModeChooser(episodeIds); return; }
        let scenesScope;
        if(isSeries && episodeIds && episodeIds.length > 0) {
            scenesScope = (state.data.scenes || []).filter(s => episodeIds.includes(s.episodeId));
        } else {
            scenesScope = state.data.scenes || [];
        }
        UIPrint._launchActorsPrint(scenesScope, mode, isSeries && episodeIds && episodeIds.length > 0);
    },
    
    _openActorsSeasonChooser: () => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { UIPrint.printActors([], null); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="aseachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">🎭 Imprimer les comédiens</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="asea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="asea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="asea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="asea-ok" style="margin:0;">Suivant</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#asea-all').onclick = () => overlay.querySelectorAll('.aseachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#asea-none').onclick = () => overlay.querySelectorAll('.aseachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#asea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#asea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.aseachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => UIPrint.printActors(epIds), 100);
        };
    },
    
    _openActorsModeChooser: (episodeIds) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:460px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">🎭 Mode d'impression</div>
            <div style="text-align:left;margin-bottom:14px;">
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;"><input type="radio" name="amode" value="detailed" checked style="margin-right:8px;"><strong>Détaillé</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 par ligne, photo + toutes les infos (contact, bio, physique)</span></label>
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;"><input type="radio" name="amode" value="list" style="margin-right:8px;"><strong>Liste</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 colonne dense : nom, personnage, email, téléphone</span></label>
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;"><input type="radio" name="amode" value="card" style="margin-right:8px;"><strong>Fiche (casting book)</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 page A4 paysage par comédien, photo en grand + infos</span></label>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="amode-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="amode-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#amode-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#amode-ok').onclick = () => {
            const mode = overlay.querySelector('input[name="amode"]:checked').value;
            overlay.remove();
            setTimeout(() => UIPrint.printActors(episodeIds, mode), 100);
        };
    },
    
    _launchActorsPrint: (scenesScope, mode, hasSeasonFilter) => {
        const filmTitle = state.data.title || '';
        const docTitle = `Comédiens — ${filmTitle}`.trim();
        const allActors = state.data.actors || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'actor');
        const characters = state.data.characters || [];
        const isSeries = state.currentProjectType === 'series';
        // Helper : personnage joué par cet acteur
        const linkedChar = (a) => characters.find(c => c.actor_id === a.id);
        // Filtrer comédiens : si série filtrée par saison, ne garder que ceux dont le perso lié apparaît
        let filteredActors;
        if(hasSeasonFilter) {
            filteredActors = allActors.filter(a => {
                const ch = linkedChar(a);
                if(!ch) return false; // Q7 : non liés exclus en mode filtré
                return scenesScope.some(s => FicheLinks.sceneHasChar(s, ch));
            });
        } else {
            filteredActors = allActors;
        }
        if(filteredActors.length === 0) { Utils.toast('Aucun comédien à imprimer', 'warning'); return; }
        // Helpers labels
        const optLabel = (cat, val) => {
            if(!val) return '';
            const opts = (ProfileRenderer.selectOptions || {})[cat] || [];
            const found = opts.find(o => o.value === val);
            return found ? found.label : val;
        };
        const statusLabel = { 'amateur': 'Amateur', 'intermittent': 'Intermittent', 'micro-entrepreneur': 'Micro-entrepreneur', 'autre': 'Autre' };
        const collabLabel = { 'pro': 'Pro', 'semi-pro': 'Semi-pro', 'benevole': 'Bénévole' };
        // Grouper
        const linked = [];
        const unlinked = [];
        filteredActors.forEach(a => {
            if(linkedChar(a)) linked.push(a); else unlinked.push(a);
        });
        const grouped = {};
        linked.forEach(a => {
            const gid = a.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(a);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        // Helpers HTML
        const photoHTML = (a, w, h) => {
            if(a.photo) return `<img src="${a.photo}" alt="Photo" style="width:${w};height:${h};object-fit:cover;border:1px solid #999;border-radius:4px;flex-shrink:0;">`;
            return `<div style="width:${w};height:${h};border:1px dashed #bbb;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:0.7rem;flex-shrink:0;text-align:center;">Pas de photo</div>`;
        };
        const renderDetailed = (a) => {
            const ch = linkedChar(a);
            const chLine = ch ? `<div class="ac-meta"><strong>🎭 Joue :</strong> ${Utils.escape(ch.name)}</div>` : `<div class="ac-meta" style="color:#999;font-style:italic;">Aucun personnage lié</div>`;
            const contact = [
                a.email ? `📧 ${Utils.escape(a.email)}` : '',
                a.phone ? `📞 ${Utils.escape(a.phone)}` : '',
                a.city ? `📍 ${Utils.escape(a.city)}` : '',
                a.website ? `🌐 ${Utils.escape(a.website)}` : ''
            ].filter(Boolean).join(' • ');
            const status = [
                a.professionalStatus ? statusLabel[a.professionalStatus] || a.professionalStatus : '',
                a.collabType ? collabLabel[a.collabType] || a.collabType : ''
            ].filter(Boolean).join(' • ');
            const physical = [
                a.height ? `${a.height} cm` : '',
                a.weight ? `${a.weight} kg` : '',
                a.age ? `${a.age} ans` : '',
                optLabel('eyeColor', a.eyeColor),
                optLabel('hairColor', a.hairColor),
                optLabel('hairLength', a.hairLength),
                optLabel('corpulence', a.corpulence),
                optLabel('ethnicity', a.ethnicity)
            ].filter(Boolean).join(' • ');
            const skills = [
                a.sports ? `<strong>Sports :</strong> ${Utils.escape(a.sports)}` : '',
                a.languages ? `<strong>Langues :</strong> ${Utils.escape(a.languages)}` : ''
            ].filter(Boolean).join(' &nbsp; ');
            return `<div class="ac-card-detailed">
                ${photoHTML(a, '90px', '120px')}
                <div class="ac-info">
                    <h3 class="ac-name">${Utils.escape(a.name)}${a.gender ? ` <span class="ac-gender">(${Utils.escape(optLabel('gender', a.gender) || a.gender)})</span>` : ''}</h3>
                    ${chLine}
                    ${contact ? `<div class="ac-meta">${contact}</div>` : ''}
                    ${status ? `<div class="ac-meta"><strong>Statut :</strong> ${status}</div>` : ''}
                    ${a.address ? `<div class="ac-meta"><strong>Adresse :</strong> ${Utils.escape(a.address)}</div>` : ''}
                    ${a.bio ? `<div class="ac-bio">${Utils.escape(a.bio)}</div>` : ''}
                    ${physical ? `<div class="ac-meta"><strong>📏 Physique :</strong> ${physical}</div>` : ''}
                    ${skills ? `<div class="ac-meta">${skills}</div>` : ''}
                </div>
            </div>`;
        };
        const renderList = (a) => {
            const ch = linkedChar(a);
            const chTxt = ch ? Utils.escape(ch.name) : '<span style="color:#999;font-style:italic;">non lié</span>';
            const email = a.email ? Utils.escape(a.email) : '—';
            const phone = a.phone ? Utils.escape(a.phone) : '—';
            return `<div class="ac-card-list"><span class="ac-list-name">${Utils.escape(a.name)}</span> <span class="ac-list-sep">·</span> <span class="ac-list-char">🎭 ${chTxt}</span> <span class="ac-list-sep">·</span> <span class="ac-list-contact">📧 ${email}</span> <span class="ac-list-sep">·</span> <span class="ac-list-contact">📞 ${phone}</span></div>`;
        };
        const renderCard = (a) => {
            const ch = linkedChar(a);
            const physical = [
                a.height ? `Taille : ${a.height} cm` : '',
                a.weight ? `Poids : ${a.weight} kg` : '',
                a.age ? `Âge : ${a.age} ans` : '',
                optLabel('eyeColor', a.eyeColor) ? `Yeux : ${optLabel('eyeColor', a.eyeColor)}` : '',
                optLabel('hairColor', a.hairColor) ? `Cheveux : ${optLabel('hairColor', a.hairColor)}` : '',
                optLabel('hairLength', a.hairLength) ? `Longueur : ${optLabel('hairLength', a.hairLength)}` : '',
                optLabel('corpulence', a.corpulence) ? `Corpulence : ${optLabel('corpulence', a.corpulence)}` : '',
                optLabel('ethnicity', a.ethnicity) ? `Origine : ${optLabel('ethnicity', a.ethnicity)}` : ''
            ].filter(Boolean);
            const status = [
                a.professionalStatus ? statusLabel[a.professionalStatus] || a.professionalStatus : '',
                a.collabType ? collabLabel[a.collabType] || a.collabType : ''
            ].filter(Boolean).join(' • ');
            return `<div class="ac-fiche">
                <div class="ac-fiche-top">
                    <div class="ac-fiche-photo">${photoHTML(a, '100%', '100%')}</div>
                    <div class="ac-fiche-title">
                        <h2>${Utils.escape(a.name)}</h2>
                        ${a.gender ? `<div class="ac-fiche-sub">${Utils.escape(optLabel('gender', a.gender) || a.gender)}</div>` : ''}
                        ${ch ? `<div class="ac-fiche-role">🎭 ${Utils.escape(ch.name)}</div>` : '<div class="ac-fiche-role" style="color:#999;font-style:italic;">Aucun personnage lié</div>'}
                        ${status ? `<div class="ac-fiche-status">${status}</div>` : ''}
                        <div class="ac-fiche-zone-title" style="margin-top:8px;">📞 Contact</div>
                        ${a.email ? `<div>📧 ${Utils.escape(a.email)}</div>` : ''}
                        ${a.phone ? `<div>📞 ${Utils.escape(a.phone)}</div>` : ''}
                        ${a.city ? `<div>📍 ${Utils.escape(a.city)}</div>` : ''}
                        ${a.website ? `<div>🌐 ${Utils.escape(a.website)}</div>` : ''}
                    </div>
                </div>
                <div class="ac-fiche-bottom">
                    <div class="ac-fiche-zone-title">📋 Informations générales</div>
                    <div class="ac-fiche-grid">
                        <div class="ac-fiche-col">
                            <div class="ac-fiche-subtitle">📏 Description physique</div>
                            ${physical.map(p => `<div>${p}</div>`).join('')}
                            ${a.sports ? `<div style="margin-top:4px;"><strong>Sports :</strong> ${Utils.escape(a.sports)}</div>` : ''}
                            ${a.languages ? `<div><strong>Langues :</strong> ${Utils.escape(a.languages)}</div>` : ''}
                        </div>
                        <div class="ac-fiche-col">
                            ${a.address ? `<div class="ac-fiche-subtitle">📍 Adresse</div><div style="margin-bottom:6px;">${Utils.escape(a.address)}</div>` : ''}
                            ${a.bio ? `<div class="ac-fiche-subtitle">📝 Bio</div><div class="ac-fiche-bio-text">${Utils.escape(a.bio)}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        };
        // Construction body
        let bodyHTML = '';
        let cssOrientation = 'portrait';
        if(mode === 'card') {
            cssOrientation = 'landscape';
            filteredActors.forEach(a => { bodyHTML += renderCard(a); });
        } else {
            groupOrder.forEach(gid => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                bodyHTML += `<div class="ac-group">${Utils.escape(groupName)}</div>`;
                if(mode === 'detailed') {
                    grouped[gid].forEach(a => { bodyHTML += renderDetailed(a); });
                } else {
                    grouped[gid].forEach(a => { bodyHTML += renderList(a); });
                }
            });
            // Section "À caster / non liés" (uniquement si pas de filtre saison)
            if(unlinked.length > 0 && !hasSeasonFilter) {
                bodyHTML += `<div class="ac-group" style="background:#666;">À caster / non liés (${unlinked.length})</div>`;
                if(mode === 'detailed') {
                    unlinked.forEach(a => { bodyHTML += renderDetailed(a); });
                } else {
                    unlinked.forEach(a => { bodyHTML += renderList(a); });
                }
            }
        }
        const css = `
            @page { size: A4 ${cssOrientation}; margin: 12mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: white; color: #222; }
            h1.doc-title { font-size: 1.4rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #333; }
            .ac-group { background: #333; color: white; padding: 8px 14px; font-size: 1rem; font-weight: bold; letter-spacing: 0.5px; margin: 6mm 0 3mm 0; border-radius: 4px; page-break-after: avoid; break-after: avoid; }
            .ac-group:first-child { margin-top: 0; }
            .ac-card-detailed { display: flex; gap: 12px; border: 1px solid #999; border-radius: 6px; padding: 12px; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid; background: white; }
            .ac-info { flex: 1; min-width: 0; }
            .ac-name { font-size: 1.05rem; margin: 0 0 6px 0; }
            .ac-gender { font-weight: normal; font-size: 0.85rem; color: #666; }
            .ac-meta { font-size: 0.82rem; color: #444; margin-bottom: 3px; line-height: 1.4; }
            .ac-bio { font-size: 0.82rem; color: #333; margin: 6px 0; padding-top: 6px; border-top: 1px dashed #ccc; line-height: 1.4; white-space: pre-wrap; }
            .ac-card-list { padding: 5px 8px; border-bottom: 1px dotted #ccc; font-size: 0.84rem; page-break-inside: avoid; break-inside: avoid; line-height: 1.5; }
            .ac-list-name { font-weight: bold; }
            .ac-list-sep { color: #999; margin: 0 3px; }
            .ac-list-char { color: #555; }
            .ac-list-contact { font-size: 0.8rem; color: #666; }
            /* Mode Fiche : 1 page A4 paysage par comédien */
            .ac-fiche { page-break-after: always; break-after: page; height: 186mm; display: flex; flex-direction: column; gap: 6mm; box-sizing: border-box; overflow: hidden; }
            .ac-fiche:last-child { page-break-after: auto; }
            .ac-fiche-top { display: flex; gap: 8mm; height: 90mm; flex-shrink: 0; }
            .ac-fiche-photo { width: 110mm; height: 90mm; flex-shrink: 0; border: 1px solid #999; border-radius: 6px; overflow: hidden; }
            .ac-fiche-photo img, .ac-fiche-photo > div { width: 100% !important; height: 100% !important; border: none !important; border-radius: 0 !important; }
            .ac-fiche-title { flex: 1; min-width: 0; border: 1px solid #ccc; border-radius: 6px; padding: 6mm; font-size: 0.85rem; line-height: 1.5; overflow: hidden; }
            .ac-fiche-title h2 { font-size: 1.5rem; margin: 0 0 4px 0; }
            .ac-fiche-sub { font-size: 0.9rem; color: #666; margin-bottom: 4px; }
            .ac-fiche-role { font-size: 1rem; color: #333; margin-bottom: 6px; }
            .ac-fiche-status { font-size: 0.8rem; color: #555; padding: 2px 8px; background: #eee; display: inline-block; border-radius: 3px; margin-bottom: 4px; }
            .ac-fiche-bottom { flex: 1; min-height: 0; border: 1px solid #ccc; border-radius: 6px; padding: 6mm; font-size: 0.85rem; line-height: 1.5; overflow: hidden; }
            .ac-fiche-zone-title { font-weight: bold; font-size: 0.95rem; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
            .ac-fiche-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
            .ac-fiche-col { min-width: 0; }
            .ac-fiche-subtitle { font-weight: bold; font-size: 0.85rem; color: #555; margin-top: 6px; margin-bottom: 3px; }
            .ac-fiche-bio-text { font-size: 0.82rem; white-space: pre-wrap; line-height: 1.4; }
        `;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title><style>${css}</style></head><body>
            ${mode === 'card' ? '' : `<h1 class="doc-title">${docTitle}</h1>`}
            ${bodyHTML}
            <scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.print();},500);});<\/scr` + `ipt>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(printWindow) {
            printWindow.addEventListener('afterprint', () => { URL.revokeObjectURL(blobUrl); printWindow.close(); }, { once: true });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        }
    },
    
    printLocations: (episodeIds, mode) => {
        const isSeries = state.currentProjectType === 'series';
        if(isSeries && !episodeIds) { UIPrint._openLocsSeasonChooser(); return; }
        if(!mode) { UIPrint._openLocsModeChooser(episodeIds); return; }
        let scenesScope;
        if(isSeries && episodeIds && episodeIds.length > 0) {
            scenesScope = (state.data.scenes || []).filter(s => episodeIds.includes(s.episodeId));
        } else {
            scenesScope = state.data.scenes || [];
        }
        UIPrint._launchLocsPrint(scenesScope, mode, isSeries && episodeIds && episodeIds.length > 0);
    },
    
    _openLocsSeasonChooser: () => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { UIPrint.printLocations([], null); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="lseachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">🏠 Imprimer les décors</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="lsea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="lsea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="lsea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="lsea-ok" style="margin:0;">Suivant</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#lsea-all').onclick = () => overlay.querySelectorAll('.lseachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#lsea-none').onclick = () => overlay.querySelectorAll('.lseachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#lsea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#lsea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.lseachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => UIPrint.printLocations(epIds), 100);
        };
    },
    
    _openLocsModeChooser: (episodeIds) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:460px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">🏠 Mode d'impression</div>
            <div style="text-align:left;margin-bottom:14px;">
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;"><input type="radio" name="lmode" value="detailed" checked style="margin-right:8px;"><strong>Détaillé</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 par ligne, 1ère photo + adresse + contact + accès + scènes</span></label>
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;"><input type="radio" name="lmode" value="list" style="margin-right:8px;"><strong>Liste</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 colonne dense : nom + nb scènes + adresse</span></label>
                <label style="display:block;padding:10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;"><input type="radio" name="lmode" value="card" style="margin-right:8px;"><strong>Fiche</strong><br><span style="font-size:0.8rem;color:var(--text-sec);">1 page A4 paysage par lieu (+ pages photos), pour les équipes de tournage</span></label>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="lmode-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="lmode-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#lmode-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#lmode-ok').onclick = () => {
            const mode = overlay.querySelector('input[name="lmode"]:checked').value;
            overlay.remove();
            setTimeout(() => UIPrint.printLocations(episodeIds, mode), 100);
        };
    },
    
    _launchLocsPrint: (scenesScope, mode, hasSeasonFilter) => {
        const filmTitle = state.data.title || '';
        const docTitle = `Décors — ${filmTitle}`.trim();
        const allLocations = state.data.locations || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'lieu');
        const isSeries = state.currentProjectType === 'series';
        const allScenes = state.data.scenes || [];
        // Helper : scènes tournées dans un lieu (matche le titre du lieu avec le préfixe INT/EXT du titre de scène)
        const locationScenes = (loc, scenePool) => scenePool.filter(s => {
            if(!s.title) return false;
            const m = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
            if(m && m[1]) return m[1].trim().toUpperCase() === loc.name.toUpperCase();
            return false;
        });
        // Filtrer lieux : si série filtrée, ne garder que ceux qui ont au moins 1 scène dans le scope
        const usedLocations = [];
        const unusedLocations = [];
        allLocations.forEach(loc => {
            const scenesInScope = locationScenes(loc, scenesScope);
            if(scenesInScope.length > 0) usedLocations.push(loc);
            else unusedLocations.push(loc);
        });
        if(usedLocations.length === 0 && unusedLocations.length === 0) { Utils.toast('Aucun décor à imprimer', 'warning'); return; }
        // Helpers labels scène
        const sceneLabel = (s) => {
            if(isSeries) {
                const ep = (state.data.episodes || []).find(e => e.id === s.episodeId);
                if(ep) {
                    const scenesInEp = allScenes.filter(x => x.episodeId === ep.id);
                    return UI.formatSceneNumber(s, scenesInEp.indexOf(s));
                }
            }
            return '#' + (allScenes.indexOf(s) + 1);
        };
        // Grouper par groupe
        const grouped = {};
        usedLocations.forEach(loc => {
            const gid = loc.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(loc);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        // Helpers HTML
        const photoOrPlaceholder = (url, w, h, fontSize) => {
            if(url) return `<img src="${url}" alt="Photo" style="width:${w};height:${h};object-fit:cover;border:1px solid #999;border-radius:4px;flex-shrink:0;">`;
            return `<div style="width:${w};height:${h};border:1px dashed #bbb;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:${fontSize};flex-shrink:0;text-align:center;">Pas de photo</div>`;
        };
        const renderDetailed = (loc) => {
            const photos = loc.galleryPhotos || [];
            const firstPhoto = photos[0] || '';
            const sList = locationScenes(loc, scenesScope);
            const sceneTags = sList.length > 0
                ? sList.map(s => `<span class="lc-tag">${sceneLabel(s)}</span>`).join(' ')
                : '<span style="color:#999;font-style:italic;">Aucune scène dans ce décor</span>';
            const realName = loc.realName ? `<div class="lc-meta"><strong>📍 Lieu réel :</strong> ${Utils.escape(loc.realName)}</div>` : '';
            const desc = loc.desc ? `<div class="lc-desc">${Utils.escape(loc.desc)}</div>` : '';
            const address = loc.address ? `<div class="lc-meta"><strong>Adresse :</strong> ${Utils.escape(loc.address)}</div>` : '';
            const contact = (loc.contactName || loc.contactPhone) ? `<div class="lc-meta"><strong>Contact :</strong> ${Utils.escape(loc.contactName || '')}${loc.contactPhone ? ' — ' + Utils.escape(loc.contactPhone) : ''}</div>` : '';
            const access = loc.accessNotes ? `<div class="lc-meta"><strong>Accès :</strong> ${Utils.escape(loc.accessNotes)}</div>` : '';
            const photoCount = photos.length > 1 ? `<div class="lc-meta" style="color:#666;font-size:0.78rem;">📸 ${photos.length} photos disponibles</div>` : '';
            return `<div class="lc-card-detailed">
                ${photoOrPlaceholder(firstPhoto, '100px', '120px', '0.7rem')}
                <div class="lc-info">
                    <h3 class="lc-name">🏠 ${Utils.escape(loc.name)}</h3>
                    ${realName}
                    ${desc}
                    ${address}
                    ${contact}
                    ${access}
                    ${photoCount}
                    <div class="lc-scenes"><strong>🎬 Scènes (${sList.length}) :</strong> ${sceneTags}</div>
                </div>
            </div>`;
        };
        const renderList = (loc) => {
            const sList = locationScenes(loc, scenesScope);
            const addr = loc.address ? Utils.escape(loc.address) : '<span style="color:#999;font-style:italic;">pas d\'adresse</span>';
            return `<div class="lc-card-list"><span class="lc-list-name">🏠 ${Utils.escape(loc.name)}</span> <span class="lc-list-sep">·</span> <span class="lc-list-count">${sList.length} sc.</span> <span class="lc-list-sep">·</span> <span class="lc-list-addr">${addr}</span></div>`;
        };
        const renderCard = (loc) => {
            const photos = loc.galleryPhotos || [];
            const firstPhoto = photos[0] || '';
            const sList = locationScenes(loc, scenesScope);
            const sceneTags = sList.length > 0
                ? sList.map(s => `<span class="lc-tag">${sceneLabel(s)}</span>`).join(' ')
                : '<span style="color:#999;font-style:italic;">Aucune scène</span>';
            // Page principale (1ère page de la fiche)
            let html = `<div class="lc-fiche">
                <div class="lc-fiche-top">
                    <div class="lc-fiche-photo">${photoOrPlaceholder(firstPhoto, '100%', '100%', '0.9rem')}</div>
                    <div class="lc-fiche-title">
                        <h2>🏠 ${Utils.escape(loc.name)}</h2>
                        ${loc.realName ? `<div class="lc-fiche-sub">${Utils.escape(loc.realName)}</div>` : ''}
                        <div class="lc-fiche-meta"><strong>🎬 ${sList.length}</strong> scène${sList.length > 1 ? 's' : ''} tournée${sList.length > 1 ? 's' : ''}</div>
                        ${photos.length > 1 ? `<div class="lc-fiche-meta" style="color:#666;font-size:0.85rem;">📸 ${photos.length} photos de repérage</div>` : ''}
                    </div>
                </div>
                <div class="lc-fiche-bottom">
                    <div class="lc-fiche-grid">
                        <div class="lc-fiche-col">
                            <div class="lc-fiche-zone-title">📍 Adresse & Contact</div>
                            ${loc.address ? `<div style="margin-bottom:6px;">${Utils.escape(loc.address)}</div>` : '<div style="color:#999;font-style:italic;">Pas d\'adresse renseignée</div>'}
                            ${loc.contactName ? `<div><strong>👤 ${Utils.escape(loc.contactName)}</strong></div>` : ''}
                            ${loc.contactPhone ? `<div>📞 ${Utils.escape(loc.contactPhone)}</div>` : ''}
                            ${loc.accessNotes ? `<div class="lc-fiche-bio"><strong>🔑 Accès :</strong><br>${Utils.escape(loc.accessNotes)}</div>` : ''}
                        </div>
                        <div class="lc-fiche-col">
                            <div class="lc-fiche-zone-title">📋 Description</div>
                            ${loc.desc ? `<div class="lc-fiche-desc">${Utils.escape(loc.desc)}</div>` : '<div style="color:#999;font-style:italic;">Pas de description</div>'}
                            <div class="lc-fiche-zone-title" style="margin-top:8px;">🎬 Scènes</div>
                            <div style="font-size:0.78rem;line-height:1.6;">${sceneTags}</div>
                        </div>
                    </div>
                </div>
            </div>`;
            // Pages supplémentaires : 4 photos par page (uniquement si plus d'1 photo)
            if(photos.length > 1) {
                const extraPhotos = photos.slice(1); // sauter la 1ère déjà affichée
                for(let i = 0; i < extraPhotos.length; i += 4) {
                    const chunk = extraPhotos.slice(i, i + 4);
                    html += `<div class="lc-fiche-photos">
                        <h2>🏠 ${Utils.escape(loc.name)} <span style="font-weight:normal;font-size:1rem;color:#666;">— Photos de repérage</span></h2>
                        <div class="lc-photo-grid">
                            ${chunk.map(p => `<div class="lc-photo-cell"><img src="${p}" alt="Photo"></div>`).join('')}
                        </div>
                    </div>`;
                }
            }
            return html;
        };
        // Construction body
        let bodyHTML = '';
        let cssOrientation = 'portrait';
        if(mode === 'card') {
            cssOrientation = 'landscape';
            usedLocations.forEach(loc => { bodyHTML += renderCard(loc); });
            if(unusedLocations.length > 0 && !hasSeasonFilter) {
                unusedLocations.forEach(loc => { bodyHTML += renderCard(loc); });
            }
        } else {
            groupOrder.forEach(gid => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                bodyHTML += `<div class="lc-group">${Utils.escape(groupName)}</div>`;
                if(mode === 'detailed') {
                    grouped[gid].forEach(loc => { bodyHTML += renderDetailed(loc); });
                } else {
                    grouped[gid].forEach(loc => { bodyHTML += renderList(loc); });
                }
            });
            if(unusedLocations.length > 0 && !hasSeasonFilter) {
                bodyHTML += `<div class="lc-group" style="background:#666;">Lieux non utilisés (${unusedLocations.length})</div>`;
                if(mode === 'detailed') {
                    unusedLocations.forEach(loc => { bodyHTML += renderDetailed(loc); });
                } else {
                    unusedLocations.forEach(loc => { bodyHTML += renderList(loc); });
                }
            }
        }
        const css = `
            @page { size: A4 ${cssOrientation}; margin: 12mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: white; color: #222; }
            h1.doc-title { font-size: 1.4rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #333; }
            .lc-group { background: #333; color: white; padding: 8px 14px; font-size: 1rem; font-weight: bold; letter-spacing: 0.5px; margin: 6mm 0 3mm 0; border-radius: 4px; page-break-after: avoid; break-after: avoid; }
            .lc-group:first-child { margin-top: 0; }
            .lc-card-detailed { display: flex; gap: 12px; border: 1px solid #999; border-radius: 6px; padding: 12px; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid; background: white; }
            .lc-info { flex: 1; min-width: 0; }
            .lc-name { font-size: 1.05rem; margin: 0 0 6px 0; }
            .lc-meta { font-size: 0.82rem; color: #444; margin-bottom: 3px; line-height: 1.4; }
            .lc-desc { font-size: 0.82rem; color: #333; margin: 4px 0 6px 0; line-height: 1.4; white-space: pre-wrap; }
            .lc-scenes { font-size: 0.78rem; color: #444; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ccc; line-height: 1.6; }
            .lc-tag { display: inline-block; background: #e8e8e8; padding: 1px 6px; border-radius: 3px; font-size: 0.72rem; margin: 1px 2px; color: #333; }
            .lc-card-list { padding: 5px 8px; border-bottom: 1px dotted #ccc; font-size: 0.84rem; page-break-inside: avoid; break-inside: avoid; line-height: 1.5; }
            .lc-list-name { font-weight: bold; }
            .lc-list-sep { color: #999; margin: 0 3px; }
            .lc-list-count { color: #555; font-size: 0.78rem; }
            .lc-list-addr { color: #666; font-size: 0.8rem; }
            /* Mode Fiche : 1 page A4 paysage par lieu */
            .lc-fiche { page-break-after: always; break-after: page; height: 186mm; display: flex; flex-direction: column; gap: 6mm; box-sizing: border-box; overflow: hidden; }
            .lc-fiche-top { display: flex; gap: 8mm; height: 90mm; flex-shrink: 0; }
            .lc-fiche-photo { width: 130mm; height: 90mm; flex-shrink: 0; border: 1px solid #999; border-radius: 6px; overflow: hidden; }
            .lc-fiche-photo img, .lc-fiche-photo > div { width: 100% !important; height: 100% !important; border: none !important; border-radius: 0 !important; }
            .lc-fiche-title { flex: 1; min-width: 0; border: 1px solid #ccc; border-radius: 6px; padding: 6mm; font-size: 0.85rem; line-height: 1.5; overflow: hidden; }
            .lc-fiche-title h2 { font-size: 1.5rem; margin: 0 0 6px 0; }
            .lc-fiche-sub { font-size: 1rem; color: #666; margin-bottom: 8px; font-style: italic; }
            .lc-fiche-meta { font-size: 0.9rem; margin-bottom: 4px; }
            .lc-fiche-bottom { flex: 1; min-height: 0; border: 1px solid #ccc; border-radius: 6px; padding: 6mm; font-size: 0.85rem; line-height: 1.5; overflow: hidden; }
            .lc-fiche-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; height: 100%; }
            .lc-fiche-col { min-width: 0; overflow: hidden; }
            .lc-fiche-zone-title { font-weight: bold; font-size: 0.95rem; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
            .lc-fiche-bio { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #ccc; font-size: 0.82rem; white-space: pre-wrap; }
            .lc-fiche-desc { font-size: 0.82rem; line-height: 1.4; white-space: pre-wrap; }
            /* Pages supplémentaires de photos */
            .lc-fiche-photos { page-break-after: always; break-after: page; height: 186mm; display: flex; flex-direction: column; box-sizing: border-box; }
            .lc-fiche-photos:last-child { page-break-after: auto; }
            .lc-fiche-photos h2 { font-size: 1.2rem; margin: 0 0 8mm 0; padding-bottom: 4px; border-bottom: 2px solid #333; flex-shrink: 0; }
            .lc-photo-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 6mm; min-height: 0; }
            .lc-photo-cell { border: 1px solid #999; border-radius: 6px; overflow: hidden; min-height: 0; }
            .lc-photo-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
        `;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title><style>${css}</style></head><body>
            ${mode === 'card' ? '' : `<h1 class="doc-title">${docTitle}</h1>`}
            ${bodyHTML}
            <scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.print();},500);});<\/scr` + `ipt>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(printWindow) {
            printWindow.addEventListener('afterprint', () => { URL.revokeObjectURL(blobUrl); printWindow.close(); }, { once: true });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        }
    },
    
    printStats: () => {
        // S'assurer que les stats sont rendues à l'écran avant capture
        if(typeof Stats !== 'undefined' && Stats.render) Stats.render();
        // Petit délai pour que Chart.js finisse de dessiner
        setTimeout(() => UIPrint._openStatsModeChooser(), 350);
    },
    
    _openStatsModeChooser: () => {
        const isSeries = state.currentProjectType === 'series';
        const sections = [
            { id: 'cards', label: '📊 Cartes résumé (totaux)', defaultOn: true, alwaysShow: true },
            { id: 'seasons', label: '📺 Stats par saison', defaultOn: isSeries, alwaysShow: isSeries },
            { id: 'progress', label: '📈 Avancement (planification, INT/EXT, JOUR/NUIT)', defaultOn: true, alwaysShow: true },
            { id: 'parite', label: '⚖️ Parité', defaultOn: true, alwaysShow: true },
            { id: 'budget', label: '💰 Budget', defaultOn: true, alwaysShow: true },
            { id: 'time', label: '⏱️ Temps par Tag/Acte', defaultOn: true, alwaysShow: true },
            { id: 'charsLocs', label: '👥 Personnages & Lieux', defaultOn: true, alwaysShow: true },
            { id: 'crewSb', label: '🎬 Équipe & Storyboard', defaultOn: true, alwaysShow: true },
            { id: 'castingDays', label: '🎭 Jours de tournage par comédien', defaultOn: true, alwaysShow: true }
        ];
        const sectionItems = sections.filter(s => s.alwaysShow).map(s => {
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="statsec" value="${s.id}" ${s.defaultOn ? 'checked' : ''} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;">${s.label}</td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:520px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">📊 Imprimer les statistiques</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;font-weight:bold;">Sections à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${sectionItems}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="st-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="st-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="st-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="st-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#st-all').onclick = () => overlay.querySelectorAll('.statsec').forEach(cb => cb.checked = true);
        overlay.querySelector('#st-none').onclick = () => overlay.querySelectorAll('.statsec').forEach(cb => cb.checked = false);
        overlay.querySelector('#st-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#st-ok').onclick = () => {
            const selectedSections = Array.from(overlay.querySelectorAll('.statsec:checked')).map(cb => cb.value);
            if(selectedSections.length === 0) { Utils.toast('Sélectionnez au moins une section', 'warning'); return; }
            overlay.remove();
            setTimeout(() => UIPrint._launchStatsPrint(selectedSections), 100);
        };
    },
    
    _launchStatsPrint: (sections) => {
        const filmTitle = state.data.title || '';
        const docTitle = `Statistiques — ${filmTitle}`.trim();
        const orientation = 'portrait';
        // Construction du label de scope (pour la page de garde)
        let scopeLabel = 'Tout le projet';
        const f = state.statsFilter || { scope: 'all' };
        if(f.scope === 'season' && f.seasonId) {
            const sea = (state.data.seasons || []).find(s => s.id === f.seasonId);
            if(sea) scopeLabel = `Saison ${String(sea.number).padStart(2, '0')}${sea.title ? ' — ' + sea.title : ''}`;
        } else if(f.scope === 'episode' && f.episodeId) {
            const ep = (state.data.episodes || []).find(e => e.id === f.episodeId);
            if(ep) {
                const sea = (state.data.seasons || []).find(s => s.id === ep.seasonId);
                const sNum = sea ? String(sea.number).padStart(2, '0') : '??';
                const eNum = String(ep.number).padStart(2, '0');
                scopeLabel = `Saison ${sNum} — Épisode ${eNum}${ep.title ? ' — ' + ep.title : ''}`;
            }
        }
        // Helper : capture un canvas Chart.js en data URL
        const captureCanvas = (canvasId) => {
            const c = document.getElementById(canvasId);
            if(!c) return null;
            try { return c.toDataURL('image/png'); } catch(e) { return null; }
        };
        // Helper : récupère le HTML d'une zone et nettoie les éléments interactifs
        const captureZone = (selector) => {
            const el = document.querySelector(selector);
            if(!el) return '';
            return el.outerHTML;
        };
        // Construction body HTML par section
        let bodyHTML = '';
        // Page de garde
        const today = new Date().toLocaleDateString('fr-FR');
        bodyHTML += `<div class="cover-page">
            <div class="cover-content">
                <div class="cover-title">STATISTIQUES</div>
                <div class="cover-film">${Utils.escape(filmTitle)}</div>
                <div class="cover-scope">${Utils.escape(scopeLabel)}</div>
                <div class="cover-date">Imprimé le ${today}</div>
            </div>
        </div>`;
        // Section Cartes résumé
        if(sections.includes('cards')) {
            const cards = [
                { label: 'Total Scènes', val: document.getElementById('stat-total-scenes')?.innerText || '0' },
                { label: 'Total Dialogues', val: document.getElementById('stat-total-dials')?.innerText || '0' },
                { label: 'Durée Estimée', val: document.getElementById('stat-total-time')?.innerText || '0 min' },
                { label: 'Total Plans', val: document.getElementById('stat-total-shots')?.innerText || '0' },
                { label: 'Équipe Technique', val: document.getElementById('stat-total-crew')?.innerText || '0' },
                { label: 'Budget Équipe', val: document.getElementById('stat-total-budget')?.innerText || '0 €' }
            ];
            bodyHTML += `<div class="st-section"><h2>📊 Vue d'ensemble</h2><div class="st-cards-grid">`;
            cards.forEach(c => { bodyHTML += `<div class="st-card"><div class="st-card-label">${c.label}</div><div class="st-card-value">${Utils.escape(c.val)}</div></div>`; });
            bodyHTML += `</div></div>`;
        }
        // Section Stats par saison
        if(sections.includes('seasons')) {
            const tableHTML = captureZone('#stats-seasons-section');
            if(tableHTML) bodyHTML += `<div class="st-section">${tableHTML}</div>`;
        }
        // Section Avancement
        if(sections.includes('progress')) {
            const intExt = captureCanvas('chart-int-ext');
            const jourNuit = captureCanvas('chart-jour-nuit');
            const planned = document.getElementById('progress-scenes-planned');
            const plannedPct = planned ? planned.style.width : '0%';
            const plannedTxt = planned ? planned.innerText : '0%';
            bodyHTML += `<div class="st-section"><h2>📈 Avancement du projet</h2><div class="st-charts-grid">
                <div class="st-chart-box"><div class="st-chart-title">Scènes planifiées</div><div class="st-progress-bar"><div class="st-progress-fill" style="width:${plannedPct};">${Utils.escape(plannedTxt)}</div></div></div>
                ${intExt ? `<div class="st-chart-box"><div class="st-chart-title">Répartition INT / EXT</div><img src="${intExt}" alt="Graphique de répartition" class="st-chart-img"></div>` : ''}
                ${jourNuit ? `<div class="st-chart-box"><div class="st-chart-title">Répartition JOUR / NUIT</div><img src="${jourNuit}" alt="Graphique de répartition" class="st-chart-img"></div>` : ''}
            </div></div>`;
        }
        // Section Parité
        if(sections.includes('parite')) {
            const pariteDefs = [
                { id: 'chart-parite-chars', label: 'Personnages' },
                { id: 'chart-parite-dialogues', label: 'Répliques de dialogue' },
                { id: 'chart-parite-principaux', label: 'Rôles principaux' },
                { id: 'chart-parite-secondaires', label: 'Rôles secondaires' },
                { id: 'chart-parite-scenes', label: 'Apparitions en scène' },
                { id: 'chart-parite-crew', label: 'Technicien·nes' }
            ];
            const pariteBoxes = pariteDefs.map(p => {
                const img = captureCanvas(p.id);
                return img ? `<div class="st-chart-box"><div class="st-chart-title">${p.label}</div><img src="${img}" alt="Graphique de parité" class="st-chart-img"></div>` : '';
            }).join('');
            if(pariteBoxes) bodyHTML += `<div class="st-section"><h2>⚖️ Parité</h2><div class="st-charts-grid">${pariteBoxes}</div></div>`;
        }
        // Section Budget
        if(sections.includes('budget')) {
            const budgetCat = captureCanvas('chart-budget-cat');
            const bPrev = document.getElementById('budget-prevu')?.innerText || '0 €';
            const bDep = document.getElementById('budget-depense')?.innerText || '0 €';
            const bRest = document.getElementById('budget-reste')?.innerText || '0 €';
            const bProg = document.getElementById('progress-budget');
            const bProgPct = bProg ? bProg.style.width : '0%';
            const bProgTxt = bProg ? bProg.innerText : '0%';
            bodyHTML += `<div class="st-section"><h2>💰 Budget</h2><div class="st-charts-grid">
                ${budgetCat ? `<div class="st-chart-box"><div class="st-chart-title">Dépenses par catégorie</div><img src="${budgetCat}" alt="Graphique du budget" class="st-chart-img"></div>` : ''}
                <div class="st-chart-box"><div class="st-chart-title">Budget vs Dépenses</div><div class="st-budget-grid"><div><div class="st-budget-label">Budget prévu</div><div class="st-budget-val">${Utils.escape(bPrev)}</div></div><div><div class="st-budget-label">Dépensé</div><div class="st-budget-val">${Utils.escape(bDep)}</div></div><div><div class="st-budget-label">Reste</div><div class="st-budget-val">${Utils.escape(bRest)}</div></div></div><div class="st-progress-bar mt-10"><div class="st-progress-fill" style="width:${bProgPct};background:#2196F3;">${Utils.escape(bProgTxt)}</div></div></div>
            </div></div>`;
        }
        // Section Temps par Tag
        if(sections.includes('time')) {
            const timeTags = captureCanvas('chart-time-tags');
            if(timeTags) bodyHTML += `<div class="st-section"><h2>⏱️ Temps par Tag/Acte</h2><div class="st-chart-box st-chart-wide"><div class="st-chart-title">Durée estimée par Tag</div><img src="${timeTags}" alt="Graphique de répartition" class="st-chart-img"></div></div>`;
        }
        // Section Persos & Lieux
        if(sections.includes('charsLocs')) {
            // 1er septembre — TROIS GRAPHIQUES MANQUAIENT A L'EXPORT PDF, EN
            // SILENCE. L'export cherchait chart-axes et chart-locs ; l'onglet
            // les nomme chart-tags et chart-lieux. Le ?. avalait le vide et
            // l'export sortait la seule colonne Personnages, sans erreur ni
            // trou visible. Meme faute plus bas pour le casting.
            const chars = document.getElementById('chart-chars')?.outerHTML || '';
            const axes = document.getElementById('chart-tags')?.outerHTML || '';
            const locs = document.getElementById('chart-lieux')?.outerHTML || '';
            if(chars || axes || locs) bodyHTML += `<div class="st-section"><h2>👥 Personnages & Lieux</h2><div class="st-charts-grid">
                ${chars ? `<div class="st-chart-box"><div class="st-chart-title">Personnages (mots)</div>${chars}</div>` : ''}
                ${axes ? `<div class="st-chart-box"><div class="st-chart-title">Répartition par Axe</div>${axes}</div>` : ''}
                ${locs ? `<div class="st-chart-box"><div class="st-chart-title">Lieux (scènes)</div>${locs}</div>` : ''}
            </div></div>`;
        }
        // Section Équipe & Storyboard
        if(sections.includes('crewSb')) {
            const crew = document.getElementById('chart-crew')?.outerHTML || '';
            const shots = document.getElementById('chart-shots')?.outerHTML || '';
            if(crew || shots) bodyHTML += `<div class="st-section"><h2>🎬 Équipe & Storyboard</h2><div class="st-charts-grid">
                ${crew ? `<div class="st-chart-box"><div class="st-chart-title">Équipe par Département</div>${crew}</div>` : ''}
                ${shots ? `<div class="st-chart-box"><div class="st-chart-title">Plans par Type</div>${shots}</div>` : ''}
            </div></div>`;
        }
        // Section Casting
        if(sections.includes('castingDays')) {
            // L'id reel est chart-actor-days (voir ci-dessus) : la section
            // entiere disparaissait de l'export, le if(casting) l'ecartant.
            const casting = document.getElementById('chart-actor-days')?.outerHTML || '';
            if(casting) bodyHTML += `<div class="st-section"><h2>🎭 Jours de tournage par comédien</h2><div class="st-chart-box st-chart-wide">${casting}</div></div>`;
        }
        const cols = '1fr';
        const css = `
            @page { size: A4 ${orientation}; margin: 12mm; }
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: white; color: #222; }
            h2 { font-size: 1.1rem; margin: 0 0 8px 0; padding-bottom: 4px; border-bottom: 2px solid #333; }
            .cover-page { page-break-after: always; break-after: page; height: 250mm; display: flex; align-items: center; justify-content: center; }
            .cover-content { text-align: center; }
            .cover-title { font-size: 2.4rem; font-weight: bold; letter-spacing: 6px; margin-bottom: 30px; }
            .cover-film { font-size: 1.6rem; margin-bottom: 16px; color: #333; }
            .cover-scope { font-size: 1.1rem; color: #666; margin-bottom: 60px; font-style: italic; }
            .cover-date { font-size: 0.9rem; color: #999; }
            .st-section { margin-bottom: 12mm; page-break-inside: avoid; break-inside: avoid; }
            .st-cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
            .st-card { border: 1px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; background: #fafafa; }
            .st-card-label { font-size: 0.78rem; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
            .st-card-value { font-size: 1.5rem; font-weight: bold; color: #333; }
            .st-charts-grid { display: grid; grid-template-columns: ${cols}; gap: 6mm; }
            .st-chart-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: white; page-break-inside: avoid; break-inside: avoid; }
            .st-chart-wide { grid-column: 1 / -1; }
            .st-chart-title { font-size: 0.85rem; font-weight: bold; color: #555; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
            .st-chart-img { width: 100%; height: auto; max-height: 60mm; object-fit: contain; display: block; }
            .st-progress-bar { width: 100%; height: 24px; background: #e0e0e0; border-radius: 12px; overflow: hidden; }
            .st-progress-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); color: white; text-align: center; font-size: 0.8rem; line-height: 24px; font-weight: bold; }
            .mt-10 { margin-top: 10px; }
            .st-budget-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .st-budget-label { font-size: 0.72rem; color: #666; text-transform: uppercase; }
            .st-budget-val { font-size: 1.1rem; font-weight: bold; color: #333; }
            /* Tables et stats internes (capturés tels quels) */
            table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
            table th, table td { padding: 4px 8px; border: 1px solid #ddd; text-align: left; }
            table th { background: #f0f0f0; font-weight: bold; }
            /* Forcer le rendu des barres horizontales (chart-chars, chart-lieux, etc. qui sont des divs custom, pas des canvas) */
            .stat-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 0.78rem; }
            .stat-row-label { min-width: 80px; }
            .stat-row-bar { flex: 1; height: 14px; background: #eee; border-radius: 3px; overflow: hidden; }
            .stat-row-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); }
            .stat-row-val { min-width: 30px; text-align: right; font-weight: bold; }
            /* Cacher les éléments d'UI interactive qui ne devraient pas apparaître */
            button, .stats-scope-btn, #stats-scope-selector { display: none !important; }
        `;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title><style>${css}</style></head><body>
            ${bodyHTML}
            <scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.print();},500);});<\/scr` + `ipt>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(printWindow) {
            printWindow.addEventListener('afterprint', () => { URL.revokeObjectURL(blobUrl); printWindow.close(); }, { once: true });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        }
    },
  };
