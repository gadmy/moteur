
const ExpensesBudget = {
    // Charge le budget
    loadBudget: () => {
        // Synchroniser depuis la présentation si le budget n'est pas défini
        if(state.data.presentation?.budget && !state.data.budget?.total) {
            if(!state.data.budget) state.data.budget = { total: 0, currency: '€', manager: '', envelopes: {}, previsionnel: {}, vatMode: 'HT', defaultVatRate: 20 };
            state.data.budget.total = parseFloat(state.data.presentation.budget) || 0;
        }
        
        const budget = state.data.budget || { total: 0, currency: '€', vatMode: 'HT', defaultVatRate: 20 };
        const vatMode = budget.vatMode || 'HT';
        
        // Calculer le total depuis le prévisionnel
        let totalHT = 0, totalTTC = 0;
        Object.values(budget.previsionnel || {}).forEach(p => {
            totalHT += p.budgetHT || 0;
            totalTTC += p.budgetTTC || 0;
        });
        
        const displayTotal = vatMode === 'HT' ? totalHT : totalTTC;
        const budgetInput = document.getElementById('expenses-budget-total');
        if(budgetInput) budgetInput.value = displayTotal || budget.total || '';
        
        const currencySelect = document.getElementById('expenses-currency');
        if(currencySelect) currencySelect.value = budget.currency || '€';
        
        const managerSelect = document.getElementById('expenses-manager');
        if(managerSelect && budget.manager) managerSelect.value = budget.manager;
        
        // Mode HT/TTC
        const btnHT = document.getElementById('vat-mode-ht');
        const btnTTC = document.getElementById('vat-mode-ttc');
        if(btnHT) {
            btnHT.style.background = vatMode === 'HT' ? 'var(--primary)' : 'var(--bg)';
            btnHT.style.color = vatMode === 'HT' ? 'white' : 'var(--text-main)';
            btnHT.style.borderColor = vatMode === 'HT' ? 'var(--primary)' : 'var(--border)';
        }
        if(btnTTC) {
            btnTTC.style.background = vatMode === 'TTC' ? 'var(--primary)' : 'var(--bg)';
            btnTTC.style.color = vatMode === 'TTC' ? 'white' : 'var(--text-main)';
            btnTTC.style.borderColor = vatMode === 'TTC' ? 'var(--primary)' : 'var(--border)';
        }
        
        // TVA par défaut
        const vatSelect = document.getElementById('expenses-default-vat');
        if(vatSelect) vatSelect.value = budget.defaultVatRate || 20;
        
        // Seuils d'alerte
        const thresholds = budget.alertThresholds || { warning: 80, danger: 100 };
        const warnInput = document.getElementById('alert-threshold-warning');
        const dangerInput = document.getElementById('alert-threshold-danger');
        if(warnInput) warnInput.value = thresholds.warning;
        if(dangerInput) dangerInput.value = thresholds.danger;
    },
    
    // Sauvegarde le budget
    saveBudget: () => {
        if(!state.data.budget) state.data.budget = {};
        const oldTotal = state.data.budget.total || 0;
        const oldCurrency = state.data.budget.currency || '€';
        const newTotal = parseFloat(document.getElementById('expenses-budget-total').value) || 0;
        const newCurrency = document.getElementById('expenses-currency').value;
        state.data.budget.total = newTotal;
        state.data.budget.currency = newCurrency;
        
        // Synchroniser avec la présentation
        if(!state.data.presentation) state.data.presentation = {};
        state.data.presentation.budget = state.data.budget.total;
        
        // Mettre à jour le champ dans la présentation si visible
        const projectBudgetInput = document.getElementById('project-budget');
        if(projectBudgetInput) projectBudgetInput.value = state.data.budget.total || '';
        
        // Tracer le changement (en major si total changé, en minor si juste devise)
        if(oldTotal !== newTotal) {
            History.log('EDIT', `Budget total : ${oldTotal} ${oldCurrency} → ${newTotal} ${newCurrency}`);
        } else if(oldCurrency !== newCurrency) {
            History.log('EDIT', `Devise budget : ${oldCurrency} → ${newCurrency}`, {}, 'minor');
        }
        
        Store.save();
        Expenses.updateSummary();
    },
    
    // Changer le mode HT/TTC
    setVatMode: (mode) => {
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.vatMode = mode;
        
        // Mettre à jour les boutons
        const btnHT = document.getElementById('vat-mode-ht');
        const btnTTC = document.getElementById('vat-mode-ttc');
        if(btnHT) {
            btnHT.style.background = mode === 'HT' ? 'var(--primary)' : 'var(--bg)';
            btnHT.style.color = mode === 'HT' ? 'white' : 'var(--text-main)';
            btnHT.style.borderColor = mode === 'HT' ? 'var(--primary)' : 'var(--border)';
        }
        if(btnTTC) {
            btnTTC.style.background = mode === 'TTC' ? 'var(--primary)' : 'var(--bg)';
            btnTTC.style.color = mode === 'TTC' ? 'white' : 'var(--text-main)';
            btnTTC.style.borderColor = mode === 'TTC' ? 'var(--primary)' : 'var(--border)';
        }
        
        Store.save();
        ExpensesBudget.loadBudget();
        Expenses.populateCategories();
        Expenses.updateSummary();
    },
    
    // Sauvegarder la TVA par défaut
    saveDefaultVat: () => {
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.defaultVatRate = parseFloat(document.getElementById('expenses-default-vat').value) || 20;
        Store.save();
    },
    
    // Sauvegarder les seuils d'alerte
    saveAlertThresholds: () => {
        // Relit les champs de la fenetre de reglages : sans elle, on ne touche a rien.
        if(!document.getElementById('alert-threshold-warning')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        if(!state.data.budget.alertThresholds) state.data.budget.alertThresholds = {};
        state.data.budget.alertThresholds.warning = parseFloat(document.getElementById('alert-threshold-warning').value) || 80;
        state.data.budget.alertThresholds.danger = parseFloat(document.getElementById('alert-threshold-danger').value) || 100;
        Store.save();
        Expenses.populateCategories();
    },
    
    // Sauvegarde le manager
    saveManager: () => {
        if(!document.getElementById('expenses-manager')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.manager = document.getElementById('expenses-manager').value;
        Store.save();
    },
    
    // Sauvegarde la préférence email du manager global
    saveManagerEmailPref: () => {
        if(!document.getElementById('manager-email-notif')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.managerEmailNotif = document.getElementById('manager-email-notif').checked;
        Store.save();
    },
    
    // ===== FENETRE DE REGLAGES DU BUDGET (31 aout) =====
    // Recueille les quatre blocs sortis de la colonne : seuils d'alerte,
    // responsable global, responsables par categorie CNC et parametres
    // financiers. Les identifiants des champs sont RIGOUREUSEMENT LES MEMES
    // qu'avant : toutes les fonctions de chargement et de sauvegarde existantes
    // continuent de fonctionner sans etre touchees, elles trouvent simplement
    // leurs champs ici au lieu de la colonne.
    // #dept-managers-list retrouve au passage un conteneur : la liste des
    // responsables par categorie rendait dans le vide depuis la refonte
    // precedente (constat de l'audit v575).
    openSettings: () => {
        const ro = (typeof Permissions !== 'undefined' && Permissions.canEdit) ? !Permissions.canEdit('depenses') : false;
        const html = `
            ${ro ? '<div class="perm-ro-banner">\u{1F441} Lecture seule — vous n\'avez pas les droits de modification sur les dépenses.</div>' : ''}
            <div class="expense-section-title" style="margin-top:0;">⚠️ Seuils d'alerte</div>
            <div style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-sec); margin-bottom:6px;">
                <span>Prévenir à</span>
                <input type="number" id="alert-threshold-warning" value="80" class="n8-input-3" onchange="app.Expenses.saveAlertThresholds()">
                <span>% et alerter à</span>
                <input type="number" id="alert-threshold-danger" value="100" class="n8-input-3" onchange="app.Expenses.saveAlertThresholds()">
                <span>% de l'enveloppe</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-sec); margin-bottom:18px;">S'applique à chaque catégorie CNC, pas au budget total.</div>
            
            <div class="expense-section-title">👤 Responsable du budget</div>
            <select id="expenses-manager" class="profile-input w-full" onchange="app.Expenses.saveManager()">
                <option value="">-- Choisir --</option>
            </select>
            <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:0.85rem; color:var(--text-sec); cursor:pointer;">
                <input type="checkbox" id="manager-email-notif" onchange="app.Expenses.saveManagerEmailPref()" checked>
                📧 Recevoir les emails de demande de dépense
            </label>
            <div style="font-size:0.72rem; color:var(--text-sec); margin:6px 0 18px 0;">Seul le responsable peut définir les budgets prévisionnels par catégorie.</div>
            
            <div class="expense-section-title">👥 Responsables par catégorie</div>
            <div style="font-size:0.72rem; color:var(--text-sec); margin-bottom:8px;">Se définissent depuis le ⚙️ de chaque catégorie CNC, dans la colonne de gauche.</div>
            <div id="dept-managers-list" style="margin-bottom:18px;"></div>
            
            <div class="expense-section-title">⚙️ Paramètres financiers</div>
            <div class="finance-params">
                <div class="finance-param-row">
                    <label>🚗 Indemnité km</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-km-rate" step="0.01" placeholder="0.55" data-tooltip="0.55" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">€/km</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>🍽️ Per diem repas</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-perdiem-meal" placeholder="19" data-tooltip="19" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">€/jour</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>🏨 Per diem hébergement</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-perdiem-hotel" placeholder="80" data-tooltip="80" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">€/nuit</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>⏰ Seuil heures sup</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-overtime-threshold" placeholder="8" data-tooltip="8" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">heures</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>📈 Majorations heures sup</label>
                    <div class="finance-param-rates">
                        <input type="number" id="param-overtime-1" placeholder="25" title="Première tranche" onchange="app.Expenses.saveFinanceParams()"><span>%</span>
                        <input type="number" id="param-overtime-2" placeholder="50" title="Deuxième tranche" onchange="app.Expenses.saveFinanceParams()"><span>%</span>
                        <input type="number" id="param-overtime-3" placeholder="100" title="Troisième tranche" onchange="app.Expenses.saveFinanceParams()"><span>%</span>
                    </div>
                </div>
            </div>`;
        
        const overlay = UI.showModal({
            title: ro ? '\u{1F441} Réglages du budget (lecture seule)' : '⚙️ Réglages du budget',
            html: ro ? '<div class="perm-ro-scope is-perm-readonly">' + html + '</div>' : html,
            cancelText: 'Fermer',
            confirmText: 'Fermer'
        });
        // Chaque champ s'enregistre tout seul en sortant : pas de bouton
        // Enregistrer a proposer, il n'aurait rien a faire.
        if(overlay) { const ok = overlay.querySelector('#um-ok'); if(ok) ok.remove(); }
        
        // Les champs viennent d'etre crees : c'est MAINTENANT qu'on les remplit.
        // On passe par la facade Expenses, seule a porter populateManager.
        Expenses.populateManager();
        Expenses.loadBudget();
        Expenses.loadFinanceParams();
        Expenses.loadManagerEmailPref();
        Expenses.renderCategoryManagers();
    },
    
    // Charge la préférence email du manager global
    loadManagerEmailPref: () => {
        const checkbox = document.getElementById('manager-email-notif');
        if(checkbox) {
            checkbox.checked = state.data.budget?.managerEmailNotif !== false; // true par défaut
        }
    },
    
    // Affiche la liste des responsables par catégorie CNC
    renderCategoryManagers: () => {
        const container = document.getElementById('dept-managers-list');
        if(!container) return;
        
        const deptManagers = state.data.budget?.deptManagers || {};
        
        if(Object.keys(deptManagers).length === 0) {
            container.innerHTML = '<div style="color: var(--text-sec); font-size: 0.85rem; padding: 10px; text-align: center;">Aucun responsable assigné</div>';
            return;
        }
        
        let html = '';
        Object.entries(deptManagers).forEach(([catId, manager]) => {
            const cat = Expenses.getCategory(catId);
            if(!cat || !manager.email) return;
            
            const person = ExpensesBudget.findPersonByEmail(manager.email);
            const name = person?.name || manager.email.split('@')[0];
            
            html += `<div class="dept-manager-item">
                <div class="dept-manager-info">
                    <span class="dept-manager-dept">${cat.icon} ${cat.name}</span>
                    <span class="dept-manager-name">${Utils.escape(name)}</span>
                </div>
                <div class="dept-manager-actions">
                    <label title="Recevoir les emails" style="cursor: pointer;">
                        <input type="checkbox" ${manager.emailNotif !== false ? 'checked' : ''} onchange="app.ExpensesBudget.toggleDeptManagerEmail('${catId}', this.checked)">
                        📧
                    </label>
                    <button onclick="app.ExpensesBudget.removeDeptManager('${catId}')" title="Retirer" style="background: none; border: none; cursor: pointer; color: var(--danger);">✕</button>
                </div>
            </div>`;
        });
        
        container.innerHTML = html;
    },
    
    // Alias pour rétrocompatibilité
    renderDeptManagers: () => {
        ExpensesBudget.renderCategoryManagers();
    },
    
    // Trouve une personne par email
    findPersonByEmail: (email) => {
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const allPeople = [...actors, ...crew];
        return allPeople.find(p => p.email === email);
    },
    
    // Supprime un responsable département
    removeDeptManager: async (deptId) => {
        // 31 aout — BUG LATENT REVELE PAR LA REMISE EN SERVICE DE LA LISTE :
        // Expenses.departments n'existe plus depuis le passage aux categories
        // CNC, ce bouton plantait donc au premier clic. Invisible jusqu'ici
        // parce que la liste elle-meme rendait dans le vide.
        const dept = Expenses.getCategory(deptId);
        if(!await ConfirmModal.confirmDelete(`Le responsable de ${dept?.name || 'cette catégorie'} sera retiré.`)) return;
        
        if(state.data.budget?.deptManagers) {
            delete state.data.budget.deptManagers[deptId];
            Store.save();
            ExpensesBudget.renderDeptManagers();
            Utils.toast('Responsable retiré', 'success');
        }
    },
    
    // Toggle email notification pour un responsable département
    toggleDeptManagerEmail: (deptId, enabled) => {
        if(state.data.budget?.deptManagers?.[deptId]) {
            state.data.budget.deptManagers[deptId].emailNotif = enabled;
            Store.save();
        }
    },
    
    // Vérifie si l'utilisateur est responsable d'un département
    isDeptManager: (deptId) => {
        const manager = state.data.budget?.deptManagers?.[deptId];
        return manager && manager.email === state.currentUser?.email;
    },
    
    // Sauvegarde les paramètres financiers
    saveFinanceParams: () => {
        // Cette sauvegarde RELIT LES CHAMPS de la fenetre de reglages : ne
        // l'appeler que depuis cette fenetre (regle de l'etape 6). Si elle
        // n'est pas ouverte, on ne touche a rien plutot que d'ecraser les
        // valeurs par des zeros.
        if(!document.getElementById('param-km-rate')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        
        state.data.budget.kmRate = parseFloat(document.getElementById('param-km-rate').value) || 0.55;
        state.data.budget.perDiemMeal = parseFloat(document.getElementById('param-perdiem-meal').value) || 19;
        state.data.budget.perDiemHotel = parseFloat(document.getElementById('param-perdiem-hotel').value) || 80;
        state.data.budget.overtimeThreshold = parseFloat(document.getElementById('param-overtime-threshold').value) || 8;
        state.data.budget.overtimeRates = {
            first: parseFloat(document.getElementById('param-overtime-1').value) || 25,
            second: parseFloat(document.getElementById('param-overtime-2').value) || 50,
            third: parseFloat(document.getElementById('param-overtime-3').value) || 100
        };
        
        Store.save();
        Utils.toast('Paramètres financiers enregistrés', 'success');
    },
    
    // Charge les paramètres financiers
    // 31 aout : les champs vivent desormais dans la fenetre de reglages, qui
    // n'existe pas tant qu'on ne l'a pas ouverte. Chaque lecture est donc
    // protegee — sans quoi l'ouverture de l'onglet plantait.
    loadFinanceParams: () => {
        const budget = state.data.budget || {};
        const put = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
        
        put('param-km-rate', budget.kmRate ?? 0.55);
        put('param-perdiem-meal', budget.perDiemMeal ?? 19);
        put('param-perdiem-hotel', budget.perDiemHotel ?? 80);
        put('param-overtime-threshold', budget.overtimeThreshold ?? 8);
        
        const rates = budget.overtimeRates || { first: 25, second: 50, third: 100 };
        put('param-overtime-1', rates.first ?? 25);
        put('param-overtime-2', rates.second ?? 50);
        put('param-overtime-3', rates.third ?? 100);
    },
    
    // Éditer le budget prévisionnel d'une catégorie CNC
    editCategoryBudget: (catId) => {
        const cat = Expenses.getCategory(catId);
        if(!cat) return;
        
        // Seul le responsable budget peut modifier
        if(!ExpensesBudget.isBudgetManager()) {
            Utils.toast('Seul le responsable budget peut modifier les prévisionnels', 'error');
            return;
        }
        
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const current = state.data.budget?.previsionnel?.[catId] || { budgetHT: 0, budgetTTC: 0 };
        const currentManager = state.data.budget?.deptManagers?.[catId] || {};
        
        // Liste des personnes pour le responsable
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const allPeople = [...actors, ...crew].filter(p => p.email);
        
        let peopleOptions = '<option value="">-- Aucun responsable --</option>';
        allPeople.forEach(p => {
            const selected = currentManager.email === p.email ? 'selected' : '';
            peopleOptions += `<option value="${Utils.escape(p.email)}" ${selected}>${Utils.escape(p.name)} (${Utils.escape(p.email)})</option>`;
        });
        
        // Sous-catégories
        let subcatHtml = '<div style="margin-top:15px; padding-top:15px; border-top:1px solid var(--border);"><label style="font-size:0.85rem; color:var(--text-sec); display:block; margin-bottom:8px;">📂 Sous-catégories</label>';
        cat.subcats.forEach(sub => {
            subcatHtml += `<div style="font-size:0.85rem; color:var(--text-main); padding:4px 0;">• ${Utils.escape(sub.name)}</div>`;
        });
        subcatHtml += '</div>';
        
        const modal = document.createElement('div');
        modal.id = 'category-budget-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div style="background:var(--panel-bg); border-radius:12px; padding:25px; width:450px; max-width:90%; max-height:90vh; overflow-y:auto;">
                <h3 style="margin:0 0 20px; color:var(--text-main);">${cat.icon} ${cat.code}. ${cat.name}</h3>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                    <div>
                        <label class="form-label-alt">💰 Budget HT (${currency})</label>
                        <input type="number" id="cat-budget-ht" value="${current.budgetHT || ''}" placeholder="0" data-tooltip="0" class="n8-input-11" oninput="document.getElementById('cat-budget-ttc').value = Math.round(this.value * 1.2 * 100) / 100">
                    </div>
                    <div>
                        <label class="form-label-alt">💰 Budget TTC (${currency})</label>
                        <input type="number" id="cat-budget-ttc" value="${current.budgetTTC || ''}" placeholder="0" data-tooltip="0" class="n8-input-11" oninput="document.getElementById('cat-budget-ht').value = Math.round(this.value / 1.2 * 100) / 100">
                    </div>
                </div>
                
                <div class="mb-15">
                    <label class="form-label-alt">👤 Responsable de la catégorie</label>
                    <select id="cat-manager" class="n8-input-12">
                        ${peopleOptions}
                    </select>
                </div>
                
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:15px; font-size:0.9rem; cursor:pointer; color:var(--text-main);">
                    <input type="checkbox" id="cat-manager-email" ${currentManager.emailNotif !== false ? 'checked' : ''}>
                    📧 Notifier par email
                </label>
                
                ${subcatHtml}
                
                <div class="flex-end-mt20">
                    <button onclick="document.getElementById('category-budget-modal').remove()" class="btn btn--outline">Annuler</button>
                    <button onclick="app.ExpensesBudget.saveCategoryBudget('${catId}')" class="btn btn--success">💾 Enregistrer</button>
                </div>
            </div>
        `;
        
        // Marque la modale comme ouverte POUR CE PROJET ET CETTE CATEGORIE :
        // saveCategoryBudget relit ses quatre champs et n'a de sens que sur la
        // modale reellement affichee. Voir la garde en tete de cette fonction.
        ExpensesBudget._budgetModalFor = (state.currentProjectId || '') + '|' + catId;
        
        document.body.appendChild(modal);
        document.getElementById('cat-budget-ht').focus();
    },
    
    // Sauvegarder le budget d'une catégorie
    saveCategoryBudget: (catId) => {
        // GARDE : cette fonction relit les champs d'une modale creee a la volee
        // par editCategoryBudget. Appelee sans elle (ou apres un changement de
        // projet, ou sur une autre categorie que celle ouverte), elle plantait
        // sur un champ absent ou ecrivait le budget du projet precedent dans le
        // suivant. Pour ecrire un previsionnel depuis ailleurs : ecriture
        // ciblee sur state.data.budget.previsionnel, puis Store.save().
        if(ExpensesBudget._budgetModalFor !== (state.currentProjectId || '') + '|' + catId
           || !document.getElementById('cat-budget-ht')) {
            console.warn('[ExpensesBudget] saveCategoryBudget() ignoré : modale non ouverte pour ce projet/cette catégorie.');
            return;
        }
        
        const budgetHT = parseFloat(document.getElementById('cat-budget-ht').value) || 0;
        const budgetTTC = parseFloat(document.getElementById('cat-budget-ttc').value) || 0;
        const managerEmail = document.getElementById('cat-manager').value;
        const managerEmailNotif = document.getElementById('cat-manager-email').checked;
        
        if(!state.data.budget) state.data.budget = {};
        if(!state.data.budget.previsionnel) state.data.budget.previsionnel = {};
        if(!state.data.budget.deptManagers) state.data.budget.deptManagers = {};
        
        // Sauvegarder le prévisionnel
        state.data.budget.previsionnel[catId] = { budgetHT, budgetTTC };
        
        // Sauvegarder le responsable
        if(managerEmail) {
            state.data.budget.deptManagers[catId] = {
                email: managerEmail,
                emailNotif: managerEmailNotif,
                assignedAt: state.data.budget.deptManagers[catId]?.assignedAt || new Date().toISOString(),
                assignedBy: state.data.budget.deptManagers[catId]?.assignedBy || state.currentUser?.email
            };
        } else {
            delete state.data.budget.deptManagers[catId];
        }
        
        // Recalculer le budget total
        let totalHT = 0;
        Object.values(state.data.budget.previsionnel).forEach(p => {
            totalHT += p.budgetHT || 0;
        });
        state.data.budget.total = totalHT;
        
        Store.save();
        
        document.getElementById('category-budget-modal').remove();
        Expenses.populateCategories();
        Expenses.updateSummary();
        ExpensesBudget.loadBudget();
        Utils.toast('Budget de la catégorie mis à jour !', 'success');
    },
    
    isBudgetManager: () => {
        // Le propriétaire du projet a toujours accès
        if(state.currentRole === 'owner') return true;
        
        // Vérifier si l'utilisateur est le responsable budget
        const managerEmail = state.data.budget?.manager;
        if(!managerEmail || !state.currentUser) return false;
        
        return state.currentUser.email === managerEmail;
    },
};
