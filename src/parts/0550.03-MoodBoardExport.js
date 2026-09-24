
const MoodBoardExport = {
    exportPNG: async () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) {
            Utils.toast('Aucune planche sélectionnée', 'warning');
            return;
        }
        
        Utils.toast('Génération du PNG en cours...', 'info');
        
        const canvasW = board.canvasWidth || 1200;
        const canvasH = board.canvasHeight || 800;
        const scale = 2;
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasW * scale;
        canvas.height = canvasH * scale;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        
        const elements = board.elements || [];
        
        // Préparer les images (images, dessins ET formes SVG)
        const imagesToLoad = [];
        elements.forEach(el => {
            if((el.type === 'image' || el.type === 'drawing') && el.src) {
                imagesToLoad.push({ el, type: 'image' });
            } else if(el.type === 'shape') {
                imagesToLoad.push({ el, type: 'shape' });
            }
        });
        
        // Charger toutes les images et convertir les SVG
        for(const item of imagesToLoad) {
            if(item.type === 'image') {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise(resolve => {
                    img.onload = () => { item.el.imgLoaded = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = Utils.signedUrlFor(item.el.src);
                });
            } else if(item.type === 'shape') {
                const shape = MoodBoard.shapes.find(s => s.id === item.el.shapeId);
                if(shape) {
                    const w = item.el.width || 100;
                    const h = item.el.height || 100;
                    item.el.shapeImg = await MoodBoard.svgToImage(shape.svg, item.el.color || '#000000', w * scale, h * scale);
                }
            }
        }
        
        // Dessiner tous les éléments
        elements.forEach(el => {
            const x = el.x || 0;
            const y = el.y || 0;
            const w = el.width || 100;
            const h = el.height || 100;
            
            ctx.save();
            
            if(el.rotation) {
                ctx.translate(x + w/2, y + h/2);
                ctx.rotate(el.rotation * Math.PI / 180);
                ctx.translate(-(x + w/2), -(y + h/2));
            }
            
            if(el.type === 'image' || el.type === 'drawing') {
                if(el.imgLoaded) ctx.drawImage(el.imgLoaded, x, y, w, h);
            } else if(el.type === 'text') {
                ctx.fillStyle = el.textColor || el.color || '#333333';
                ctx.font = `${el.bold ? 'bold ' : ''}${el.fontSize || 14}px ${el.fontFamily || 'Arial'}`;
                ctx.textAlign = el.textAlign || el.align || 'left';
                const lines = (el.content || '').split('\n');
                lines.forEach((line, i) => {
                    ctx.fillText(line, x + 5, y + 20 + (i * (el.fontSize || 14) * 1.2));
                });
            } else if(el.type === 'palette') {
                const colors = el.colors || [];
                const colorW = w / Math.max(colors.length, 1);
                colors.forEach((color, i) => {
                    ctx.fillStyle = color;
                    ctx.fillRect(x + (i * colorW), y, colorW, h * 0.7);
                    ctx.fillStyle = '#333';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(color, x + (i * colorW) + colorW/2, y + h * 0.9);
                });
                if(el.paletteName) {
                    ctx.fillStyle = '#666';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(el.paletteName, x, y - 5);
                }
            } else if(el.type === 'shape') {
                if(el.shapeImg) {
                    ctx.drawImage(el.shapeImg, x, y, w, h);
                } else {
                    ctx.fillStyle = el.color || '#000000';
                    ctx.fillRect(x, y, w, h);
                }
            } else if(el.type === 'link') {
                ctx.fillStyle = '#f0f0f0';
                ctx.strokeStyle = '#ccc';
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = '#2b6ef6';
                ctx.font = '12px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('🔗 ' + (el.url || 'Lien').substring(0, 30), x + 5, y + h/2 + 4);
            }
            
            ctx.restore();
        });
        
        // Nom de fichier explicite
        const projectTitle = state.data?.title || 'Projet';
        const boardName = board.name || 'MoodBoard';
        const filename = `${projectTitle}_MoodBoard_${boardName}`.replace(/[^a-z0-9àâäéèêëïîôùûüç_-]/gi, '_') + '.png';
        
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        Utils.toast('PNG exporté !', 'success');
        History.log('EXPORT', `MoodBoard "${board.name}" exporté en PNG`);
    },
    
    exportPDF: async (opts = {}) => {
        // [Phase D refonte v2] Export MoodBoard par rasterisation HORS-ÉCRAN
        // - Marche depuis n'importe quel onglet
        // - Toutes les planches du projet, même non affichées
        // - Crée un canvas invisible (-99999px), rasterise, supprime
        
        let allBoards = state.data.moodboards || [];
        if(opts.boardIds && opts.boardIds.length) allBoards = allBoards.filter(b => opts.boardIds.includes(b.id));
        if(allBoards.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucune planche disponible', 'warning');
            return;
        }
        
        if(!opts.returnBlob) Utils.toast('Génération du PDF MoodBoard...', 'info');
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        if(typeof html2canvas === 'undefined') {
            Utils.toast('html2canvas non chargé', 'error');
            return;
        }
        const projectTitle = state.data.title || 'Projet';
        const cleanT = (t) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');
        
        // ===== 1. Créer un canvas HORS-ÉCRAN (invisible à l'utilisateur) =====
        // Ce bloc div est positionné à -99999px : invisible, mais dans le DOM
        // donc html2canvas peut le rasteriser. Il sera supprimé après l'export.
        const canvasEl = document.createElement('div');
        canvasEl.id = 'moodboardCanvasOffscreen';
        canvasEl.className = 'moodboard-canvas';
        canvasEl.style.position = 'absolute';
        canvasEl.style.left = '-99999px';
        canvasEl.style.top = '0';
        canvasEl.style.pointerEvents = 'none';
        canvasEl.style.zIndex = '-9999';
        document.body.appendChild(canvasEl);
        
        // Dimensions exactes selon le format de planche (cohérent avec le CSS)
        const formatDimensions = MoodBoard.FORMATS;
        
        // ===== 2. Créer le PDF =====
        let doc = null;
        const A4 = { w: 210, h: 297 }; // mm
        
        try {
            // Pour chaque planche du projet : générer une page
            for(let bi = 0; bi < allBoards.length; bi++) {
                const board = allBoards[bi];
                const format = board.format || 'free';
                const dims = formatDimensions[format] || formatDimensions['free'];
                
                // Configurer le canvas hors-écran pour cette planche
                canvasEl.className = 'moodboard-canvas format-' + format;
                canvasEl.style.width = dims.w + 'px';
                canvasEl.style.height = dims.h + 'px';
                canvasEl.style.background = 'white';
                
                // Rendre les éléments de la planche dedans
                const elements = board.elements || [];
                canvasEl.innerHTML = elements.map(el => MoodBoard.renderElement(el)).join('');
                
                // Attendre le rendu et le chargement des images
                await new Promise(r => setTimeout(r, 300));
                const imgs = canvasEl.querySelectorAll('img');
                await Promise.all(Array.from(imgs).map(img => {
                    if(img.complete && img.naturalWidth > 0) return Promise.resolve();
                    return new Promise(resolve => {
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                        setTimeout(() => resolve(), 5000);
                    });
                }));
                await new Promise(r => setTimeout(r, 150));
                
                // ===== 3. Calculer la bounding box du contenu =====
                let captureRect;
                if(elements.length === 0) {
                    captureRect = { x: 0, y: 0, w: 600, h: 400 };
                } else if(format !== 'free') {
                    // Format fixe (a4, a3, a2 portrait/landscape) : capturer toute la planche
                    captureRect = { x: 0, y: 0, w: dims.w, h: dims.h };
                } else {
                    // Mode free : bounding box des éléments + marge
                    let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
                    elements.forEach(el => {
                        const x = el.x || 0;
                        const y = el.y || 0;
                        const w = el.width || 100;
                        const h = el.height || 100;
                        if(x < bx1) bx1 = x;
                        if(y < by1) by1 = y;
                        if(x + w > bx2) bx2 = x + w;
                        if(y + h > by2) by2 = y + h;
                    });
                    const m = 50;
                    captureRect = {
                        x: Math.max(0, bx1 - m),
                        y: Math.max(0, by1 - m),
                        w: Math.min(dims.w, (bx2 - bx1) + m * 2),
                        h: Math.min(dims.h, (by2 - by1) + m * 2)
                    };
                }
                
                // ===== 4. Rasteriser avec html2canvas =====
                let dataUrl = null;
                try {
                    const rendered = await html2canvas(canvasEl, {
                        x: captureRect.x,
                        y: captureRect.y,
                        width: captureRect.w,
                        height: captureRect.h,
                        scale: 1.5,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    dataUrl = rendered.toDataURL('image/jpeg', 0.85);
                } catch(err) {
                    console.warn('[MoodBoard PDF] html2canvas fail planche', board.name, err);
                    continue; // skip cette planche
                }
                
                if(!dataUrl) continue;
                
                // ===== 5. Déterminer l'orientation A4 selon le ratio =====
                const ratio = captureRect.w / captureRect.h;
                const orientation = ratio > 1 ? 'landscape' : 'portrait';
                const pageW = orientation === 'landscape' ? A4.h : A4.w;
                const pageH = orientation === 'landscape' ? A4.w : A4.h;
                
                // Créer le PDF avec la 1ère page (ou ajouter une nouvelle)
                if(!doc) {
                    // IMPORTANT : on crée TOUJOURS le doc en portrait pour la page de garde,
                    // peu importe l'orientation de la 1ère planche. La cover doit rester
                    // portrait pour ne pas être tournée 270° par la phase 7quater du Dossier.
                    doc = new jsPDF('p', 'mm', 'a4');
                    // Page de garde optionnelle (toujours en portrait)
                    if(opts.includeCover !== false && typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
                        PdfTheme.coverPage(doc, { sectionName: 'Mood Board' });
                        // Puis ajouter la 1ère vraie page selon l'orientation de la planche
                        doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                    } else {
                        // Pas de cover : il faut quand même créer la 1ère page dans la bonne orientation
                        // jsPDF a déjà créé une page portrait par défaut. Si la planche est paysage,
                        // on doit SUPPRIMER cette page portrait et ajouter une page paysage à la place.
                        if(orientation === 'landscape') {
                            doc.deletePage(1);
                            doc.addPage([A4.h, A4.w], 'landscape');
                        }
                    }
                } else {
                    doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                }
                
                // ===== 6. En-tête de page (bandeau gris) =====
                // Pages PORTRAIT : bandeau horizontal en haut (y=margin)
                // Pages PAYSAGE (tournées 270° dans le Dossier) : bandeau vertical sur le bord GAUCHE
                // logique (= bord HAUT visuel après rotation), texte tourné 270° pour rester lisible.
                const margin = 8;
                const headerH = 9; // épaisseur du bandeau en mm
                const footerZone = (typeof PdfTheme !== 'undefined' && PdfTheme.FOOTER_ZONE_MM) ? PdfTheme.FOOTER_ZONE_MM : 14;
                const isLandscape = orientation === 'landscape';
                
                const accentMB = PdfTheme.accentFor('Mood Board');
                
                let headerStartLogical; // marge effective côté "haut" logique de l'image
                
                if(!isLandscape) {
                    // PORTRAIT : titre horizontal en haut — meme porte que partout
                    // ailleurs depuis v601. Le bandeau plein ne servait pas a
                    // contraster avec l'image : il est pose dans la MARGE, sur du
                    // papier blanc, l'image commence en dessous.
                    const headerY = margin;
                    PdfTheme.sectionBand(doc, { x: margin, y: headerY, width: pageW - margin * 2,
                                                title: board.name || 'MoodBoard',
                                                right: projectTitle, accent: accentMB });
                    headerStartLogical = headerY + headerH + 3; // bas du bandeau (utilisé pour l'imgY)
                } else {
                    // PAYSAGE : bandeau VERTICAL sur le bord DROIT logique
                    // (= bord HAUT visuel après rotation 270° par phase 7quater)
                    // Note : on évite quand même la zone footer-rotationné (côté gauche logique)
                    // qui est à x=0..14mm, donc on positionne le bandeau loin de ça (côté droit).
                    const headerX = pageW - margin - headerH; // côté droit logique
                    // MEME DESSIN QUE LE TITRE HORIZONTAL, TOURNE D'UN QUART DE
                    // TOUR (v601). En paysage la page entiere est pivotee de 270°
                    // a la fin : le sens de lecture suit donc +y, et non +x.
                    // Ce qui etait « large de 2,4 et haut de 7,4 » devient donc
                    // « haut de 2,4 et large de 7,4 », et le filet passe du
                    // dessous du titre au cote interieur de la bande.
                    doc.setFillColor(...accentMB);
                    doc.rect(headerX + 1.2, margin, 7.4, 2.4, 'F');
                    doc.setDrawColor(...PdfTheme.tint(accentMB, 0.55));
                    doc.setLineWidth(0.4);
                    doc.line(headerX + 0.4, margin, headerX + 0.4, pageH - margin);
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                    
                    // Texte tourné 270° pour être lisible après rotation 270° de la page entière
                    // Avec angle:270, le texte s'étire vers le BAS depuis le point d'ancrage (x,y).
                    // Sur le bord droit logique = bord haut visuel après rotation :
                    //   - haut logique (y proche de ph) → côté GAUCHE visuel après rotation
                    //   - bas logique (y proche de 0)   → côté DROIT visuel après rotation
                    // Avec setRotation(degrees(270)), la transformation est :
                    //   bord HAUT logique  (y proche de ph) → bord DROIT visuel
                    //   bord BAS logique   (y proche de 0)  → bord GAUCHE visuel
                    // Avec angle:270 sur le texte, il s'étire vers le BAS logique depuis le point d'ancrage.
                    
                    // Le centrage vertical du texte dans le bandeau (axe X logique sur paysage)
                    // diffère du portrait à cause de l'inversion baseline/rotation. On utilise
                    // un offset empirique pour aligner le centre du glyphe sur le centre du bandeau.
                    // headerH=9, centre du bandeau = headerX + 4.5. Avec angle:270 et baseline en bas,
                    // on ajoute environ +2.7 pour positionner le glyphe centré.
                    const textOffset = 2.7;
                    
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    // Nom de la planche : visuellement à GAUCHE en haut visuel = côté BAS logique
                    const nameStr = cleanT(board.name || 'MoodBoard');
                    doc.text(nameStr, headerX + textOffset + 2.2, margin + 5.4, { angle: 270 });
                    
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                    // Titre projet : visuellement à DROITE en haut visuel = côté HAUT logique
                    const projTitleStr = cleanT(projectTitle);
                    const projTitleW = doc.getTextWidth(projTitleStr);
                    doc.text(projTitleStr, headerX + textOffset + 2.2, pageH - margin - 4 - projTitleW, { angle: 270 });
                    // L'image démarre à margin (côté gauche logique) et finit AVANT le bandeau
                    headerStartLogical = headerX;
                }
                
                // ===== 7. Insérer l'image rasterisée =====
                // PORTRAIT : zone utile = entre headerBottom et footerZone (axe vertical)
                // PAYSAGE  : zone utile = entre headerStartLogical (axe X) et footerZone (axe X)
                let availW, availH, imgX, imgY;
                if(!isLandscape) {
                    availW = pageW - margin * 2;
                    availH = pageH - headerStartLogical - footerZone;
                    let imgW = availW;
                    let imgH = imgW / ratio;
                    if(imgH > availH) { imgH = availH; imgW = imgH * ratio; }
                    imgX = (pageW - imgW) / 2;
                    imgY = headerStartLogical + ((availH - imgH) / 2);
                    try {
                        doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                    } catch(err) {
                        console.warn('[MoodBoard PDF] addImage fail:', err);
                    }
                } else {
                    // Paysage : le bandeau est à droite logique (sur la plage [headerStartLogical, pageW-margin])
                    // L'image doit donc occuper la zone à GAUCHE du bandeau, soit [footerZone, headerStartLogical-3]
                    // (en respectant la zone footer-rotationné à gauche).
                    const leftBound = footerZone; // zone footer-rotationné à gauche
                    availW = headerStartLogical - 3 - leftBound;
                    availH = pageH - margin * 2;
                    let imgW = availW;
                    let imgH = imgW / ratio;
                    if(imgH > availH) { imgH = availH; imgW = imgH * ratio; }
                    imgX = leftBound + ((availW - imgW) / 2);
                    imgY = (pageH - imgH) / 2;
                    try {
                        doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                    } catch(err) {
                        console.warn('[MoodBoard PDF] addImage fail:', err);
                    }
                }
                
                // Footer ad-hoc supprimé : géré uniformément par PdfTheme.applyFooters en fin d'export
            }
        } finally {
            // ===== 9. Supprimer le canvas hors-écran =====
            try { document.body.removeChild(canvasEl); } catch(e) {}
        }
        
        if(!doc) {
            if(!opts.returnBlob) Utils.toast('Echec generation MoodBoard PDF', 'error');
            return;
        }
        
        // ===== Footer unifié sur toutes les pages =====
        // En mode Dossier (returnBlob), on ne dessine RIEN ici. La pagination
        // globale sera ajoutée par buildDossierProd phase 7ter.
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { 
                skipFirstPage: opts.includeCover !== false,
                forDossier: !!opts.returnBlob
            });
        }
        
        // ===== 10. Téléchargement / blob =====
        // Pour returnBlob (mode Dossier de Production), la rotation paysage est
        // déjà gérée par buildDossierProd phase 7quater. On renvoie sans rotation.
        if(opts.returnBlob) return doc.output('blob');
        
        // En export solo : tourner les pages paysage 270° pour cohérence avec le Dossier
        let outBlob = doc.output('blob');
        if(typeof PdfTheme !== 'undefined' && PdfTheme.rotateLandscapePages) {
            outBlob = await PdfTheme.rotateLandscapePages(outBlob);
        }
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Mood Board')
            : `${cleanT(projectTitle) || 'Projet'} - Mood Board - moteur.studio.pdf`;
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Utils.toast(`Mood Board exporte ! (${allBoards.length} planche(s))`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `MoodBoard PDF généré (${allBoards.length} planches)`);
    },
};
