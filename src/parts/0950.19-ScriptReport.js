
// ========== MODULE RAPPORT DE SCRIPT / CONTINUITÉ ==========
const ScriptReport = {
    currentSceneId: null,
    currentShotId: null,
    currentReportIdx: 0,
    
    init: () => {
        ScriptReport.renderScenesList();
    },
    
    // Rendu de la liste des scènes et plans (sidebar gauche)
    renderScenesList: () => {
        const container = document.getElementById('sr-scenes-list');
        if(!container) return;
        
        const scenes = state.data.scenes || [];
        if(scenes.length === 0) {
            container.innerHTML = '<div style="padding: 20px; color: var(--text-sec); text-align: center;">Aucune scène créée</div>';
            return;
        }
        
        let html = '';
        scenes.forEach((scene, idx) => {
            const sceneNum = idx + 1;
            const shots = (state.data.shots || []).filter(s => s.sceneId === scene.id);
            const isActive = ScriptReport.currentSceneId === scene.id && !ScriptReport.currentShotId;
            
            html += `
                <div class="sr-scene-item ${isActive ? 'active' : ''}" onclick="app.ScriptReport.selectScene('${scene.id}')">
                    <div class="sr-scene-title">Sc.${sceneNum} - ${Utils.escape(scene.title || 'Sans titre')}</div>
                    <div style="font-size: 0.8rem; opacity: 0.7;">${shots.length} plan(s)</div>
                </div>
                <div class="sr-shot-list" id="sr-shots-${scene.id}">
                    ${shots.map((shot, shotIdx) => {
                        const hasReport = ScriptReport.hasReport(scene.id, shot.id);
                        const isActiveShot = ScriptReport.currentShotId === shot.id;
                        return `<div class="sr-shot-item ${isActiveShot ? 'active' : ''} ${hasReport ? 'has-report' : ''}" data-fiche="rapport:${Utils.escape(String(scene.id) + '_' + String(shot.id))}" onclick="event.stopPropagation(); app.ScriptReport.selectShot('${scene.id}', '${shot.id}')">
                            Plan ${shotIdx + 1}${shot.name ? ' - ' + Utils.escape(shot.name) : ''}
                        </div>`;
                    }).join('')}
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    hasReport: (sceneId, shotId) => {
        if(!state.data.scriptReports) return false;
        const key = `${sceneId}_${shotId}`;
        return state.data.scriptReports[key] && state.data.scriptReports[key].length > 0;
    },
    
    selectScene: (sceneId) => {
        ScriptReport.currentSceneId = sceneId;
        ScriptReport.currentShotId = null;
        ScriptReport.renderScenesList();
        ScriptReport.showSceneOverview(sceneId);
    },
    
    selectShot: (sceneId, shotId) => {
        try { if(typeof FicheLock !== 'undefined'
                 && FicheLock.ouvrir('rapport', sceneId + '_' + shotId, 'Ce rapport') === false) return; } catch(e) {}
        ScriptReport.currentSceneId = sceneId;
        ScriptReport.currentShotId = shotId;
        ScriptReport.currentReportIdx = 0;
        ScriptReport.renderScenesList();
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
    showSceneOverview: (sceneId) => {
        const container = document.getElementById('sr-sheet-container');
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene) return;
        
        const sceneIdx = state.data.scenes.indexOf(scene) + 1;
        const shots = (state.data.shots || []).filter(s => s.sceneId === sceneId);
        
        container.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <h2 class="mb-10">Scène ${sceneIdx} - ${Utils.escape(scene.title || 'Sans titre')}</h2>
                <p class="text-sec-mb20">${Utils.escape(scene.perso || 'Personnages non définis')}</p>
                <p style="margin-bottom: 30px;">${shots.length} plan(s) dans cette scène</p>
                ${shots.length > 0 ? '<p class="text-sec">Cliquez sur un plan dans la liste pour remplir sa fiche.</p>' : '<p style="color: var(--warning);">Ajoutez des plans dans le Storyboard pour créer des fiches de script.</p>'}
            </div>
        `;
    },
    
    // Récupérer les infos auto-remplies
    getAutoFillData: (sceneId, shotId) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        const shot = (state.data.shots || []).find(s => s.id === shotId);
        const sceneIdx = state.data.scenes.indexOf(scene) + 1;
        const shots = (state.data.shots || []).filter(s => s.sceneId === sceneId);
        const shotIdx = shots.indexOf(shot) + 1;
        
        // Trouver le jour de tournage lié à cette scène
        let shootDay = null;
        (state.data.shootingDays || []).forEach(day => {
            if((day.scenes || []).some(s => s.sceneId === sceneId)) {
                shootDay = day;
            }
        });
        
        // Chercher le cadreur (groupe caméra gc3 ou chercher "cadreur" dans le rôle)
        let cadreur = '';
        const crew = state.data.crew || [];
        const cadreurMember = crew.find(c => c.group_id === 'gc3' || (c.role || '').toLowerCase().includes('cadreur') || (c.role || '').toLowerCase().includes('camera'));
        if(cadreurMember) cadreur = cadreurMember.name;
        
        // Parser le titre de la scène pour INT/EXT et JOUR/NUIT
        const title = scene?.title || '';
        const isInt = /\bINT\b/i.test(title);
        const isExt = /\bEXT\b/i.test(title);
        const isJour = /\bJOUR\b/i.test(title);
        const isNuit = /\bNUIT\b/i.test(title);
        
        // Récupérer les dialogues depuis le contenu de la scène (personnages + dialogues + didascalies)
        // Le contenu est dans scriptContent sous forme HTML avec classes sc-perso, sc-dial, sc-paren
        let dialogues = '';
        if(scene?.scriptContent) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = scene.scriptContent;
            const dialogueLines = [];
            
            // Parcourir tous les éléments du script
            tempDiv.querySelectorAll('.sc-perso, .sc-dial, .sc-paren').forEach(el => {
                const text = el.textContent.trim();
                if(!text) return;
                
                if(el.classList.contains('sc-perso')) {
                    // Nom du personnage
                    dialogueLines.push('');
                    dialogueLines.push(text.toUpperCase());
                } else if(el.classList.contains('sc-paren')) {
                    // Didascalie
                    dialogueLines.push('  (' + text.replace(/^\(|\)$/g, '') + ')');
                } else if(el.classList.contains('sc-dial')) {
                    // Dialogue
                    dialogueLines.push('  ' + text);
                }
            });
            
            dialogues = dialogueLines.join('\n').trim();
        }
        
        // Déterminer effet jour/nuit et int/ext
        const effet = isJour ? 'jour' : (isNuit ? 'nuit' : '');
        const lieu = isInt ? 'int' : (isExt ? 'ext' : '');
        
        return {
            film: state.data.title || '',
            decor: scene?.location || title.split('-')[0]?.replace(/INT|EXT/gi, '').trim() || '',
            date: shootDay?.startDate ? new Date(shootDay.startDate).toLocaleDateString('fr-FR') : '',
            plan: `${sceneIdx}-${shotIdx}`,
            planNom: shot?.name || '',
            camera: cadreur,
            objectif: shot?.lens || '',
            effet: effet,
            lieu: lieu,
            description: shot?.description || shot?.notes || '',
            dialogues: dialogues
        };
    },
    
    // Rendu de la fiche de script
    renderSheet: (sceneId, shotId) => {
        const container = document.getElementById('sr-sheet-container');
        if(!container) return;
        
        // Initialiser le stockage si nécessaire
        if(!state.data.scriptReports) state.data.scriptReports = {};
        const key = `${sceneId}_${shotId}`;
        if(!state.data.scriptReports[key]) state.data.scriptReports[key] = [];
        
        const reports = state.data.scriptReports[key];
        const autoFill = ScriptReport.getAutoFillData(sceneId, shotId);
        
        // Si aucun rapport, en créer un nouveau
        if(reports.length === 0) {
            reports.push(ScriptReport.createNewReport(autoFill));
            Store.save();
        }
        
        const idx = Math.min(ScriptReport.currentReportIdx, reports.length - 1);
        const report = reports[idx] || {};
        
        // Navigation entre les fiches
        let navHtml = '';
        if(reports.length > 1 || true) {
            navHtml = `<div class="sr-nav-reports">
                ${reports.map((r, i) => `<button class="sr-nav-btn ${i === idx ? 'active' : ''}" onclick="app.ScriptReport.switchReport(${i})">Fiche ${i + 1}</button>`).join('')}
                <button class="sr-nav-btn" onclick="app.ScriptReport.addReport('${sceneId}', '${shotId}')" style="background: var(--success); color: white;">+ Nouvelle fiche</button>
                ${reports.length > 1 ? `<button class="sr-nav-btn" onclick="app.ScriptReport.deleteReport('${sceneId}', '${shotId}', ${idx})" style="background: var(--danger); color: white;">🗑️</button>` : ''}
            </div>`;
        }
        
        // v601 — VERROU PAR RAPPORT. Un rapport de script EST une fiche : il a
        // une clef stable (« scene_plan ») et un contenu a lui. Il etait reste
        // sur un verrou d'onglet parce que je l'avais classe « cas mixte » avec
        // les Depenses — a tort : le budget est un objet unique, un rapport
        // non. La seule vraie particularite est que les rapports sont ranges
        // dans un DICTIONNAIRE et non dans une liste, ce qui ne change rien au
        // verrou et demande seulement une fusion a part (StoreRealtime._carteAJour).
        // C'est ici que sont les champs : c'est donc ici que le verrou s'accroche.
        container.innerHTML = `
            ${navHtml}
            <div class="sr-sheet" data-fiche="rapport:${Utils.escape(String(key))}">
                <!-- Ligne 1: FILM / DÉCOR / DATE / PLAN / EFFET -->
                <div class="sr-sheet-row" style="grid-template-columns: 1fr 1fr 120px 100px 180px;">
                    <div class="sr-sheet-cell"><strong>FILM :</strong><br><input type="text" value="${Utils.escape(report.film || autoFill.film)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'film', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>DÉCOR :</strong><br><input type="text" value="${Utils.escape(report.decor || autoFill.decor)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'decor', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>DATE :</strong><br><input type="text" value="${Utils.escape(report.date || autoFill.date)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'date', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>PLAN :</strong><br>${Utils.escape(report.plan || autoFill.plan)}</div>
                    <div class="sr-sheet-cell">
                        <strong>EFFET :</strong><br>
                        <select style="padding: 4px;" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'effet', this.value)">
                            <option value="" ${!(report.effet || autoFill.effet) ? 'selected' : ''}>-</option>
                            <option value="jour" ${(report.effet || autoFill.effet) === 'jour' ? 'selected' : ''}>JOUR</option>
                            <option value="nuit" ${(report.effet || autoFill.effet) === 'nuit' ? 'selected' : ''}>NUIT</option>
                        </select>
                        <select style="padding: 4px;" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'lieu', this.value)">
                            <option value="" ${!(report.lieu || autoFill.lieu) ? 'selected' : ''}>-</option>
                            <option value="int" ${(report.lieu || autoFill.lieu) === 'int' ? 'selected' : ''}>INT</option>
                            <option value="ext" ${(report.lieu || autoFill.lieu) === 'ext' ? 'selected' : ''}>EXT</option>
                        </select>
                    </div>
                </div>
                
                <!-- Ligne 2: SON / SUPPORTS / CAMÉRA / OBJECTIF -->
                <div class="sr-sheet-row" style="grid-template-columns: 100px 1fr 150px 150px;">
                    <div class="sr-sheet-cell">
                        <strong>SON :</strong><br>
                        <select style="padding: 4px; width: 100%;" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'son', this.value)">
                            <option value="sonore" ${report.son !== 'muet' ? 'selected' : ''}>SONORE</option>
                            <option value="muet" ${report.son === 'muet' ? 'selected' : ''}>MUET</option>
                        </select>
                    </div>
                    <div class="sr-sheet-cell"><strong>Supports :</strong><br><input type="text" value="${Utils.escape(report.supports || '')}" placeholder="Noms des supports..." data-tooltip="Noms des supports..." onchange="app.ScriptReport.updateField('${key}', ${idx}, 'supports', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>CAMÉRA :</strong><br><input type="text" value="${Utils.escape(report.camera || autoFill.camera)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'camera', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>OBJECTIF :</strong><br><input type="text" value="${Utils.escape(report.objectif || autoFill.objectif)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'objectif', this.value)" class="w-full"></div>
                </div>
                
                <!-- Ligne 3: NOTE (texte libre) -->
                <div class="sr-sheet-row" style="grid-template-columns: 1fr;">
                    <div class="sr-sheet-cell"><strong>NOTE :</strong><br><textarea style="width: 100%; height: 50px; border: none; resize: vertical;" placeholder="Notes libres..." data-tooltip="Notes libres..." onchange="app.ScriptReport.updateField('${key}', ${idx}, 'note', this.value)">${Utils.escape(report.note || '')}</textarea></div>
                </div>
                
                <!-- Tableau des prises -->
                <div class="p-10">
                    <div class="section-header-10">
                        <strong>PRISES</strong>
                        <button onclick="app.ScriptReport.addTake('${key}', ${idx})" style="padding: 5px 10px; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer;">+ Prise</button>
                    </div>
                    <table class="sr-takes-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">Prise</th>
                                <th style="width: 70px;">N° Son</th>
                                <th style="width: 70px;">N° Image</th>
                                <th style="width: 200px;">Qualité</th>
                                <th>Notes</th>
                                <th style="width: 40px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(report.takes || []).map((take, tIdx) => `
                                <tr>
                                    <td style="text-align: center; vertical-align: top; padding-top: 10px;">
                                        <div class="fw-bold">${tIdx + 1}</div>
                                        <div class="mt-5">
                                            <span style="font-size: 1.3rem; color: ${take.star === 'gold' ? '#FFD700' : take.star === 'silver' ? '#A0A0A0' : '#CCC'}; cursor: pointer;" onclick="app.ScriptReport.showStarMenu(event, '${key}', ${idx}, ${tIdx})" title="Marquer cette prise">${take.star ? '★' : '☆'}</span>
                                        </div>
                                    </td>
                                    <td style="vertical-align: top; padding-top: 8px;"><input type="text" value="${Utils.escape(take.numSon || '')}" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'numSon', this.value)" style="width: 100%; border: none; text-align: center;"></td>
                                    <td style="vertical-align: top; padding-top: 8px;"><input type="text" value="${Utils.escape(take.numImage || '')}" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'numImage', this.value)" style="width: 100%; border: none; text-align: center;"></td>
                                    <td style="padding: 5px; vertical-align: top;">
                                        <div class="sr-quality-row">
                                            <span class="sr-quality-label">Son</span>
                                            <select class="sr-quality-select" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'qualitySon', this.value)">
                                                <option value="" ${!take.qualitySon ? 'selected' : ''}>-</option>
                                                <option value="5" ${take.qualitySon === '5' ? 'selected' : ''}>★★★★★ Excellent</option>
                                                <option value="4" ${take.qualitySon === '4' ? 'selected' : ''}>★★★★☆ Très bien</option>
                                                <option value="3" ${take.qualitySon === '3' ? 'selected' : ''}>★★★☆☆ Bien</option>
                                                <option value="2" ${take.qualitySon === '2' ? 'selected' : ''}>★★☆☆☆ Moyen</option>
                                                <option value="1" ${take.qualitySon === '1' ? 'selected' : ''}>★☆☆☆☆ Pas bien</option>
                                            </select>
                                        </div>
                                        <div class="sr-quality-row">
                                            <span class="sr-quality-label">Image</span>
                                            <select class="sr-quality-select" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'qualityImage', this.value)">
                                                <option value="" ${!take.qualityImage ? 'selected' : ''}>-</option>
                                                <option value="5" ${take.qualityImage === '5' ? 'selected' : ''}>★★★★★ Excellent</option>
                                                <option value="4" ${take.qualityImage === '4' ? 'selected' : ''}>★★★★☆ Très bien</option>
                                                <option value="3" ${take.qualityImage === '3' ? 'selected' : ''}>★★★☆☆ Bien</option>
                                                <option value="2" ${take.qualityImage === '2' ? 'selected' : ''}>★★☆☆☆ Moyen</option>
                                                <option value="1" ${take.qualityImage === '1' ? 'selected' : ''}>★☆☆☆☆ Pas bien</option>
                                            </select>
                                        </div>
                                        <div class="sr-quality-row">
                                            <span class="sr-quality-label">Acting</span>
                                            <select class="sr-quality-select" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'qualityActing', this.value)">
                                                <option value="" ${!take.qualityActing ? 'selected' : ''}>-</option>
                                                <option value="5" ${take.qualityActing === '5' ? 'selected' : ''}>★★★★★ Excellent</option>
                                                <option value="4" ${take.qualityActing === '4' ? 'selected' : ''}>★★★★☆ Très bien</option>
                                                <option value="3" ${take.qualityActing === '3' ? 'selected' : ''}>★★★☆☆ Bien</option>
                                                <option value="2" ${take.qualityActing === '2' ? 'selected' : ''}>★★☆☆☆ Moyen</option>
                                                <option value="1" ${take.qualityActing === '1' ? 'selected' : ''}>★☆☆☆☆ Pas bien</option>
                                            </select>
                                        </div>
                                    </td>
                                    <td style="vertical-align: top;"><textarea placeholder="Notes, raccords, remarques..." data-tooltip="Notes, raccords, remarques..." onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'notes', this.value)" style="width: 100%; min-height: 80px; border: 1px solid #ccc; border-radius: 4px; padding: 5px; font-size: 0.85rem;">${Utils.escape(take.notes || '')}</textarea></td>
                                    <td style="vertical-align: top; padding-top: 8px;"><button onclick="app.ScriptReport.removeTake('${key}', ${idx}, ${tIdx})" style="background: var(--danger); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <!-- Description du plan et Dialogues -->
                <div class="sr-sheet-row" style="grid-template-columns: 1fr 1fr;">
                    <div class="sr-sheet-cell p-10">
                        <strong>Description du Plan</strong>
                        <textarea class="n8-misc-3" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'description', this.value)">${Utils.escape(report.description || autoFill.description)}</textarea>
                    </div>
                    <div class="sr-sheet-cell p-10">
                        <strong>Dialogues</strong>
                        <textarea class="n8-misc-3" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'dialogues', this.value)">${Utils.escape(report.dialogues || autoFill.dialogues)}</textarea>
                    </div>
                </div>
            </div>
        `;
    },
    
    createNewReport: (autoFill = {}) => ({
        film: autoFill.film || '',
        date: autoFill.date || '',
        plan: autoFill.plan || '',
        decor: autoFill.decor || '',
        camera: autoFill.camera || '',
        objectif: autoFill.objectif || '',
        effet: autoFill.effet || '',
        lieu: autoFill.lieu || '',
        bobine: '',
        son: 'sonore',
        supports: '',
        description: autoFill.description || '',
        dialogues: autoFill.dialogues || '',
        takes: [],
        createdAt: Date.now()
    }),
    
    updateField: (key, idx, field, value) => {
        if(!state.data.scriptReports[key]) return;
        if(!state.data.scriptReports[key][idx]) return;
        state.data.scriptReports[key][idx][field] = value;
        Store.save();
    },
    
    // Fix: shotId contient des underscores (Utils.generateUniqueId = timestamp_hash),
    // donc on split uniquement sur le premier _ pour reconstituer shotId complet
    splitKey: (key) => {
        const idx = (key || '').indexOf('_');
        if(idx === -1) return [key, ''];
        return [key.substring(0, idx), key.substring(idx + 1)];
    },
    
    addTake: (key, reportIdx) => {
        if(!state.data.scriptReports[key]) return;
        if(!state.data.scriptReports[key][reportIdx]) return;
        if(!state.data.scriptReports[key][reportIdx].takes) state.data.scriptReports[key][reportIdx].takes = [];
        
        state.data.scriptReports[key][reportIdx].takes.push({
            numSon: '',
            numImage: '',
            qualitySon: '',
            qualityImage: '',
            qualityActing: '',
            notes: ''
        });
        
        Store.save();
        // Fix : shotId contient des underscores (format '1776858_f8pjm8key'), 
        // on split uniquement sur le premier _ pour reconstituer shotId complet
        const idx = key.indexOf('_');
        const sceneId = key.substring(0, idx);
        const shotId = key.substring(idx + 1);
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
    updateTake: (key, reportIdx, takeIdx, field, value) => {
        if(!state.data.scriptReports[key]?.[reportIdx]?.takes?.[takeIdx]) return;
        state.data.scriptReports[key][reportIdx].takes[takeIdx][field] = value;
        Store.save();
    },
    
    setTakeStar: (key, reportIdx, takeIdx, value) => {
        if(!state.data.scriptReports[key]?.[reportIdx]?.takes?.[takeIdx]) return;
        state.data.scriptReports[key][reportIdx].takes[takeIdx].star = value;
        Store.save();
        // Fix : split uniquement sur le premier _ pour reconstituer shotId complet
        const idx = key.indexOf('_');
        const sceneId = key.substring(0, idx);
        const shotId = key.substring(idx + 1);
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
    showStarMenu: (event, key, reportIdx, takeIdx) => {
        event.stopPropagation();
        // Fermer tout menu existant
        document.querySelectorAll('.sr-star-menu').forEach(m => m.remove());
        
        const menu = document.createElement('div');
        menu.className = 'sr-star-menu';
        menu.style.cssText = 'position: absolute; background: var(--panel-bg); color: var(--text-main); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: var(--z-dropdown); padding: 5px 0;';
        menu.innerHTML = `
            <div style="padding: 8px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="app.ScriptReport.setTakeStar('${key}', ${reportIdx}, ${takeIdx}, 'gold'); this.parentElement.remove();">
                <span style="font-size: 1.3rem; color: #FFD700;">★</span> <span>Or</span>
            </div>
            <div style="padding: 8px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="app.ScriptReport.setTakeStar('${key}', ${reportIdx}, ${takeIdx}, 'silver'); this.parentElement.remove();">
                <span style="font-size: 1.3rem; color: #A0A0A0;">★</span> <span>Argent</span>
            </div>
            <div style="padding: 8px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="app.ScriptReport.setTakeStar('${key}', ${reportIdx}, ${takeIdx}, ''); this.parentElement.remove();">
                <span style="font-size: 1.3rem; color: #CCC;">☆</span> <span>Aucune</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Positionner le menu
        const rect = event.target.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 5) + 'px';
        
        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                Utils.fermerMenu(menu, () => menu.remove());
                document.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 10);
    },
    
    removeTake: async (key, reportIdx, takeIdx) => {
        if(!await ConfirmModal.confirmDelete('Supprimer cette prise ?')) return;
        if(!state.data.scriptReports[key]?.[reportIdx]?.takes) return;
        state.data.scriptReports[key][reportIdx].takes.splice(takeIdx, 1);
        Store.save();
        const [sceneId, shotId] = ScriptReport.splitKey(key);
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
       
    switchReport: (idx) => {
        ScriptReport.currentReportIdx = idx;
        if(ScriptReport.currentSceneId && ScriptReport.currentShotId) {
            ScriptReport.renderSheet(ScriptReport.currentSceneId, ScriptReport.currentShotId);
        }
    },
    
    addReport: (sceneId, shotId) => {
        const key = `${sceneId}_${shotId}`;
        if(!state.data.scriptReports[key]) state.data.scriptReports[key] = [];
        const autoFill = ScriptReport.getAutoFillData(sceneId, shotId);
        state.data.scriptReports[key].push(ScriptReport.createNewReport(autoFill));
        ScriptReport.currentReportIdx = state.data.scriptReports[key].length - 1;
        Store.save();
        ScriptReport.renderScenesList();
        ScriptReport.renderSheet(sceneId, shotId);
        Utils.toast('Nouvelle fiche créée', 'success');
    },
    
    deleteReport: async (sceneId, shotId, idx) => {
        if(!await ConfirmModal.confirmDelete('Supprimer cette fiche de script ?')) return;
        const key = `${sceneId}_${shotId}`;
        if(!state.data.scriptReports[key]) return;
        state.data.scriptReports[key].splice(idx, 1);
        ScriptReport.currentReportIdx = Math.max(0, idx - 1);
        Store.save();
        ScriptReport.renderScenesList();
        ScriptReport.renderSheet(sceneId, shotId);
        Utils.toast('Fiche supprimée', 'success');
    },
    
    openPrintChooser: () => {
        // Construire la liste : pour chaque scène ayant au moins 1 fiche, lister les plans concernés et leurs fiches
        const reports = state.data.scriptReports || {};
        const reportKeys = Object.keys(reports).filter(k => reports[k] && reports[k].length > 0);
        if(reportKeys.length === 0) { Utils.toast('Aucune fiche à imprimer', 'warning'); return; }
        // Grouper par sceneId — ATTENTION : les IDs de scène et de plan contiennent des underscores
        // (Utils.generateUniqueId = timestamp + '_' + hash), donc on ne peut PAS splitter simplement
        // sur le premier '_'. On cherche quel sceneId existant matche le début de la clé.
        const allScenes = state.data.scenes || [];
        const allShots = state.data.shots || [];
        const bySceneId = {};
        reportKeys.forEach(key => {
            // Trouver la scène dont l'ID + '_' est préfixe de la clé
            let matchedScene = allScenes.find(s => key.startsWith(s.id + '_'));
            let sceneId, shotId;
            if(matchedScene) {
                sceneId = matchedScene.id;
                shotId = key.substring(matchedScene.id.length + 1);
            } else {
                // Fallback : si on ne trouve pas la scène (orphan), on utilise la clé entière comme sceneId
                sceneId = '__orphan__';
                shotId = key;
            }
            if(!bySceneId[sceneId]) bySceneId[sceneId] = [];
            bySceneId[sceneId].push({ key, shotId, reports: reports[key] });
        });
        // Trier les scènes selon l'ordre dans state.data.scenes
        const sortedSceneIds = Object.keys(bySceneId).sort((a, b) => {
            if(a === '__orphan__') return 1;
            if(b === '__orphan__') return -1;
            const ia = allScenes.findIndex(s => s.id === a);
            const ib = allScenes.findIndex(s => s.id === b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });
        // Gérer les orphelins : pas de scène trouvée → label "Fiches orphelines"
        // Construire HTML colonnes — pas de checkbox carrée, les zones cliquables
        // sont les bandeaux de scène et les lignes de fiche directement (gain de place + plus joli)
        const colsHTML = sortedSceneIds.map(sceneId => {
            const isOrphan = sceneId === '__orphan__';
            const scene = isOrphan ? null : allScenes.find(s => s.id === sceneId);
            const sceneIdx = scene ? allScenes.indexOf(scene) : -1;
            const sceneNum = scene ? UI.formatSceneNumber(scene, sceneIdx) : '?';
            const sceneTitle = isOrphan ? 'Fiches orphelines' : (scene ? (scene.title || '') : 'Scène inconnue');
            const items = bySceneId[sceneId].sort((a, b) => {
                const ia = allShots.findIndex(s => s.id === a.shotId);
                const ib = allShots.findIndex(s => s.id === b.shotId);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
            const linesHTML = items.map(it => {
                const shot = allShots.find(s => s.id === it.shotId);
                const shotLabel = shot ? (shot.title || `Plan ${shot.id.slice(-4)}`) : `Plan ?`;
                if(it.reports.length === 1) {
                    return `<div class="sr-fiche selected" data-fiche="rapport:${it.key}" data-key="${it.key}" data-idx="0" data-scene="${sceneId}">${Utils.escape(shotLabel)}</div>`;
                }
                return it.reports.map((r, ridx) => {
                    return `<div class="sr-fiche selected" data-fiche="rapport:${it.key}" data-key="${it.key}" data-idx="${ridx}" data-scene="${sceneId}">${Utils.escape(shotLabel)} <span class="sr-take">prise ${ridx + 1}</span></div>`;
                }).join('');
            }).join('');
            return `<div class="sr-col">
                <div class="sr-col-head selected" data-scene="${sceneId}">
                    <div class="sr-col-num">Sc ${sceneNum}</div>
                    <div class="sr-col-title">${Utils.escape(sceneTitle)}</div>
                    <div class="sr-col-count" data-scene-count="${sceneId}"></div>
                </div>
                <div class="sr-col-body">${linesHTML}</div>
            </div>`;
        }).join('');
        // Calcul de la largeur idéale : largeur d'une colonne (160px) × nombre de colonnes,
        // plafonné à 4 colonnes (au-delà, scroll horizontal). Avec marges/paddings/gaps inclus.
        const colCount = sortedSceneIds.length;
        const visibleCols = Math.min(colCount, 4);
        // Formule : visibleCols × 160 (col) + (visibleCols - 1) × 8 (gap) + 16 (padding grille) + 40 (padding modale) + 2 (bordures)
        const idealWidth = visibleCols * 160 + Math.max(0, (visibleCols - 1)) * 8 + 16 + 40 + 2;
        const maxAllowed = Math.floor(window.innerWidth * 0.92); // 92vw max
        const finalWidth = Math.min(idealWidth, maxAllowed);
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:92vw;width:${finalWidth}px;max-height:88vh;padding:20px;display:flex;flex-direction:column;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:8px;flex-shrink:0;">📋 Imprimer les fiches de script</div>
            <div style="text-align:left;font-size:0.82rem;color:var(--text-sec);margin-bottom:10px;flex-shrink:0;">Cliquez sur une scène pour tout (dé)sélectionner, ou sur un plan pour basculer son état.</div>
            <style>
                .sr-grid { display: flex; gap: 8px; overflow-x: auto; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
                .sr-col { flex-shrink: 0; width: 160px; background: var(--panel-bg); border: 1px solid var(--border); border-radius: 6px; display: flex; flex-direction: column; }
                .sr-col-head { padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer; border-radius: 6px 6px 0 0; transition: background 0.15s, border-color 0.15s; user-select: none; position: relative; }
                .sr-col-head:hover { background: rgba(33,150,243,0.08); }
                .sr-col-head.selected { background: rgba(33,150,243,0.12); border-bottom-color: var(--primary); }
                .sr-col-head.selected::before { content: '✓'; color: var(--primary); font-weight: bold; margin-right: 4px; }
                .sr-col-head.partial::before { content: '◐'; color: var(--primary); font-weight: bold; margin-right: 4px; }
                .sr-col-head.partial { background: rgba(33,150,243,0.05); }
                .sr-col-num { font-weight: bold; font-size: 0.85rem; display: inline; }
                .sr-col-title { font-size: 0.72rem; color: var(--text-sec); line-height: 1.3; margin-top: 2px; word-break: break-word; }
                .sr-col-count { font-size: 0.7rem; color: var(--text-sec); margin-top: 3px; font-style: italic; }
                .sr-col-body { padding: 4px; max-height: 360px; overflow-y: auto; }
                .sr-fiche { padding: 5px 8px; cursor: pointer; border-radius: 3px; font-size: 0.78rem; line-height: 1.3; user-select: none; transition: background 0.1s; margin-bottom: 1px; border: 1px solid transparent; }
                .sr-fiche:hover { background: rgba(33,150,243,0.05); }
                .sr-fiche.selected { background: rgba(33,150,243,0.1); border-color: rgba(33,150,243,0.3); color: var(--primary); }
                .sr-fiche.selected::before { content: '✓ '; font-weight: bold; }
                .sr-fiche:not(.selected)::before { content: '◯ '; color: var(--text-sec); }
                .sr-take { color: var(--text-sec); font-size: 0.7rem; }
            </style>
            <div class="sr-grid" style="flex:1;min-height:240px;">${colsHTML}</div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-shrink:0;">
                <button type="button" id="sr-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="sr-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-shrink:0;align-items:center;">
                <span id="sr-counter" style="margin-right:auto;font-size:0.82rem;color:var(--text-sec);"></span>
                <button class="confirm-modal-btn cancel" id="sr-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="sr-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        // Helpers de mise à jour
        const updateSceneHead = (sceneId) => {
            const head = overlay.querySelector(`.sr-col-head[data-scene="${sceneId}"]`);
            if(!head) return;
            const fiches = overlay.querySelectorAll(`.sr-fiche[data-scene="${sceneId}"]`);
            const selected = Array.from(fiches).filter(f => f.classList.contains('selected'));
            head.classList.remove('selected', 'partial');
            if(selected.length === fiches.length) head.classList.add('selected');
            else if(selected.length > 0) head.classList.add('partial');
            const cnt = overlay.querySelector(`[data-scene-count="${sceneId}"]`);
            if(cnt) cnt.textContent = `${selected.length}/${fiches.length} fiche${fiches.length > 1 ? 's' : ''}`;
        };
        const updateCounter = () => {
            const total = overlay.querySelectorAll('.sr-fiche').length;
            const sel = overlay.querySelectorAll('.sr-fiche.selected').length;
            overlay.querySelector('#sr-counter').textContent = `${sel}/${total} fiche${total > 1 ? 's' : ''} sélectionnée${sel > 1 ? 's' : ''}`;
        };
        // Initial : mettre à jour tous les compteurs
        sortedSceneIds.forEach(sid => updateSceneHead(sid));
        updateCounter();
        // Clic sur bandeau scène : C1 — si toutes les fiches sont sélectionnées, tout désélectionner ; sinon tout sélectionner
        overlay.querySelectorAll('.sr-col-head').forEach(head => {
            head.addEventListener('click', () => {
                const sceneId = head.dataset.scene;
                const fiches = overlay.querySelectorAll(`.sr-fiche[data-scene="${sceneId}"]`);
                const allSel = Array.from(fiches).every(f => f.classList.contains('selected'));
                fiches.forEach(f => { if(allSel) f.classList.remove('selected'); else f.classList.add('selected'); });
                updateSceneHead(sceneId);
                updateCounter();
            });
        });
        // Clic sur ligne fiche : toggle son état
        overlay.querySelectorAll('.sr-fiche').forEach(fiche => {
            fiche.addEventListener('click', () => {
                fiche.classList.toggle('selected');
                updateSceneHead(fiche.dataset.scene);
                updateCounter();
            });
        });
        overlay.querySelector('#sr-all').onclick = () => {
            overlay.querySelectorAll('.sr-fiche').forEach(f => f.classList.add('selected'));
            sortedSceneIds.forEach(sid => updateSceneHead(sid));
            updateCounter();
        };
        overlay.querySelector('#sr-none').onclick = () => {
            overlay.querySelectorAll('.sr-fiche').forEach(f => f.classList.remove('selected'));
            sortedSceneIds.forEach(sid => updateSceneHead(sid));
            updateCounter();
        };
        overlay.querySelector('#sr-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#sr-ok').onclick = () => {
            const selected = Array.from(overlay.querySelectorAll('.sr-fiche.selected')).map(f => ({ key: f.dataset.key, idx: parseInt(f.dataset.idx) }));
            if(selected.length === 0) { Utils.toast('Sélectionnez au moins une fiche', 'warning'); return; }
            overlay.remove();
            setTimeout(() => ScriptReport._launchPrintReports(selected), 100);
        };
    },
    
    _launchPrintReports: async (items) => {
        Utils.toast(`Génération de ${items.length} fiche${items.length > 1 ? 's' : ''}...`, 'info');
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        let first = true;
        items.forEach(it => {
            const reports = (state.data.scriptReports || {})[it.key];
            if(!reports || !reports[it.idx]) return;
            if(!first) doc.addPage();
            first = false;
            ScriptReport.renderPDFPage(doc, reports[it.idx], it.key);
        });
        if(first) { Utils.toast('Aucune fiche valide trouvée', 'warning'); return; }
        // Ouvrir dans nouvelle fenêtre (Blob URL) au lieu de télécharger
        const blob = doc.output('blob');
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(!printWindow) {
            Utils.toast('Impossible d\'ouvrir la fenêtre. Téléchargement à la place.', 'warning');
            doc.save((typeof PdfTheme !== 'undefined' && PdfTheme.filename) ? PdfTheme.filename('Rapports script') : `${state.data.title || 'Projet'} - Rapports script - moteur.studio.pdf`);
            return;
        }
        // Cleanup du Blob URL après ouverture
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    },
    
    // === EXPORT GLOBAL (modal Export PDF / Dossier de Production) ===
    // opts = { includeCover, returnBlob, sceneIds: null | [sceneId, ...] }
    // sceneIds null/undefined = toutes les scènes. Tri : ordre scènes > ordre plans > n° prise.
    exportPDF: async (opts = {}) => {
        const reports = state.data.scriptReports || {};
        const allScenes = state.data.scenes || [];
        const allShots = state.data.shots || [];
        const keys = Object.keys(reports).filter(k => reports[k] && reports[k].length > 0);
        
        const items = [];
        keys.forEach(key => {
            const scene = allScenes.find(s => key.startsWith(s.id + '_'));
            const sceneId = scene ? scene.id : '__orphan__';
            if(Array.isArray(opts.sceneIds) && !opts.sceneIds.includes(sceneId)) return;
            const shotId = scene ? key.substring(scene.id.length + 1) : key;
            reports[key].forEach((r, idx) => items.push({ key, idx, sceneId, shotId }));
        });
        
        if(items.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucune fiche de script à exporter', 'warning');
            return null;
        }
        
        const sceneOrder = (id) => { const i = allScenes.findIndex(s => s.id === id); return i === -1 ? 999 : i; };
        const shotOrder = (id) => { const i = allShots.findIndex(s => s.id === id); return i === -1 ? 999 : i; };
        items.sort((a, b) => sceneOrder(a.sceneId) - sceneOrder(b.sceneId) || shotOrder(a.shotId) - shotOrder(b.shotId) || a.idx - b.idx);
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        if(opts.includeCover !== false && typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
            PdfTheme.coverPage(doc, { sectionName: 'Rapports script' });
            doc.addPage();
        }
        
        let first = true;
        items.forEach(it => {
            if(!first) doc.addPage();
            first = false;
            ScriptReport.renderPDFPage(doc, reports[it.key][it.idx], it.key);
        });
        
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { skipFirstPage: opts.includeCover !== false, forDossier: !!opts.returnBlob });
        }
        
        if(opts.returnBlob) return doc.output('blob');
        
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Rapports script')
            : `${state.data.title || 'Projet'} - Rapports script.pdf`;
        doc.save(filename);
        Utils.toast('Rapports de script exportés !', 'success');
    },
    
    // ScriptReport.generatePDF retirée v569, jamais appelée : doublon de
    // ScriptReport.exportPDF (v558), le vrai chemin d'export utilisé partout.
    
    renderPDFPage: (doc, report, key) => {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = margin;
        
        // Récupérer les dialogues depuis autoFill si report.dialogues est vide
        let dialoguesText = report.dialogues || '';
        if(!dialoguesText && key) {
            const [sceneId, shotId] = key.split('_');
            const autoFill = ScriptReport.getAutoFillData(sceneId, shotId);
            dialoguesText = autoFill.dialogues || '';
        }
        
        doc.setDrawColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        doc.setLineWidth(0.4);
        
        // === TITRE / EN-TÊTE ===
        doc.setFillColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        doc.rect(margin, y, pageWidth - 2*margin, 12, 'F');
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('FICHE DE SCRIPT', pageWidth / 2, y + 8, { align: 'center' });
        doc.setTextColor(...PdfTheme.COLORS.BLACK);
        y += 15;
        
        // === LIGNE 1 : FILM / DATE / PLAN ===
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const row1Height = 12;
        doc.rect(margin, y, pageWidth - 2*margin, row1Height);
        doc.line(margin + 90, y, margin + 90, y + row1Height);
        doc.line(pageWidth - margin - 60, y, pageWidth - margin - 60, y + row1Height);
        
        doc.text('FILM :', margin + 3, y + 5);
        doc.text('DATE :', margin + 93, y + 5);
        doc.text('PLAN :', pageWidth - margin - 57, y + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.text(report.film || '', margin + 3, y + 10);
        doc.text(report.date || '', margin + 93, y + 10);
        doc.text(report.plan || '', pageWidth - margin - 57, y + 10);
        y += row1Height;
        
        // === LIGNE 2 : DÉCOR / EFFET ===
        doc.rect(margin, y, pageWidth - 2*margin, row1Height);
        doc.line(pageWidth - margin - 70, y, pageWidth - margin - 70, y + row1Height);
        
        doc.setFont('helvetica', 'bold');
        doc.text('DÉCOR :', margin + 3, y + 5);
        doc.text('EFFET :', pageWidth - margin - 67, y + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.text(report.decor || '', margin + 3, y + 10);
        const effetStr = [(report.effet || '').toUpperCase(), (report.lieu || '').toUpperCase()].filter(Boolean).join(' - ');
        doc.text(effetStr, pageWidth - margin - 67, y + 10);
        y += row1Height;
        
        // === LIGNE 3 : SON / SUPPORTS / CAM / OBJ ===
        doc.rect(margin, y, pageWidth - 2*margin, row1Height);
        doc.line(margin + 30, y, margin + 30, y + row1Height);
        doc.line(margin + 90, y, margin + 90, y + row1Height);
        doc.line(pageWidth - margin - 45, y, pageWidth - margin - 45, y + row1Height);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('SON', margin + 3, y + 4);
        doc.text('SUPPORTS', margin + 33, y + 4);
        doc.text('CAMERA', margin + 93, y + 4);
        doc.text('OBJECTIF', pageWidth - margin - 42, y + 4);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(report.son === 'muet' ? 'MUET' : 'SONORE', margin + 3, y + 10);
        doc.text(report.supports || '-', margin + 33, y + 10);
        doc.text(report.camera || '-', margin + 93, y + 10);
        doc.text(report.objectif || '-', pageWidth - margin - 42, y + 10);
        y += row1Height;
        
        // === LIGNE 4 : NOTE (si présente) ===
        if(report.note) {
            doc.setFontSize(9);
            const noteLines = doc.splitTextToSize(report.note, pageWidth - 2*margin - 25);
            const noteHeight = Math.max(10, noteLines.length * 4 + 6);
            doc.rect(margin, y, pageWidth - 2*margin, noteHeight);
            doc.setFont('helvetica', 'bold');
            doc.text('NOTE :', margin + 3, y + 5);
            doc.setFont('helvetica', 'normal');
            noteLines.forEach((line, i) => doc.text(line, margin + 22, y + 5 + i*4));
            y += noteHeight;
        }
        
        y += 5;
        
        // === TABLEAU DES PRISES ===
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PRISES', margin, y + 4);
        y += 7;
        
        doc.setFontSize(8);
        const tableWidth = pageWidth - 2*margin;
        const col1 = 18; // Prise
        const col2 = 25; // N° Son
        const col3 = 28; // N° Image
        const col4 = tableWidth - col1 - col2 - col3; // Qualité & Notes
        
        // En-tête tableau
        doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
        doc.rect(margin, y, tableWidth, 8, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text('Prise', margin + 2, y + 5);
        doc.text('N° Son', margin + col1 + 2, y + 5);
        doc.text('N° Image', margin + col1 + col2 + 2, y + 5);
        doc.text('Qualité & Notes', margin + col1 + col2 + col3 + 2, y + 5);
        y += 8;
        
        // Lignes de prises
        doc.setFont('helvetica', 'normal');
        (report.takes || []).forEach((take, idx) => {
            const hasStar = take.star === 'gold' || take.star === 'silver';
            const qualArr = [];
            if(take.qualitySon) qualArr.push('Son:' + take.qualitySon + '/5');
            if(take.qualityImage) qualArr.push('Img:' + take.qualityImage + '/5');
            if(take.qualityActing) qualArr.push('Act:' + take.qualityActing + '/5');
            const qualStr = qualArr.length > 0 ? qualArr.join(' | ') : '';
            const notesStr = take.notes || '';
            const fullDesc = qualStr + (qualStr && notesStr ? ' - ' : '') + notesStr;
            
            const descLines = doc.splitTextToSize(fullDesc, col4 - 6);
            const rowHeight = Math.max(8, descLines.length * 4 + 3);
            
            if(y + rowHeight > pageHeight - 70) {
                doc.addPage();
                y = margin;
            }
            
            doc.rect(margin, y, tableWidth, rowHeight);
            doc.line(margin + col1, y, margin + col1, y + rowHeight);
            doc.line(margin + col1 + col2, y, margin + col1 + col2, y + rowHeight);
            doc.line(margin + col1 + col2 + col3, y, margin + col1 + col2 + col3, y + rowHeight);
            
            doc.setFont('helvetica', 'bold');
            doc.text(`${idx + 1}`, margin + 2, y + 5);
            
            // Dessiner une étoile si nécessaire
            if(hasStar) {
                const starX = margin + 12;
                const starY = y + 3;
                const starSize = 2.5;
                
                // Couleur de l'étoile
                if(take.star === 'gold') {
                    doc.setFillColor(...PdfTheme.COLORS.WARNING); // Or
                } else {
                    doc.setFillColor(...PdfTheme.COLORS.BORDER_DARK); // Argent
                }
                
                // Dessiner une étoile à 5 branches
                const points = [];
                for(let i = 0; i < 10; i++) {
                    const radius = i % 2 === 0 ? starSize : starSize * 0.4;
                    const angle = (i * 36 - 90) * Math.PI / 180;
                    points.push({
                        x: starX + radius * Math.cos(angle),
                        y: starY + radius * Math.sin(angle)
                    });
                }
                
                doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                doc.setLineWidth(0.1);
                doc.moveTo(points[0].x, points[0].y);
                for(let i = 1; i < points.length; i++) {
                    doc.lineTo(points[i].x, points[i].y);
                }
                doc.lineTo(points[0].x, points[0].y);
                doc.fillStroke();
                
                // Reset couleurs
                doc.setDrawColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                doc.setLineWidth(0.4);
            }
            doc.setFont('helvetica', 'normal');
            doc.text(take.numSon || '', margin + col1 + 2, y + 5);
            doc.text(take.numImage || '', margin + col1 + col2 + 2, y + 5);
            descLines.forEach((line, i) => doc.text(line, margin + col1 + col2 + col3 + 2, y + 5 + i*4));
            
            y += rowHeight;
        });
        
        if((report.takes || []).length === 0) {
            doc.rect(margin, y, tableWidth, 10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            doc.text('Aucune prise enregistrée', margin + tableWidth/2, y + 6, { align: 'center' });
            doc.setTextColor(...PdfTheme.COLORS.BLACK);
            y += 10;
        }
        
        y += 8;
        
        // === DESCRIPTION ET DIALOGUES ===
        if(y > pageHeight - 80) {
            doc.addPage();
            y = margin;
        }
        
        const halfWidth = (pageWidth - 2*margin - 5) / 2;
        const boxHeight = Math.min(70, pageHeight - y - 15);
        
        // Description
        doc.rect(margin, y, halfWidth, boxHeight);
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(margin, y, halfWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Description du Plan', margin + 3, y + 6);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const descLines2 = doc.splitTextToSize(report.description || '', halfWidth - 6);
        descLines2.slice(0, 15).forEach((line, i) => doc.text(line, margin + 3, y + 14 + i*4));
        
        // Dialogues
        doc.rect(margin + halfWidth + 5, y, halfWidth, boxHeight);
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(margin + halfWidth + 5, y, halfWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Dialogues', margin + halfWidth + 8, y + 6);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const dialLines2 = doc.splitTextToSize(dialoguesText, halfWidth - 6);
        dialLines2.slice(0, 15).forEach((line, i) => doc.text(line, margin + halfWidth + 8, y + 14 + i*4));
    }
};
