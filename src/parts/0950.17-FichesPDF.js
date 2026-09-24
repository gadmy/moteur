    
// Module Help remplacé par Tutorial


// ============================================================
// MODULE FICHES PDF [Vague 2] — Personnages / Comédiens / Lieux
// Génération jsPDF avec 3 modes par section (detailed / list / card)
// + page de garde Final Draft + footer + filtrage par saisons
// ============================================================

const FichesPDF = {
    // ============================================================
    // ===== HELPERS COMMUNS (réutilisables pour les 3 sections) =====
    // ============================================================
    
    // Convertit une URL d'image en dataURL via canvas (gère CORS Supabase)
    // Retourne null si échec. Cache interne pour ne pas refaire le travail.
    _imageCache: {},
    _loadImageDataURL: (url) => {
        return new Promise((resolve) => {
            if(!url) { resolve(null); return; }
            // Déjà en dataURL ?
            if(url.startsWith('data:')) { resolve(url); return; }
            // Dans le cache ?
            if(FichesPDF._imageCache[url]) { resolve(FichesPDF._imageCache[url]); return; }
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // Limiter la résolution pour ne pas faire un PDF de 50Mo
                    const maxDim = 600;
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;
                    if(w > maxDim || h > maxDim) {
                        const ratio = Math.min(maxDim / w, maxDim / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    FichesPDF._imageCache[url] = dataUrl;
                    resolve(dataUrl);
                } catch(e) {
                    console.warn('[FichesPDF] Image conversion échouée :', e);
                    resolve(null);
                }
            };
            img.onerror = () => {
                console.warn('[FichesPDF] Image chargement échoué :', url);
                resolve(null);
            };
            img.src = Utils.signedUrlFor(url);
        });
    },
    
    // Précharge un array d'URLs et retourne un objet { url: dataURL }
    _preloadImages: async (urls) => {
        const unique = [...new Set(urls.filter(Boolean))];
        const results = await Promise.all(unique.map(u => FichesPDF._loadImageDataURL(u)));
        const map = {};
        unique.forEach((u, i) => { map[u] = results[i]; });
        return map;
    },
    
    // Dessine la page de garde Final Draft (style sobre, cohérent avec scénario/synopsis)
    // Note : ne réutilise PAS PdfTheme.coverPage (qui est trop générique). On veut un style propre.
    _drawCoverPage: (doc, sectionName) => {
        // Délègue à PdfTheme.coverPage (modèle unifié B) avec sélection d'auteur
        // contextuelle propre aux fiches (Personnages, Comédiens, Décors, Stats).
        const sectionAuthorMap = {
            'Personnages':   ['Scénariste', 'Réalisateur·rice'],
            'Comédiens':     ['Directeur·rice de casting', 'Régisseur·euse général·e'],
            'Décors':        ['Repéreur·euse', 'Directeur·rice de production', 'Régisseur·euse général·e'],
            'Statistiques':  ['Producteur·rice', 'Directeur·rice de production', '1er·ère assistant·e réalisateur·rice']
        };
        const wantedRoles = sectionAuthorMap[sectionName] || [];
        let author = null;
        for(const role of wantedRoles) {
            if(author) break;
            const member = (state.data.crew || []).find(m => {
                if(!m.role) return false;
                const r1 = String(m.role).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                const r2 = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                return r1 === r2 || r1.includes(r2);
            });
            if(member) author = member.name;
        }
        
        if(typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
            PdfTheme.coverPage(doc, { sectionName, customAuthor: author });
        }
    },
    
    // Dessine le footer sur toutes les pages (sauf la page de garde si présente)
    // "Date — N/Total" à droite, nom projet à gauche
    _drawFooters: (doc, includeCover, forDossier) => {
        // Délègue au footer unifié de PdfTheme (minimaliste "X / N" centré)
        // pour garantir une présentation cohérente avec les autres exports.
        // En mode Dossier (forDossier:true), ne dessine RIEN : pagination globale
        // gérée par buildDossierProd phase 7ter.
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { skipFirstPage: !!includeCover, forDossier: !!forDossier });
            return;
        }
        // Fallback si PdfTheme indisponible (ne devrait pas arriver)
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const totalPages = doc.internal.getNumberOfPages();
        for(let i = 1; i <= totalPages; i++) {
            if(includeCover && i === 1) continue;
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            doc.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
    },
    
    // Dessine une photo (depuis dataURL) ou un placeholder "Pas de photo"
    _drawPhotoOrPlaceholder: (doc, dataUrl, x, y, w, h) => {
        if(dataUrl) {
            try {
                doc.addImage(Utils.signedUrlFor(dataUrl), 'JPEG', x, y, w, h);
                // Cadre fin autour
                doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                doc.setLineWidth(0.3);
                doc.rect(x, y, w, h);
                return;
            } catch(e) {
                console.warn('[FichesPDF] addImage failed :', e);
            }
        }
        // Placeholder
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(x, y, w, h, 'F');
        doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1, 1], 0);
        doc.rect(x, y, w, h);
        doc.setLineDashPattern([], 0);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
        doc.text('Pas de photo', x + w/2, y + h/2, { align: 'center' });
    },
    
    // Dessine un bandeau "GROUPE : XXX" stylé
    // L'accent est défini par l'export appelant via FichesPDF._accent (couleur de section)
    _accent: null,
    // Titre de groupe (Protagonistes, Casting principal, Interieurs...) — meme
    // porte que les titres de section depuis v601 : la couleur vient de l'export
    // appelant (_accent), donc personnages en vert, decors en brun, etc.
    _drawGroupHeader: (doc, groupName, y, marginX, usableWidth) => {
        return PdfTheme.sectionBand(doc, {
            x: marginX, y, width: usableWidth, size: 10,
            title: groupName,
            accent: FichesPDF._accent || PdfTheme.COLORS.BANNER_BLUE
        }) + 1;
    },
    
    // Assure qu'il reste `space` mm avant la fin de la page sinon saut
    // Retourne le nouveau y (peut être margin si saut)
    _ensureSpace: (doc, y, space, pageHeight, marginBottom) => {
        if(y + space > pageHeight - marginBottom) {
            doc.addPage();
            return marginBottom;  // reset to top margin
        }
        return y;
    },
    
    // ============================================================
    // ===== PICKER COMMUN : Modale choix saisons (séries) =====
    // ============================================================
    // kind : 'chars' | 'actors' | 'locs' (pour les ids des inputs)
    // emoji + titre adaptés ; callback reçoit les episodeIds
    _openSeasonChooser: (kind, emoji, title, callback) => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { callback([]); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="fp-seachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">${emoji} ${title}</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="fp-sea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="fp-sea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="fp-sea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="fp-sea-ok" style="margin:0;">Suivant →</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#fp-sea-all').onclick  = () => overlay.querySelectorAll('.fp-seachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#fp-sea-none').onclick = () => overlay.querySelectorAll('.fp-seachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#fp-sea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#fp-sea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.fp-seachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => callback(epIds), 100);
        };
    },
    
    // ============================================================
    // ===== MODALE OPTIONS COMMUNE (mode + page de garde) =====
    // ============================================================
    // modes : array de {value, label, desc} — 2 ou 3 modes
    // emoji, title : pour le header
    // callback(opts) reçoit { mode, includeCover }
    _openOptionsModal: (emoji, title, modes, callback) => {
        const initialMode = modes[0].value;
        const modeButtons = modes.map((m, i) => 
            `<button type="button" class="fmt-btn ${i === 0 ? 'active' : ''}" data-mode="${m.value}" style="padding:10px 14px;font-size:0.85rem;text-align:left;">${m.label}<br><span style="font-size:0.75rem;color:var(--text-sec);font-weight:normal;">${m.desc}</span></button>`
        ).join('');
        
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:520px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:14px;">${emoji} ${title}</div>
            
            <div style="text-align:left;font-size:0.8rem;color:var(--text-sec);margin-bottom:10px;">Page de garde :</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:14px;">
                <button type="button" class="fmt-btn active" id="fp-opt-cover" data-active="1" style="padding:10px 14px;font-size:0.85rem;text-align:left;">📋 Inclure la page de titre</button>
            </div>
            
            <div style="text-align:left;font-size:0.8rem;color:var(--text-sec);margin-bottom:10px;">Mode de rendu :</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:14px;" id="fp-opt-modes">
                ${modeButtons}
            </div>
            
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="fp-opt-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="fp-opt-ok" style="margin:0;">📄 Générer le PDF</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        
        // Toggle page de garde
        const coverBtn = overlay.querySelector('#fp-opt-cover');
        coverBtn.onclick = () => {
            const isActive = coverBtn.classList.toggle('active');
            coverBtn.dataset.active = isActive ? '1' : '0';
        };
        
        // Boutons mode = radio (un seul actif)
        let selectedMode = initialMode;
        overlay.querySelectorAll('#fp-opt-modes .fmt-btn').forEach(btn => {
            btn.onclick = () => {
                overlay.querySelectorAll('#fp-opt-modes .fmt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMode = btn.dataset.mode;
            };
        });
        
        overlay.querySelector('#fp-opt-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#fp-opt-ok').onclick = () => {
            const includeCover = coverBtn.dataset.active === '1';
            overlay.remove();
            callback({ mode: selectedMode, includeCover });
        };
    },
    
    // ============================================================
    // ===== PERSONNAGES =====
    // ============================================================
    
    openCharactersModal: () => {
        const chars = state.data.characters || [];
        if(chars.length === 0) {
            Utils.toast('Aucun personnage à exporter', 'warning');
            return;
        }
        // Projet "série" : garde l'ancien chemin (choix de saison), que le hub
        // ne sait pas encore faire pour cette section. Sinon, hub direct.
        if(state.currentProjectType === 'series') {
            const continueToOptions = (episodeIds) => {
                const modes = [
                    { value: 'detailed', label: 'Détaillé', desc: 'Photo + bio + sexe + comédien lié + scènes (1 par ligne)' },
                    { value: 'list',     label: 'Liste',    desc: '2 colonnes compactes : nom + nombre de scènes' },
                    { value: 'card',     label: 'Fiche',    desc: '1 page A4 par personnage (grande photo + tous les détails)' }
                ];
                FichesPDF._openOptionsModal('👥', 'Personnages PDF — Options', modes, (opts) => {
                    FichesPDF.exportCharacters({ ...opts, episodeIds });
                });
            };
            FichesPDF._openSeasonChooser('chars', '👥', 'Personnages — Choix des saisons', continueToOptions);
            return;
        }
        Actions.openExportModal('chars');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'chars');
        });
    },
    
    exportCharacters: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        FichesPDF._accent = PdfTheme.accentFor('Personnages');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        const isSeries = state.currentProjectType === 'series';
        
        // ========= Données =========
        const allChars = state.data.characters || [];
        const actors = state.data.actors || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'perso');
        const allScenes = state.data.scenes || [];
        
        // Filtrage par saisons (si série)
        let scenesScope = allScenes;
        if(isSeries && opts.episodeIds && opts.episodeIds.length > 0) {
            scenesScope = allScenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        // Filtrer personnages : si série + saisons choisies, ne garder que ceux qui apparaissent
        const charsInScope = isSeries ? allChars.filter(ch => scenesScope.some(s => FicheLinks.sceneHasChar(s, ch))) : allChars;
        
        if(charsInScope.length === 0) {
            Utils.toast('Aucun personnage à exporter dans cette sélection', 'warning');
            return;
        }
        
        // Helpers
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
        
        // Précharger toutes les photos en parallèle (depuis les acteurs liés)
        Utils.toast('Préparation des photos...', 'info');
        const urls = charsInScope.map(ch => {
            const actor = ch.actor_id ? actors.find(a => a.id === ch.actor_id) : null;
            return actor && actor.photo ? actor.photo : null;
        }).filter(Boolean);
        const photoMap = await FichesPDF._preloadImages(urls);
        
        // ========= Page de garde =========
        if(opts.includeCover !== false) {
            FichesPDF._drawCoverPage(doc, 'Personnages');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Grouper =========
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
        
        // ========= Rendu selon mode =========
        const getActor = (ch) => ch.actor_id ? actors.find(a => a.id === ch.actor_id) : null;
        const genderLabel = (g) => ({ homme: 'Homme', femme: 'Femme', 'non-binaire': 'Non-binaire' }[g] || g || '');
        
        // ----- MODE DETAILED : 1 fiche par ligne, photo 30x40mm + nom + bio + scènes -----
        const renderDetailed = (ch) => {
            const cardHeight = 50;  // hauteur minimum d'une carte
            y = FichesPDF._ensureSpace(doc, y, cardHeight, pageHeight, margin);
            
            const photoW = 28, photoH = 36;
            const actor = getActor(ch);
            const photoUrl = actor && actor.photo ? photoMap[actor.photo] : null;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, margin, y, photoW, photoH);
            
            const textX = margin + photoW + 6;
            const textWidth = usableWidth - photoW - 6;
            let ty = y + 5;
            
            // Nom (grand, gras)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(ch.name, textX, ty);
            ty += 5;
            
            // Sexe
            const gender = genderLabel(ch.gender);
            if(gender) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('Sexe : ' + gender, textX, ty);
                ty += 4;
            }
            
            // Comédien lié
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(PdfTheme.cleanText(actor ? 'Joué par : ' + actor.name : '— Aucun comédien lié —'), textX, ty);
            ty += 4;
            
            // Bio
            if(ch.bio) {
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const bioLines = doc.splitTextToSize(ch.bio, textWidth);
                bioLines.slice(0, 4).forEach(line => {
                    doc.text(line, textX, ty);
                    ty += 3.8;
                });
                if(bioLines.length > 4) {
                    doc.setFont('helvetica', 'italic');
                    doc.text('…', textX, ty);
                    ty += 3.8;
                }
            }
            
            // Scènes
            const cs = charScenes(ch);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            if(cs.length > 0) {
                const labels = cs.map(s => sceneLabel(s)).join('  ');
                const sceneText = `Apparaît dans (${cs.length}) : ${labels}`;
                const scLines = doc.splitTextToSize(sceneText, textWidth);
                scLines.slice(0, 2).forEach(line => {
                    doc.text(line, textX, ty);
                    ty += 3.5;
                });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text(`N'apparaît dans aucune scène`, textX, ty);
                ty += 3.5;
            }
            
            // Cadre autour de la fiche
            const actualHeight = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualHeight);
            
            y += actualHeight + 3;
        };
        
        // ----- MODE LIST : 2 colonnes compactes -----
        const renderList = (chars) => {
            const colWidth = usableWidth / 2 - 3;
            let col = 0;
            let lineY = y;
            const lineHeight = 5.5;
            
            chars.forEach(ch => {
                if(col === 0) {
                    lineY = FichesPDF._ensureSpace(doc, lineY, lineHeight, pageHeight, margin);
                }
                const cs = charScenes(ch);
                const x = margin + col * (colWidth + 6);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                // Nom (tronqué si trop long)
                const nameW = colWidth - 18;
                let name = ch.name;
                while(doc.getTextWidth(name) > nameW && name.length > 5) {
                    name = name.substring(0, name.length - 2) + '…';
                }
                doc.text(name, x, lineY);
                // Nombre de scènes à droite de la colonne
                doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                doc.setFontSize(8);
                doc.text(`${cs.length} sc.`, x + colWidth, lineY, { align: 'right' });
                // Ligne pointillée sous le nom
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(x, lineY + 1.2, x + colWidth, lineY + 1.2);
                doc.setLineDashPattern([], 0);
                
                col = (col + 1) % 2;
                if(col === 0) lineY += lineHeight;
            });
            // Si fin sur la 1ère colonne, on passe à la ligne suivante
            if(col === 1) lineY += lineHeight;
            y = lineY + 2;
        };
        
        // ----- MODE CARD : 1 page A4 par personnage -----
        const renderCard = (ch) => {
            // Nouvelle page pour chaque personnage (sauf la 1ère qui est déjà neuve)
            // (on assume que le caller a déjà fait addPage ou est sur la 1ère page)
            
            const actor = getActor(ch);
            const photoUrl = actor && actor.photo ? photoMap[actor.photo] : null;
            
            // Bandeau titre coloré en haut
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('PERSONNAGE', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const projT = state.data.title || '';
            doc.text(projT, pageWidth - margin, 12, { align: 'right' });
            
            // Grande photo à gauche (70 x 95mm)
            const photoW2 = 70, photoH2 = 95;
            const photoX = margin;
            const photoY = 28;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, photoX, photoY, photoW2, photoH2);
            
            // Bloc infos à droite
            const infoX = photoX + photoW2 + 10;
            const infoWidth = usableWidth - photoW2 - 10;
            let iy = photoY + 6;
            
            // Nom XXL
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nameLines = doc.splitTextToSize(ch.name, infoWidth);
            nameLines.forEach(line => { doc.text(line, infoX, iy); iy += 8; });
            iy += 3;
            
            // Sexe
            const gender = genderLabel(ch.gender);
            if(gender) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(gender, infoX, iy);
                iy += 6;
            }
            
            // Comédien
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('INCARNÉ PAR', infoX, iy);
            iy += 4;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.text(PdfTheme.cleanText(actor ? actor.name : '(non assigné)'), infoX, iy);
            iy += 8;
            
            // Bio
            if(ch.bio) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('PORTRAIT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const bioLines = doc.splitTextToSize(ch.bio, infoWidth);
                bioLines.forEach(line => {
                    if(iy < pageHeight - 30) {
                        doc.text(line, infoX, iy);
                        iy += 4.5;
                    }
                });
            }
            
            // Section scènes en bas
            const cs = charScenes(ch);
            const bottomY = pageHeight - 50;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(`APPARAÎT DANS ${cs.length} SCÈNE${cs.length > 1 ? 'S' : ''}`, margin, bottomY);
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY + 1.5, pageWidth - margin, bottomY + 1.5);
            if(cs.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const labels = cs.map(s => sceneLabel(s)).join('  ');
                const scLines = doc.splitTextToSize(labels, usableWidth);
                let sy = bottomY + 6;
                scLines.slice(0, 4).forEach(line => {
                    doc.text(line, margin, sy);
                    sy += 4;
                });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text(`N'apparaît dans aucune scène`, margin, bottomY + 6);
            }
        };
        
        // ========= Exécution selon mode =========
        if(opts.mode === 'card') {
            // Mode fiche : 1 page A4 par perso, pas de groupes (chaque fiche est autonome)
            charsInScope.forEach((ch, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(ch);
            });
        } else {
            // Modes detailed et list : par groupes
            groupOrder.forEach((gid, gIdx) => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                
                // Saut de page si plus de place pour le bandeau + au moins 1 fiche
                y = FichesPDF._ensureSpace(doc, y, 30, pageHeight, margin);
                y = FichesPDF._drawGroupHeader(doc, groupName, y, margin, usableWidth);
                
                if(opts.mode === 'detailed') {
                    grouped[gid].forEach(ch => renderDetailed(ch));
                } else if(opts.mode === 'list') {
                    renderList(grouped[gid]);
                }
            });
        }
        
        // ========= Footer =========
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Personnages')
            : `${state.data.title || 'Projet'} - Personnages - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Personnages PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Personnages PDF généré');
    },
    
    // ============================================================
    // ===== COMÉDIENS =====
    // ============================================================
    
    openActorsModal: () => {
        const actorsAll = state.data.actors || [];
        if(actorsAll.length === 0) {
            Utils.toast('Aucun comédien à exporter', 'warning');
            return;
        }
        if(state.currentProjectType === 'series') {
            const continueToOptions = (episodeIds) => {
                const modes = [
                    { value: 'detailed', label: 'Détaillé', desc: 'Photo + contact + bio + physique + statut + compétences (1 par ligne)' },
                    { value: 'list',     label: 'Liste',    desc: '1 colonne dense : nom · personnage · email · tél' },
                    { value: 'card',     label: 'Fiche',    desc: '1 page A4 paysage par comédien (casting book : photo + tous les détails)' }
                ];
                FichesPDF._openOptionsModal('🎭', 'Comédiens PDF — Options', modes, (opts) => {
                    FichesPDF.exportActors({ ...opts, episodeIds });
                });
            };
            FichesPDF._openSeasonChooser('actors', '🎭', 'Comédiens — Choix des saisons', continueToOptions);
            return;
        }
        Actions.openExportModal('actors');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'actors');
        });
    },
    
    exportActors: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        FichesPDF._accent = PdfTheme.accentFor('Comédiens');
        // Mode card → page A4 paysage (casting book). Autres modes → portrait.
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        const isSeries = state.currentProjectType === 'series';
        
        // ========= Données =========
        const allActors = state.data.actors || [];
        const allChars = state.data.characters || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'actor');
        const allScenes = state.data.scenes || [];
        
        // Filtrage par saisons (si série) : on garde les comédiens dont le perso joué apparaît
        let scenesScope = allScenes;
        if(isSeries && opts.episodeIds && opts.episodeIds.length > 0) {
            scenesScope = allScenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        const actorsInScope = isSeries ? allActors.filter(a => {
            const linked = allChars.find(c => c.actor_id === a.id);
            if(!linked) return true; // Comédiens sans rôle assigné : on les garde
            return scenesScope.some(s => FicheLinks.sceneHasChar(s, linked));
        }) : allActors;
        
        if(actorsInScope.length === 0) {
            Utils.toast('Aucun comédien à exporter dans cette sélection', 'warning');
            return;
        }
        
        // Helpers : labels via ProfileRenderer.selectOptions
        const optLabel = (cat, val) => {
            if(!val) return '';
            const opts = (typeof ProfileRenderer !== 'undefined' && ProfileRenderer.selectOptions && ProfileRenderer.selectOptions[cat]) || [];
            const found = opts.find(o => o.value === val);
            return found ? found.label : val;
        };
        const getLinkedChar = (a) => allChars.find(c => c.actor_id === a.id) || null;
        // v580 : test par identifiant (sceneHasChar garde le nom en repli).
        const charScenes = (ch) => scenesScope.filter(s => FicheLinks.sceneHasChar(s, ch));
        const collabLabel = (c) => ({ pro: 'Pro', 'semi-pro': 'Semi-pro', benevole: 'Bénévole' }[c] || '');
        
        // Précharger toutes les photos en parallèle
        Utils.toast('Préparation des photos...', 'info');
        const urls = actorsInScope.map(a => a.photo).filter(Boolean);
        const photoMap = await FichesPDF._preloadImages(urls);
        
        // ========= Page de garde =========
        if(opts.includeCover !== false) {
            FichesPDF._drawCoverPage(doc, 'Comédiens');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Grouper =========
        const grouped = {};
        actorsInScope.forEach(a => {
            const gid = a.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(a);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        
        // ----- MODE DETAILED : 1 fiche par ligne (portrait A4) -----
        const renderDetailed = (a) => {
            const cardHeight = 56;
            y = FichesPDF._ensureSpace(doc, y, cardHeight, pageHeight, margin);
            
            const photoW = 28, photoH = 36;
            const photoUrl = a.photo ? photoMap[a.photo] : null;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, margin, y, photoW, photoH);
            
            const textX = margin + photoW + 6;
            const textWidth = usableWidth - photoW - 6;
            let ty = y + 5;
            
            // Nom (grand, gras)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(a.name || '(sans nom)', textX, ty);
            ty += 5;
            
            // Personnage joué (en italique, couleur accent)
            const linked = getLinkedChar(a);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            doc.text(linked ? 'Rôle : ' + linked.name : '— Aucun personnage attribué —', textX, ty);
            ty += 4.2;
            
            // Contact (email + tél sur une ligne, ville en dessous si présente)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            const contactBits = [];
            if(a.email) contactBits.push('Email : ' + a.email);
            if(a.phone) contactBits.push('Tél : ' + a.phone);
            if(contactBits.length > 0) {
                const contactLine = contactBits.join('   ·   ');
                const cLines = doc.splitTextToSize(contactLine, textWidth);
                cLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            if(a.city) {
                doc.text('Ville : ' + a.city, textX, ty);
                ty += 3.8;
            }
            
            // Statut pro + type collab
            const statusBits = [];
            const stat = optLabel('professionalStatus', a.professionalStatus);
            if(stat) statusBits.push(stat);
            const collab = collabLabel(a.collabType);
            if(collab) statusBits.push(collab);
            if(statusBits.length > 0) {
                doc.setTextColor(...PdfTheme.COLORS.WARNING);
                doc.text('Statut : ' + statusBits.join(' · '), textX, ty);
                ty += 3.8;
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            }
            
            // Bio (max 2 lignes)
            if(a.bio) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const bioLines = doc.splitTextToSize(a.bio, textWidth);
                bioLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.7; });
                if(bioLines.length > 2) {
                    doc.setFont('helvetica', 'italic');
                    doc.text('…', textX, ty);
                    ty += 3.7;
                }
            }
            
            // Physique compact : sexe · âge · taille · yeux · cheveux · corpulence
            const physBits = [];
            const gender = optLabel('gender', a.gender);
            if(gender && gender !== '-- Sexe --') physBits.push(gender);
            if(a.age)    physBits.push(a.age + ' ans');
            if(a.height) physBits.push(a.height + ' cm');
            const eyes = optLabel('eyeColor', a.eyeColor);
            if(eyes && !eyes.startsWith('--')) physBits.push('yeux ' + eyes.toLowerCase());
            const hairC = optLabel('hairColor', a.hairColor);
            if(hairC && !hairC.startsWith('--')) physBits.push('cheveux ' + hairC.toLowerCase());
            const corp = optLabel('corpulence', a.corpulence);
            if(corp && !corp.startsWith('--')) physBits.push(corp.toLowerCase());
            if(physBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const physLine = 'Physique : ' + physBits.join(' · ');
                const pLines = doc.splitTextToSize(physLine, textWidth);
                pLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Compétences : sports / langues
            const skillBits = [];
            if(a.sports)    skillBits.push('Sports : ' + a.sports);
            if(a.languages) skillBits.push('Langues : ' + a.languages);
            if(skillBits.length > 0) {
                doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const sLine = skillBits.join('   ·   ');
                const sLines = doc.splitTextToSize(sLine, textWidth);
                sLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Cadre autour de la fiche
            const actualHeight = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualHeight);
            
            y += actualHeight + 3;
        };
        
        // ----- MODE LIST : 1 colonne dense, nom · perso · email · tél -----
        const renderList = (actorsArr) => {
            const lineHeight = 5.5;
            actorsArr.forEach(a => {
                y = FichesPDF._ensureSpace(doc, y, lineHeight, pageHeight, margin);
                const linked = getLinkedChar(a);
                
                // Colonnes calculées
                const nameW = usableWidth * 0.28;
                const roleW = usableWidth * 0.22;
                const emailW = usableWidth * 0.30;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = a.name || '(sans nom)';
                while(doc.getTextWidth(txtName) > nameW - 2 && txtName.length > 5) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, margin, y);
                
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtRole = linked ? linked.name : '—';
                while(doc.getTextWidth(txtRole) > roleW - 2 && txtRole.length > 3) txtRole = txtRole.substring(0, txtRole.length - 2) + '…';
                doc.text(txtRole, margin + nameW, y);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtEmail = a.email || '—';
                while(doc.getTextWidth(txtEmail) > emailW - 2 && txtEmail.length > 5) txtEmail = txtEmail.substring(0, txtEmail.length - 2) + '…';
                doc.text(txtEmail, margin + nameW + roleW, y);
                
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(a.phone || '—', margin + nameW + roleW + emailW, y);
                
                // Ligne pointillée sous
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + 1.5, margin + usableWidth, y + 1.5);
                doc.setLineDashPattern([], 0);
                
                y += lineHeight;
            });
            y += 2;
        };
        
        // ----- MODE CARD : 1 page A4 PAYSAGE par comédien (casting book) -----
        const renderCard = (a) => {
            const linked = getLinkedChar(a);
            const photoUrl = a.photo ? photoMap[a.photo] : null;
            
            // Bandeau titre coloré en haut
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('COMÉDIEN·NE', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const projT = state.data.title || '';
            doc.text(projT, pageWidth - margin, 12, { align: 'right' });
            
            // Grande photo à gauche (75 x 100mm en paysage)
            const photoW2 = 75, photoH2 = 100;
            const photoX = margin;
            const photoY = 28;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, photoX, photoY, photoW2, photoH2);
            
            // Bloc infos à droite
            const infoX = photoX + photoW2 + 12;
            const infoWidth = pageWidth - infoX - margin;
            let iy = photoY + 6;
            
            // Nom XXL
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nameLines = doc.splitTextToSize(a.name || '(sans nom)', infoWidth);
            nameLines.forEach(line => { doc.text(line, infoX, iy); iy += 8; });
            iy += 2;
            
            // Rôle joué
            if(linked) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('RÔLE', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(12);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.text(linked.name, infoX, iy);
                iy += 7;
            }
            
            // Contact bloc
            const hasContact = a.email || a.phone || a.city || a.address || a.website;
            if(hasContact) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(a.email)   { doc.text('Email : ' + a.email, infoX, iy); iy += 4.2; }
                if(a.phone)   { doc.text('Tél : '   + a.phone, infoX, iy); iy += 4.2; }
                if(a.city)    { doc.text('Ville : ' + a.city,  infoX, iy); iy += 4.2; }
                if(a.website) { doc.text('Web : '   + a.website, infoX, iy); iy += 4.2; }
                if(a.address) {
                    const addrLines = doc.splitTextToSize('Adresse : ' + a.address, infoWidth);
                    addrLines.slice(0, 2).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; });
                }
                iy += 3;
            }
            
            // Statut professionnel
            const statText = optLabel('professionalStatus', a.professionalStatus);
            const collabText = collabLabel(a.collabType);
            if(statText || collabText) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('STATUT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(statText)   { doc.text(statText, infoX, iy); iy += 4.2; }
                if(collabText) { doc.text('Type : ' + collabText, infoX, iy); iy += 4.2; }
                iy += 3;
            }
            
            // Bio
            if(a.bio) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('PORTRAIT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const bioLines = doc.splitTextToSize(a.bio, infoWidth);
                bioLines.forEach(line => {
                    if(iy < pageHeight - 40) {
                        doc.text(line, infoX, iy);
                        iy += 4.3;
                    }
                });
            }
            
            // Bas de page : description physique + compétences en grille
            const bottomY = pageHeight - 38;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            
            // Colonne gauche : Physique
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('PHYSIQUE', margin, bottomY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const physLines = [];
            const gender = optLabel('gender', a.gender);
            if(gender && !gender.startsWith('--')) physLines.push('Sexe : ' + gender);
            if(a.age)    physLines.push('Âge : ' + a.age + ' ans');
            if(a.height) physLines.push('Taille : ' + a.height + ' cm');
            if(a.weight) physLines.push('Poids : ' + a.weight + ' kg');
            const eyes = optLabel('eyeColor', a.eyeColor);
            if(eyes && !eyes.startsWith('--')) physLines.push('Yeux : ' + eyes);
            const hairC2 = optLabel('hairColor', a.hairColor);
            if(hairC2 && !hairC2.startsWith('--')) physLines.push('Cheveux : ' + hairC2);
            const hairL = optLabel('hairLength', a.hairLength);
            if(hairL && !hairL.startsWith('--')) physLines.push('Longueur : ' + hairL);
            const corp2 = optLabel('corpulence', a.corpulence);
            if(corp2 && !corp2.startsWith('--')) physLines.push('Corpulence : ' + corp2);
            const eth = optLabel('ethnicity', a.ethnicity);
            if(eth && !eth.startsWith('--')) physLines.push('Origine : ' + eth);
            
            // 2 sous-colonnes pour le bloc physique (compact)
            const physColW = (pageWidth / 2 - margin - 6) / 2;
            physLines.forEach((line, i) => {
                const subCol = Math.floor(i / 4);
                const row = i % 4;
                doc.text(line, margin + subCol * physColW, bottomY + 5 + row * 4);
            });
            
            // Colonne droite : Compétences
            const rightColX = pageWidth / 2 + 5;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('COMPÉTENCES', rightColX, bottomY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            let sy = bottomY + 5;
            const skillW = pageWidth - rightColX - margin;
            if(a.sports) {
                const sLines = doc.splitTextToSize('Sports : ' + a.sports, skillW);
                sLines.slice(0, 2).forEach(l => { doc.text(l, rightColX, sy); sy += 4; });
            }
            if(a.languages) {
                const lLines = doc.splitTextToSize('Langues : ' + a.languages, skillW);
                lLines.slice(0, 2).forEach(l => { doc.text(l, rightColX, sy); sy += 4; });
            }
            if(!a.sports && !a.languages) {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('—', rightColX, sy);
            }
        };
        
        // ========= Exécution selon mode =========
        if(opts.mode === 'card') {
            // Mode fiche : 1 page A4 paysage par comédien, pas de groupes
            actorsInScope.forEach((a, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(a);
            });
        } else {
            // Modes detailed et list : par groupes
            groupOrder.forEach((gid) => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                
                y = FichesPDF._ensureSpace(doc, y, 30, pageHeight, margin);
                y = FichesPDF._drawGroupHeader(doc, groupName, y, margin, usableWidth);
                
                if(opts.mode === 'detailed') {
                    grouped[gid].forEach(a => renderDetailed(a));
                } else if(opts.mode === 'list') {
                    renderList(grouped[gid]);
                }
            });
        }
        
        // ========= Footer =========
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Comédiens')
            : `${state.data.title || 'Projet'} - Comédiens - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Comédiens PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Comédiens PDF généré');
    },
    
    // ============================================================
    // ===== LIEUX =====
    // ============================================================
    
    openLocationsModal: () => {
        const locsAll = state.data.locations || [];
        if(locsAll.length === 0) {
            Utils.toast('Aucun décor à exporter', 'warning');
            return;
        }
        if(state.currentProjectType === 'series') {
            const continueToOptions = (episodeIds) => {
                const modes = [
                    { value: 'detailed', label: 'Détaillé', desc: '1 par ligne : vignette + adresse + contact + scènes' },
                    { value: 'list',     label: 'Liste',    desc: '1 colonne dense : nom · lieu réel · ville · nb scènes' },
                    { value: 'card',     label: 'Fiche',    desc: '1 page A4 paysage par décor + planche-contact des photos' }
                ];
                FichesPDF._openOptionsModal('🏠', 'Décors PDF — Options', modes, (opts) => {
                    FichesPDF.exportLocations({ ...opts, episodeIds });
                });
            };
            FichesPDF._openSeasonChooser('locs', '🏠', 'Décors — Choix des saisons', continueToOptions);
            return;
        }
        Actions.openExportModal('locs');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'locs');
        });
    },
    
    exportLocations: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        FichesPDF._accent = PdfTheme.accentFor('Décors');
        // Mode card → page A4 paysage. Autres modes → portrait.
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        const isSeries = state.currentProjectType === 'series';
        
        // ========= Données =========
        const allLocs = state.data.locations || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'lieu');
        const allScenes = state.data.scenes || [];
        
        // Filtrage par saisons (si série)
        let scenesScope = allScenes;
        if(isSeries && opts.episodeIds && opts.episodeIds.length > 0) {
            scenesScope = allScenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        // Helper : scènes tournées dans un lieu (matche le titre INT./EXT. NOM)
        const locationScenes = (loc, scenePool) => scenePool.filter(s => {
            if(!s.title) return false;
            const m = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
            if(m && m[1]) return m[1].trim().toUpperCase() === (loc.name || '').toUpperCase();
            return false;
        });
        
        // Filtrer lieux : si série filtrée, ne garder que ceux qui ont au moins 1 scène dans le scope
        const locsInScope = isSeries && opts.episodeIds && opts.episodeIds.length > 0
            ? allLocs.filter(loc => locationScenes(loc, scenesScope).length > 0)
            : allLocs;
        
        if(locsInScope.length === 0) {
            Utils.toast('Aucun décor à exporter dans cette sélection', 'warning');
            return;
        }
        
        // Helper : label scène avec notation série S01E01-SC01 si série
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
        
        // Précharger toutes les photos en parallèle (1ère photo pour detailed, toutes pour card)
        Utils.toast('Préparation des photos...', 'info');
        const allUrls = [];
        locsInScope.forEach(loc => {
            const photos = loc.galleryPhotos || [];
            if(opts.mode === 'card') {
                photos.forEach(u => allUrls.push(u));
            } else if(opts.mode === 'detailed') {
                if(photos[0]) allUrls.push(photos[0]);
            }
        });
        const photoMap = await FichesPDF._preloadImages(allUrls);
        
        // ========= Page de garde =========
        if(opts.includeCover !== false) {
            FichesPDF._drawCoverPage(doc, 'Décors');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Grouper =========
        const grouped = {};
        locsInScope.forEach(loc => {
            const gid = loc.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(loc);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        
        // ----- MODE DETAILED : 1 fiche par ligne (portrait A4) -----
        const renderDetailed = (loc) => {
            const cardHeight = 50;
            y = FichesPDF._ensureSpace(doc, y, cardHeight, pageHeight, margin);
            
            // Vignette paysage 38x28mm (1ère photo de la galerie)
            const photoW = 38, photoH = 28;
            const photos = loc.galleryPhotos || [];
            const photoUrl = photos[0] ? photoMap[photos[0]] : null;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, margin, y, photoW, photoH);
            
            const textX = margin + photoW + 6;
            const textWidth = usableWidth - photoW - 6;
            let ty = y + 5;
            
            // Nom (grand, gras)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(PdfTheme.cleanText(loc.name || '(sans nom)'), textX, ty);
            ty += 5;
            
            // Lieu réel (en italique) si différent du nom scénaristique
            if(loc.realName) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(PdfTheme.cleanText('Lieu réel : ' + loc.realName), textX, ty);
                ty += 4.2;
            }
            
            // Adresse
            if(loc.address) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const addrLines = doc.splitTextToSize('Adresse : ' + loc.address, textWidth);
                addrLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            
            // Contact (nom + tél sur une ligne)
            const contactBits = [];
            if(loc.contactName)  contactBits.push('Contact : ' + loc.contactName);
            if(loc.contactPhone) contactBits.push('Tél : ' + loc.contactPhone);
            if(contactBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const cLine = PdfTheme.cleanText(contactBits.join('   ·   '));
                const cLines = doc.splitTextToSize(cLine, textWidth);
                cLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            
            // Notes d'accès (max 2 lignes)
            if(loc.accessNotes) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.WARNING);
                const accLines = doc.splitTextToSize(PdfTheme.cleanText('Accès : ' + loc.accessNotes), textWidth);
                accLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Logistique de tournage (une ligne compacte, max 2 lignes)
            const logiBits = [];
            if(loc.rdvFiguration) logiBits.push('Rdv figuration : ' + loc.rdvFiguration);
            if(loc.hmcPlace)      logiBits.push('HMC : ' + loc.hmcPlace);
            if(loc.prodOffice)    logiBits.push('Bureau prod : ' + loc.prodOffice);
            if(loc.techParking)   logiBits.push('Stat. technique : ' + loc.techParking);
            if(loc.persoParking)  logiBits.push('Stat. perso : ' + loc.persoParking);
            if(logiBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const lgLines = doc.splitTextToSize(PdfTheme.cleanText(logiBits.join('   -   ')), textWidth);
                lgLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Scènes
            const sList = locationScenes(loc, scenesScope);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            if(sList.length > 0) {
                const labels = sList.map(s => sceneLabel(s)).join('  ');
                const sceneText = `Scènes tournées (${sList.length}) : ${labels}`;
                const scLines = doc.splitTextToSize(sceneText, textWidth);
                scLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('Aucune scène dans ce décor', textX, ty);
                ty += 3.5;
            }
            
            // Badge "X photos disponibles" en haut à droite si galerie non vide
            if(photos.length > 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                const photoBadge = photos.length === 1 ? '1 photo' : `${photos.length} photos`;
                doc.text(photoBadge, margin + usableWidth, y + 4, { align: 'right' });
            }
            
            // Cadre autour de la fiche
            const actualHeight = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualHeight);
            
            y += actualHeight + 3;
        };
        
        // ----- MODE LIST : 1 colonne dense -----
        const renderList = (locsArr) => {
            const lineHeight = 5.5;
            // Colonnes : nom (28%) · realName (32%) · adresse courte (28%) · nb scènes (12%)
            const nameW = usableWidth * 0.28;
            const realW = usableWidth * 0.32;
            const addrW = usableWidth * 0.28;
            
            // En-tête de colonnes
            y = FichesPDF._ensureSpace(doc, y, lineHeight + 2, pageHeight, margin);
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, y - 4, usableWidth, 6, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('DÉCOR', margin + 1, y);
            doc.text('LIEU RÉEL', margin + nameW + 1, y);
            doc.text('ADRESSE', margin + nameW + realW + 1, y);
            doc.text('SCÈNES', margin + usableWidth - 1, y, { align: 'right' });
            y += 6;
            
            locsArr.forEach(loc => {
                y = FichesPDF._ensureSpace(doc, y, lineHeight, pageHeight, margin);
                const sList = locationScenes(loc, scenesScope);
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = loc.name || '(sans nom)';
                while(doc.getTextWidth(txtName) > nameW - 5 && txtName.length > 5) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, margin, y);
                
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtReal = loc.realName || '—';
                while(doc.getTextWidth(txtReal) > realW - 5 && txtReal.length > 3) txtReal = txtReal.substring(0, txtReal.length - 2) + '…';
                doc.text(txtReal, margin + nameW, y);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtAddr = loc.address || '—';
                while(doc.getTextWidth(txtAddr) > addrW - 5 && txtAddr.length > 5) txtAddr = txtAddr.substring(0, txtAddr.length - 2) + '…';
                doc.text(txtAddr, margin + nameW + realW, y);
                
                doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                doc.text(`${sList.length} sc.`, margin + usableWidth, y, { align: 'right' });
                
                // Ligne pointillée sous
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + 1.5, margin + usableWidth, y + 1.5);
                doc.setLineDashPattern([], 0);
                
                y += lineHeight;
            });
            y += 2;
        };
        
        // ----- MODE CARD : 1 page A4 paysage par décor + pages photos -----
        // Page principale = grande photo gauche + grid infos droite
        // Pages galerie suivantes = 2x2 = 4 photos par page paysage si galerie > 1
        const renderCard = (loc) => {
            const photos = loc.galleryPhotos || [];
            const coverPhotoUrl = photos[0] ? photoMap[photos[0]] : null;
            
            // ===== PAGE 1 : Page principale =====
            // Bandeau titre coloré en haut
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('DÉCOR', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const projT = state.data.title || '';
            doc.text(projT, pageWidth - margin, 12, { align: 'right' });
            
            // Grande photo de couverture à gauche (110 x 80mm en paysage)
            const photoW2 = 110, photoH2 = 80;
            const photoX = margin;
            const photoY = 28;
            FichesPDF._drawPhotoOrPlaceholder(doc, coverPhotoUrl, photoX, photoY, photoW2, photoH2);
            
            // Bloc infos à droite
            const infoX = photoX + photoW2 + 12;
            const infoWidth = pageWidth - infoX - margin;
            let iy = photoY + 6;
            
            // Nom XXL
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nameLines = doc.splitTextToSize(loc.name || '(sans nom)', infoWidth);
            nameLines.forEach(line => { doc.text(line, infoX, iy); iy += 7.5; });
            iy += 2;
            
            // Lieu réel
            if(loc.realName) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(11);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                const rLines = doc.splitTextToSize(loc.realName, infoWidth);
                rLines.forEach(line => { doc.text(line, infoX, iy); iy += 5; });
                iy += 3;
            }
            
            // Adresse
            if(loc.address) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('ADRESSE', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const aLines = doc.splitTextToSize(loc.address, infoWidth);
                aLines.forEach(line => { doc.text(line, infoX, iy); iy += 4.2; });
                iy += 3;
            }
            
            // Contact
            if(loc.contactName || loc.contactPhone) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT SUR PLACE', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(loc.contactName)  { doc.text(PdfTheme.cleanText('Nom : ' + loc.contactName), infoX, iy); iy += 4.2; }
                if(loc.contactPhone) { doc.text(PdfTheme.cleanText('Tél : ' + loc.contactPhone), infoX, iy); iy += 4.2; }
                iy += 3;
            }
            
            // Notes d'accès
            if(loc.accessNotes) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('ACCÈS', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const accLines = doc.splitTextToSize(loc.accessNotes, infoWidth);
                accLines.forEach(line => {
                    if(iy < pageHeight - 50) {
                        doc.text(line, infoX, iy); iy += 4;
                    }
                });
                iy += 3;
            }
            
            // Description scénaristique
            if(loc.desc) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('DESCRIPTION', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const dLines = doc.splitTextToSize(loc.desc, infoWidth);
                dLines.forEach(line => {
                    if(iy < pageHeight - 50) {
                        doc.text(line, infoX, iy); iy += 4;
                    }
                });
            }
            
            // Bas de page : scènes tournées
            const sList = locationScenes(loc, scenesScope);
            const bottomY = pageHeight - 32;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(`SCÈNES TOURNÉES DANS CE DÉCOR (${sList.length})`, margin, bottomY);
            if(sList.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const labels = sList.map(s => sceneLabel(s)).join('   ·   ');
                const scLines = doc.splitTextToSize(labels, pageWidth - margin * 2);
                let sy = bottomY + 5;
                scLines.slice(0, 3).forEach(line => {
                    doc.text(line, margin, sy);
                    sy += 4;
                });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('Aucune scène dans ce décor', margin, bottomY + 5);
            }
            
            // ===== PAGES GALERIE : planche-contact 2x2 si galerie > 1 =====
            // (la 1ère photo est déjà en couverture page principale, on inclut quand même toutes les photos en planche pour cohérence)
            if(photos.length > 0) {
                const photosPerPage = 4; // 2x2 grid
                const pageCount = Math.ceil(photos.length / photosPerPage);
                
                for(let pi = 0; pi < pageCount; pi++) {
                    doc.addPage();
                    
                    // Bandeau galerie
                    doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
                    doc.rect(0, 0, pageWidth, 18, 'F');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(...PdfTheme.COLORS.WHITE);
                    doc.text(PdfTheme.cleanText('PHOTOS — ' + (loc.name || '(sans nom)')), margin, 12);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.text(`Planche ${pi + 1}/${pageCount}`, pageWidth - margin, 12, { align: 'right' });
                    
                    // Grille 2x2
                    const gridStartY = 26;
                    const gridGap = 6;
                    const cellW = (pageWidth - margin * 2 - gridGap) / 2;
                    const cellH = (pageHeight - gridStartY - margin - gridGap) / 2;
                    
                    for(let i = 0; i < photosPerPage; i++) {
                        const photoIdx = pi * photosPerPage + i;
                        if(photoIdx >= photos.length) break;
                        const url = photos[photoIdx];
                        const dataUrl = photoMap[url];
                        const col = i % 2;
                        const row = Math.floor(i / 2);
                        const cx = margin + col * (cellW + gridGap);
                        const cy = gridStartY + row * (cellH + gridGap);
                        FichesPDF._drawPhotoOrPlaceholder(doc, dataUrl, cx, cy, cellW, cellH);
                        // Numéro de la photo en bas-droit de la cellule
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                        doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                        doc.text(`Photo ${photoIdx + 1}/${photos.length}`, cx + cellW - 2, cy + cellH - 2, { align: 'right' });
                    }
                }
            }
        };
        
        // ========= Exécution selon mode =========
        if(opts.mode === 'card') {
            // Mode fiche : 1 page A4 paysage par décor + pages photos, pas de groupes
            locsInScope.forEach((loc, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(loc);
            });
        } else {
            // Modes detailed et list : par groupes
            groupOrder.forEach((gid) => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                
                y = FichesPDF._ensureSpace(doc, y, 30, pageHeight, margin);
                y = FichesPDF._drawGroupHeader(doc, groupName, y, margin, usableWidth);
                
                if(opts.mode === 'detailed') {
                    grouped[gid].forEach(loc => renderDetailed(loc));
                } else if(opts.mode === 'list') {
                    renderList(grouped[gid]);
                }
            });
        }
        
        // ========= Footer =========
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Décors')
            : `${state.data.title || 'Projet'} - Décors - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Décors PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Décors PDF généré');
    }
};
