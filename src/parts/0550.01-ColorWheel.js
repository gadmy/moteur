
// ============ MOOD BOARD MODULE ============
const ColorWheel = {
    // ===================== ÉTAT & HARMONIES =====================
    canvas: null,
    ctx: null,
    size: 280,
    centerX: 140,
    centerY: 140,
    radius: 130,
    baseHue: 0,
    baseSaturation: 100,
    brightness: 50,
    harmony: 'analogous',
    colors: [],
    isDragging: false,
    onComplete: null,
    
    harmonies: {
        analogous: { name: 'Semblable', angles: [-30, -15, 0, 15, 30], saturations: null },
        shades: { name: 'Nuances', angles: [0, 0, 0, 0, 0], saturations: [100, 75, 50, 25, 10], lightnesses: [25, 35, 50, 65, 80] },
        complementary: { name: 'Complémentaire', angles: [0, 15, 180, 165, 195], saturations: [100, 60, 100, 70, 70] },
        splitComplementary: { name: 'Compl. partagées', angles: [0, 10, 150, 180, 210], saturations: null },
        triadic: { name: 'Triade', angles: [0, 120, 240, 10, 130], saturations: [100, 100, 100, 60, 60] },
        tetradic: { name: 'Carré', angles: [0, 90, 180, 270, 45], saturations: null },
        compound: { name: 'Composite', angles: [0, 30, 60, 180, 210], saturations: null },
        monochromatic: { name: 'Monochrome', angles: [0, 0, 0, 0, 0], saturations: [100, 80, 60, 40, 20] }
    },
    
    existingName: null,
    
    // ===================== OUVERTURE & ROUE =====================
    hexToHsl: (hex) => {
        // Convertir hex en RGB puis HSL
        let r = 0, g = 0, b = 0;
        if(hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if(hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if(max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    },
    
    open: (callback, existingColors = null, existingName = null, photoOpts = null) => {
        ColorWheel.onComplete = callback;
        ColorWheel.existingName = existingName;
        ColorWheel.photoOpts = photoOpts;
        
        // Si des couleurs existantes sont fournies, extraire la teinte de base
        if(existingColors && existingColors.length > 0) {
            const hsl = ColorWheel.hexToHsl(existingColors[0]);
            ColorWheel.baseHue = hsl.h;
            ColorWheel.baseSaturation = hsl.s;
            // La roue se dessine a une seule luminosite constante : une valeur
            // trop proche de 0 ou 100 la rend illisible (noire ou blanche),
            // meme si la couleur extraite elle-meme est tres sombre/claire.
            ColorWheel.brightness = Math.max(20, Math.min(80, hsl.l));
        } else {
            ColorWheel.baseHue = Math.random() * 360;
            ColorWheel.baseSaturation = 100;
            ColorWheel.brightness = 50;
        }
        ColorWheel.harmony = 'analogous';
        
        const modal = document.createElement('div');
        modal.className = 'color-wheel-modal';
        modal.id = 'colorWheelModal';
        modal.onclick = (e) => { if(e.target === modal) ColorWheel.close(); };
        
        const photoColumnHtml = photoOpts ? `
                    <div class="color-wheel-photo">
                        <div class="pe-photo-wrap" id="cwPhotoWrap" onmousemove="ColorWheel.magnifyPhoto(event)" onmouseleave="ColorWheel.resetPhotoZoom()">
                            <div class="pe-photo-inner" id="cwPhotoInner">
                                <img src="${photoOpts.photoSrc}" alt="" draggable="false">
                            </div>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-sec); margin-top:8px; text-align:center;">Glisse un point sur la photo pour ajuster sa couleur.</div>
                    </div>` : '';
        
        modal.innerHTML = `
            <div class="color-wheel-container"${photoOpts ? ' style="max-width:960px;"' : ''}>
                <div class="color-wheel-header">
                    <h3>🎨 ${photoOpts ? 'Extraire une palette' : 'Générateur de palette'}</h3>
                    <button class="color-wheel-close" onclick="ColorWheel.close()">✕</button>
                </div>
                <div class="color-wheel-body">
                    <div class="color-wheel-left">
                        <div class="color-wheel-canvas-wrap" id="colorWheelWrap">
                            <canvas id="colorWheelCanvas" width="280" height="280"></canvas>
                        </div>
                        <div class="harmony-selector">
                            <label>Type d'harmonie</label>
                            <select id="harmonySelect" onchange="ColorWheel.setHarmony(this.value)">
                                <option value="analogous">Semblable (Analogues)</option>
                                <option value="shades">Nuances</option>
                                <option value="complementary">Complémentaire</option>
                                <option value="splitComplementary">Complémentaires partagées</option>
                                <option value="triadic">Triade</option>
                                <option value="tetradic">Carré (Tétradique)</option>
                                <option value="compound">Composite</option>
                                <option value="monochromatic">Monochrome</option>
                            </select>
                        </div>
                        <div class="brightness-slider">
                            <label>Luminosité: <span id="brightnessValue">50</span>%</label>
                            <input type="range" id="brightnessRange" min="10" max="90" value="50" oninput="ColorWheel.setBrightness(this.value)">
                        </div>
                        ${photoOpts ? '<button class="cancel" style="margin-top:10px;width:100%;" onclick="ColorWheel.autoFromPhoto()">🔄 Auto</button>' : ''}
                    </div>
                    <div class="color-wheel-right">
                        <div class="generated-colors" id="generatedColors"></div>
                    </div>${photoColumnHtml}
                </div>
                <div class="color-wheel-actions">
                    <input type="text" id="paletteNameInput" placeholder="Nom de la palette..." data-tooltip="Nom de la palette..." style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-main);">
                    <button class="cancel" onclick="ColorWheel.close()">Annuler</button>
                    <button class="confirm" onclick="ColorWheel.addToBoard()">${(existingColors && !photoOpts) ? 'Modifier' : 'Ajouter au moodboard'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Pré-remplir le nom si existant
        if(ColorWheel.existingName) {
            document.getElementById('paletteNameInput').value = ColorWheel.existingName;
        }
        
        ColorWheel.canvas = document.getElementById('colorWheelCanvas');
        ColorWheel.ctx = ColorWheel.canvas.getContext('2d');
        
        ColorWheel.drawWheel();
        // Cas extraction (v594) : partir des 5 couleurs extraites TELLES
        // QUELLES, pas de la formule d'harmonie qui n'en retiendrait qu'une
        // approximation a partir de la seule premiere teinte.
        if(photoOpts && existingColors && existingColors.length) {
            ColorWheel.colors = (photoOpts.initialPoints || []).map(p => ({ ...p }));
            ColorWheel.renderColors();
        } else {
            ColorWheel.generateColors();
        }
        ColorWheel.updateMarkers();
        if(photoOpts) {
            ColorWheel.renderPhotoMarkers();
            // Le contenu de la photo est en position absolue (pour le
            // panoramique) : sans hauteur fixee tout de suite, le cadre
            // s'effondrerait a 0px au repos.
            const wrap = document.getElementById('cwPhotoWrap');
            if(wrap && photoOpts.canvasW && photoOpts.canvasH) {
                wrap.style.height = (wrap.getBoundingClientRect().width * photoOpts.canvasH / photoOpts.canvasW) + 'px';
                wrap.dataset.heightLocked = '1';
            }
        }
        ColorWheel.setupEvents();
    },

    // Agrandit la photo autour du curseur, pour placer un point avec
    // precision — mais dans un cadre qui reste FIXE (overflow:hidden) : la
    // vue defile a l'interieur au lieu d'agrandir sur place et de deborder.
    _photoZoom: { fx: 0.5, fy: 0.5, S: 1, offX: 0, offY: 0, w: 0, h: 0 },
    _draggingMarker: false,

    // Fixe la hauteur du cadre une seule fois (a sa taille au repos) : sans
    // ca, agrandir le contenu a l'interieur ferait aussi grandir le cadre.
    _lockPhotoWrapHeight: () => {
        const wrap = document.getElementById('cwPhotoWrap');
        if(!wrap || wrap.dataset.heightLocked) return;
        const rect = wrap.getBoundingClientRect();
        if(rect.height > 0) { wrap.style.height = rect.height + 'px'; wrap.dataset.heightLocked = '1'; }
    },

    // Deplace/agrandit la photo pour que le point vise (fx,fy, fraction 0-1
    // de la photo NON zoomee) reste exactement sous le curseur, sans jamais
    // reveler de vide au-dela des bords — donc jamais deborder du cadre.
    _applyPhotoZoom: (fx, fy, S) => {
        const wrap = document.getElementById('cwPhotoWrap');
        const inner = document.getElementById('cwPhotoInner');
        if(!wrap || !inner) return;
        ColorWheel._lockPhotoWrapHeight();
        const rect = wrap.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        const offX = fx * w * (S - 1);
        const offY = fy * h * (S - 1);
        inner.style.width = (w * S) + 'px';
        inner.style.left = (-offX) + 'px';
        inner.style.top = (-offY) + 'px';
        ColorWheel._photoZoom = { fx, fy, S, offX, offY, w, h };
    },

    magnifyPhoto: (e) => {
        if(ColorWheel._draggingMarker) return; // le glisser gere son propre suivi
        const wrap = document.getElementById('cwPhotoWrap');
        if(!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        ColorWheel._applyPhotoZoom(fx, fy, 2.2);
    },
    resetPhotoZoom: () => {
        if(ColorWheel._draggingMarker) return;
        const inner = document.getElementById('cwPhotoInner');
        if(inner) { inner.style.width = '100%'; inner.style.left = '0'; inner.style.top = '0'; }
        ColorWheel._photoZoom = { fx: 0.5, fy: 0.5, S: 1, offX: 0, offY: 0, w: 0, h: 0 };
    },

    // Pose les points colores sur la photo, a la position d'ou vient chaque
    // couleur. Une couleur saisie a la main (pas de x/y connu) n'a pas de point.
    renderPhotoMarkers: () => {
        const inner = document.getElementById('cwPhotoInner');
        if(!inner || !ColorWheel.photoOpts) return;
        inner.querySelectorAll('.pe-marker').forEach(m => m.remove());
        const { canvasW, canvasH } = ColorWheel.photoOpts;
        ColorWheel.colors.forEach((c, i) => {
            if(c.x == null || c.y == null) return;
            const m = document.createElement('div');
            m.className = 'pe-marker';
            m.dataset.idx = i;
            m.style.left = (c.x / canvasW * 100) + '%';
            m.style.top = (c.y / canvasH * 100) + '%';
            m.style.background = c.hex;
            m.title = 'Glisser pour ajuster';
            m.addEventListener('mousedown', (ev) => ColorWheel._startPhotoMarkerDrag(ev, i));
            inner.appendChild(m);
        });
    },

    _startPhotoMarkerDrag: (e, i) => {
        e.preventDefault();
        e.stopPropagation();
        const wrap = document.getElementById('cwPhotoWrap');
        const inner = document.getElementById('cwPhotoInner');
        if(!wrap || !inner || !ColorWheel.photoOpts) return;
        ColorWheel._draggingMarker = true;
        const { canvasW, canvasH, sample, computePalette } = ColorWheel.photoOpts;

        const onMove = (ev) => {
            const rect = wrap.getBoundingClientRect();
            const dispX = ev.clientX - rect.left;
            const dispY = ev.clientY - rect.top;
            const z = ColorWheel._photoZoom;
            // Retrouve, avec le panoramique ACTUEL, le point de la photo
            // reellement sous le curseur (avant de faire suivre la loupe).
            let fx, fy;
            if(z && z.S && z.S !== 1 && z.w) {
                fx = (dispX + z.offX) / (z.w * z.S);
                fy = (dispY + z.offY) / (z.h * z.S);
            } else {
                fx = dispX / rect.width;
                fy = dispY / rect.height;
            }
            fx = Math.max(0, Math.min(1, fx));
            fy = Math.max(0, Math.min(1, fy));
            // La loupe recentre/defile sur ce point — c'est ce qui permet de
            // continuer a glisser meme quand on approche un bord.
            ColorWheel._applyPhotoZoom(fx, fy, 2.2);
            const x = fx * canvasW, y = fy * canvasH;
            const hex = sample(x, y);
            const hsl = ColorWheel.hexToHsl(hex);
            // Les 4 autres points se recalent sur l'harmonie en cours, dans sa
            // forme exacte, autour de la couleur qu'on est en train de deplacer.
            const lock = { idx: i, hue: hsl.h, sat: hsl.s, light: hsl.l, exact: { hex, x, y } };
            const pts = computePalette ? computePalette(ColorWheel.harmony, lock) : null;
            if(pts) {
                ColorWheel.colors = pts.map(p => ({ ...p }));
            } else {
                ColorWheel.colors[i] = { hue: hsl.h, saturation: Math.round(hsl.s), lightness: Math.round(hsl.l), hex, x, y };
            }
            ColorWheel.renderColors();
            ColorWheel.renderPhotoMarkers();
            ColorWheel.updateMarkers();
        };
        const onUp = () => {
            ColorWheel._draggingMarker = false;
            ColorWheel.resetPhotoZoom();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    // Rappelle l'extraction automatique depuis la photo (mode extraction
    // uniquement) : remplace les 5 couleurs et repositionne leurs points.
    autoFromPhoto: () => {
        if(!ColorWheel.photoOpts || !ColorWheel.photoOpts.computePalette) return;
        const pts = ColorWheel.photoOpts.computePalette(ColorWheel.harmony, null);
        if(!pts || !pts.length) return;
        ColorWheel.colors = pts.map(p => ({ ...p }));
        ColorWheel.renderColors();
        ColorWheel.updateMarkers();
        ColorWheel.renderPhotoMarkers();
    },
    
    close: () => {
        const modal = document.getElementById('colorWheelModal');
        if(modal) modal.remove();
        ColorWheel.photoOpts = null;
    },
    
    drawWheel: () => {
        const ctx = ColorWheel.ctx;
        const cx = ColorWheel.centerX;
        const cy = ColorWheel.centerY;
        const radius = ColorWheel.radius;
        
        ctx.clearRect(0, 0, ColorWheel.size, ColorWheel.size);
        
        for(let angle = 0; angle < 360; angle += 1) {
            for(let r = 0; r < radius; r += 1) {
                const hue = angle;
                const saturation = (r / radius) * 100;
                const lightness = ColorWheel.brightness;
                
                ctx.beginPath();
                ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                
                const rad = (angle - 90) * Math.PI / 180;
                const x = cx + r * Math.cos(rad);
                const y = cy + r * Math.sin(rad);
                
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    },
    
    setupEvents: () => {
        const wrap = document.getElementById('colorWheelWrap');
        
        wrap.addEventListener('mousedown', (e) => {
            ColorWheel.isDragging = true;
            // Mode photo : retenir quel point (parmi les 5) est le plus
            // proche du clic, pour l'ancrer lui — pas le point "principal"
            // par defaut — pendant tout le glisser.
            ColorWheel._wheelDragIdx = ColorWheel._nearestMarkerIdx(e);
            ColorWheel.handleDrag(e);
        });
        
        if(!ColorWheel._docBound) {
            ColorWheel._docBound = true;
            document.addEventListener('mousemove', (e) => {
                if(ColorWheel.isDragging) ColorWheel.handleDrag(e);
            });
            document.addEventListener('mouseup', () => {
                ColorWheel.isDragging = false;
            });
        }
    },

    // Point (parmi les 5 actuels) le plus proche d'une position d'ecran sur
    // la roue.
    _nearestMarkerIdx: (e) => {
        const rect = ColorWheel.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let best = 0, bestDist = Infinity;
        ColorWheel.colors.forEach((c, i) => {
            const rad = (c.hue - 90) * Math.PI / 180;
            const dist = (c.saturation / 100) * ColorWheel.radius;
            const mx2 = ColorWheel.centerX + dist * Math.cos(rad);
            const my2 = ColorWheel.centerY + dist * Math.sin(rad);
            const d = Math.hypot(mx - mx2, my - my2);
            if(d < bestDist) { bestDist = d; best = i; }
        });
        return best;
    },
    
    handleDrag: (e) => {
        const rect = ColorWheel.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - ColorWheel.centerX;
        const y = e.clientY - rect.top - ColorWheel.centerY;
        
        let angle = Math.atan2(y, x) * 180 / Math.PI + 90;
        if(angle < 0) angle += 360;
        
        const distance = Math.sqrt(x * x + y * y);
        const saturation = Math.min(100, Math.max(10, (distance / ColorWheel.radius) * 100));
        
        // Mode photo : le point saisi ET les 4 autres restent ancres dans de
        // vraies couleurs de la photo, dans la forme EXACTE de l'harmonie en
        // cours (comme les coins d'un carre qui peut tourner/grossir mais
        // jamais se deformer).
        if(ColorWheel.photoOpts && ColorWheel.photoOpts.computePalette) {
            const idx = ColorWheel._wheelDragIdx != null ? ColorWheel._wheelDragIdx : 0;
            const current = ColorWheel.colors[idx];
            const lock = { idx, hue: angle, sat: saturation, light: current ? current.lightness : ColorWheel.brightness, exact: null };
            const pts = ColorWheel.photoOpts.computePalette(ColorWheel.harmony, lock);
            if(pts) {
                ColorWheel.colors = pts.map(p => ({ ...p }));
                ColorWheel.renderColors();
                ColorWheel.updateMarkers();
                ColorWheel.renderPhotoMarkers();
                return;
            }
        }
        
        ColorWheel.baseHue = angle;
        ColorWheel.baseSaturation = saturation;
        
        ColorWheel.generateColors();
        ColorWheel.updateMarkers();
    },
    
    setHarmony: (harmony) => {
        ColorWheel.harmony = harmony;
        ColorWheel.generateColors();
        ColorWheel.updateMarkers();
    },
    
    setBrightness: (value) => {
        ColorWheel.brightness = parseInt(value);
        document.getElementById('brightnessValue').textContent = value;
        ColorWheel.drawWheel();
        ColorWheel.generateColors();
        ColorWheel.updateMarkers();
    },
    
    // ===================== COULEURS & RENDU =====================
    generateColors: () => {
        const h = ColorWheel.harmony;
        const harmonyData = ColorWheel.harmonies[h];
        const baseHue = ColorWheel.baseHue;
        const baseSat = ColorWheel.baseSaturation;
        const light = ColorWheel.brightness;
        
        ColorWheel.colors = [];
        
        for(let i = 0; i < 5; i++) {
            let hue = (baseHue + harmonyData.angles[i] + 360) % 360;
            // Appliquer la saturation de base proportionnellement
            let sat;
            if(harmonyData.saturations) {
                sat = (harmonyData.saturations[i] / 100) * baseSat;
            } else {
                sat = baseSat;
            }
            let l = harmonyData.lightnesses ? harmonyData.lightnesses[i] : light;
            const hex = ColorWheel.hslToHex(hue, sat, l);
            const c = { hue: hue, saturation: Math.round(sat), lightness: l, hex: hex };
            // Mode extraction : replacer le point sur la photo, au pixel le
            // plus proche de cette nouvelle couleur — sinon il disparaitrait
            // a chaque changement d'harmonie/luminosite.
            if(ColorWheel.photoOpts && ColorWheel.photoOpts.findNearestPixel) {
                const p = ColorWheel.photoOpts.findNearestPixel(hex);
                c.x = p.x; c.y = p.y;
            }
            ColorWheel.colors.push(c);
        }
        
        ColorWheel.renderColors();
        if(ColorWheel.photoOpts) ColorWheel.renderPhotoMarkers();
    },
    
    hslToHex: (h, s, l) => {
        s /= 100;
        l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
    },
    
    hexToRgb: (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },
    
    renderColors: () => {
        const container = document.getElementById('generatedColors');
        if(!container) return;
        
        container.innerHTML = ColorWheel.colors.map((c, i) => {
            if(c.notFound) {
                return `
                    <div class="generated-color-item generated-color-missing" title="Aucune couleur assez proche dans la photo">
                        <div class="generated-color-swatch generated-color-swatch-empty"></div>
                        <div class="generated-color-info">
                            <div class="generated-color-missing-label">Introuvable dans la photo</div>
                        </div>
                    </div>
                `;
            }
            const rgb = ColorWheel.hexToRgb(c.hex);
            return `
                <div class="generated-color-item">
                    <div class="generated-color-swatch" style="background: ${c.hex}; cursor:pointer;" onclick="navigator.clipboard.writeText('${c.hex}'); Utils.toast('${c.hex} copié !', 'success');" title="Cliquer pour copier"></div>
                    <div class="generated-color-info">
                        <input class="generated-color-hex" type="text" value="${c.hex}" maxlength="7" spellcheck="false"
                            onclick="event.stopPropagation()" onchange="ColorWheel.setColorHex(${i}, this.value)">
                        <div class="generated-color-rgb">RGB(${rgb ? rgb.r : 0}, ${rgb ? rgb.g : 0}, ${rgb ? rgb.b : 0})</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Saisie manuelle d'un hex (en plus du choix sur la roue) : recalcule la
    // teinte/saturation/luminosité internes pour rester cohérent (marqueur,
    // luminosité affichée...).
    setColorHex: (i, val) => {
        let hex = String(val || '').trim();
        if(hex && hex[0] !== '#') hex = '#' + hex;
        if(!/^#[0-9A-Fa-f]{6}$/.test(hex)) { ColorWheel.renderColors(); return; }
        hex = hex.toUpperCase();
        const hsl = ColorWheel.hexToHsl(hex);

        // Mode photo : ancrer ce hex sur le pixel de la photo le plus proche,
        // puis faire suivre les 4 autres selon la forme de l'harmonie — meme
        // logique que le glisser sur la photo ou sur la roue.
        if(ColorWheel.photoOpts && ColorWheel.photoOpts.computePalette && ColorWheel.photoOpts.findNearestPixel) {
            const p = ColorWheel.photoOpts.findNearestPixel(hex);
            const lock = { idx: i, hue: hsl.h, sat: hsl.s, light: hsl.l, exact: { hex, x: p.x, y: p.y } };
            const pts = ColorWheel.photoOpts.computePalette(ColorWheel.harmony, lock);
            if(pts) {
                ColorWheel.colors = pts.map(pt => ({ ...pt }));
                ColorWheel.renderColors();
                ColorWheel.updateMarkers();
                ColorWheel.renderPhotoMarkers();
                return;
            }
        }

        const c = { hue: hsl.h, saturation: Math.round(hsl.s), lightness: Math.round(hsl.l), hex };
        if(ColorWheel.photoOpts && ColorWheel.photoOpts.findNearestPixel) {
            const p = ColorWheel.photoOpts.findNearestPixel(hex);
            c.x = p.x; c.y = p.y;
        }
        ColorWheel.colors[i] = c;
        ColorWheel.renderColors();
        ColorWheel.updateMarkers();
        if(ColorWheel.photoOpts) ColorWheel.renderPhotoMarkers();
    },
    
    updateMarkers: () => {
        const wrap = document.getElementById('colorWheelWrap');
        if(!wrap) return;
        
        wrap.querySelectorAll('.color-wheel-marker').forEach(m => m.remove());
        
        ColorWheel.colors.forEach((c, i) => {
            const marker = document.createElement('div');
            marker.className = 'color-wheel-marker' + (i === 0 ? ' main draggable' : '') + (c.notFound ? ' not-found' : '');
            
            const rad = (c.hue - 90) * Math.PI / 180;
            const dist = (c.saturation / 100) * ColorWheel.radius;
            const x = ColorWheel.centerX + dist * Math.cos(rad);
            const y = ColorWheel.centerY + dist * Math.sin(rad);
            
            marker.style.left = x + 'px';
            marker.style.top = y + 'px';
            marker.style.backgroundColor = c.notFound ? 'transparent' : c.hex;
            marker.title = c.notFound ? 'Aucune couleur assez proche dans la photo' : '';
            
            wrap.appendChild(marker);
        });
    },
    
    addToBoard: () => {
        const hexColors = ColorWheel.colors.filter(c => !c.notFound).map(c => c.hex);
        const nameInput = document.getElementById('paletteNameInput');
        const paletteName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : ColorWheel.harmonies[ColorWheel.harmony].name;
        
        if(!hexColors.length) { Utils.toast('Aucune couleur valide à ajouter.', 'warning'); return; }
        
        ColorWheel.close();
        
        if(ColorWheel.onComplete) {
            ColorWheel.onComplete(hexColors, paletteName);
        }
    }
};
