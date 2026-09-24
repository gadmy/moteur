
const ExpensesSalaries = {
    // ===================== SALAIRES (refonte 8e, 25 aout) =====================
    // Le calcul « qui a travaille combien de jours, a quel tarif » etait ecrit
    // TROIS fois dans ce module (total, tableau, generation), avec des variantes :
    // la moindre correction devait etre reportee a trois endroits sous peine de
    // faire diverger l'estimation et la depense generee. Une seule source
    // desormais : ExpensesSalaries.rows().
    // Un salaire est une FICHE PAR PERSONNE (demande de Guillaume) : la grande
    // section de generation en masse disparait au profit d'une grille de cartes,
    // chacune portant sa propre generation. Generer pour tout le monde d'un bloc
    // obligeait a tout supprimer pour corriger une seule ligne.
    
    // Jours et heures travailles par personne, lus dans les feuilles de service.
    _daysByPerson: () => {
        const out = {};
        (state.data.shootingDays || []).forEach(day => {
            if(!day || !day.callSheet || !day.callSheet.length) return;
            day.callSheet.forEach(call => {
                if(!call || !call.personId) return;
                const key = call.type + '_' + call.personId;
                if(!out[key]) out[key] = { type: call.type, personId: call.personId, days: 0, hours: 0 };
                out[key].days++;
                if(call.callTime && day.estimatedWrap) {
                    const st = String(call.callTime).split(':').map(Number);
                    const en = String(day.estimatedWrap).split(':').map(Number);
                    const h = (en[0] + en[1] / 60) - (st[0] + st[1] / 60);
                    if(h > 0) out[key].hours += h;
                }
            });
        });
        return out;
    },
    
    // UNE ligne par personne convoquee, tarif connu ou non. C'est la source
    // unique : le total, les cartes et la generation en descendent tous.
    rows: () => {
        const currency = state.data.budget?.currency || '€';
        const dbp = ExpensesSalaries._daysByPerson();
        const expenses = state.data.expenses || [];
        const list = [];
        const push = (person, type, icon) => {
            if(!person || !person.name) return;
            const d = dbp[type + '_' + person.id];
            if(!d || !d.days) return;
            const rate = Pay.cost(person);
            const hasRate = rate > 0;
            const rateType = person.rateType || 'Jour';
            let amount = 0, detail = '';
            if(hasRate && rateType === 'Heure' && d.hours > 0) {
                amount = rate * d.hours;
                detail = d.hours.toFixed(1) + 'h × ' + rate + ' ' + currency + '/h';
            } else if(hasRate) {
                amount = rate * d.days;
                detail = d.days + ' jour' + (d.days > 1 ? 's' : '') + ' × ' + rate + ' ' + currency;
            } else {
                detail = d.days + ' jour' + (d.days > 1 ? 's' : '') + ' — tarif à définir';
            }
            const expense = expenses.find(e => e && e.salaryPersonId === person.id && e.salaryPersonType === type) || null;
            list.push({ person, type, icon, days: d.days, hours: d.hours, rate, hasRate, amount, detail, expense });
        };
        (state.data.actors || []).forEach(a => push(a, 'actor', '🎭'));
        (state.data.crew || []).forEach(c => push(c, 'crew', '🎬'));
        return list;
    },
    
    // Total des salaires estimes. skipAlreadyBilled ignore les personnes dont la
    // depense est deja generee ET validee : sans cela l'estimation du planning
    // s'ajoutait a la depense generee et le poste comptait double.
    calculateSalariesTotal: (skipAlreadyBilled) => {
        return ExpensesSalaries.rows().reduce((sum, r) => {
            if(!r.hasRate) return sum;
            if(skipAlreadyBilled && r.expense && (r.expense.status === 'approved' || r.expense.status === 'done')) return sum;
            return sum + r.amount;
        }, 0);
    },
    
    _sort: 'alpha',
    setSort: (mode) => { ExpensesSalaries._sort = mode; ExpensesSalaries.renderSalaries(); },
    
    // Grille de fiches, une par personne convoquee. Meme format compact que les
    // depenses et les autres onglets. Clic : la depense generee si elle existe
    // (pour la corriger), sinon la fiche de la personne (pour y poser le tarif
    // qui manque) — dans les deux cas, l'endroit ou l'on peut agir.
    renderSalaries: () => {
        const container = document.getElementById('expenses-salaries-list');
        const totalEl = document.getElementById('expenses-salaries-total');
        if(!container) return;
        const currency = state.data.budget?.currency || '€';
        let rows = ExpensesSalaries.rows();
        const total = rows.reduce((s, r) => s + (r.hasRate ? r.amount : 0), 0);
        if(totalEl) totalEl.textContent = total.toLocaleString() + ' ' + currency;
        
        if(!rows.length) {
            container.innerHTML = '<div style="color: var(--text-sec); text-align: center; padding: 14px;">Aucun salaire à calculer : personne n’est encore convoqué sur un jour de tournage.</div>';
            return;
        }
        
        const mode = ExpensesSalaries._sort || 'alpha';
        const byName = (a, b) => String(a.person.name || '').localeCompare(String(b.person.name || ''), 'fr');
        if(mode === 'montant') rows = rows.slice().sort((a, b) => (b.amount - a.amount) || byName(a, b));
        else if(mode === 'jours') rows = rows.slice().sort((a, b) => (b.days - a.days) || byName(a, b));
        else rows = rows.slice().sort(byName);
        
        const nMissing = rows.filter(r => !r.hasRate).length;
        const nToGen = rows.filter(r => !r.expense).length;
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (mode === 'alpha' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (mode === 'metier' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'metier\')">Par métier</button>'
            + '<button class="chub-sort-btn ' + (mode === 'montant' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'montant\')">Par montant</button>'
            + '<button class="chub-sort-btn ' + (mode === 'jours' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'jours\')">Par jours</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + rows.length + ' personne' + (rows.length > 1 ? 's' : '')
            + (nToGen ? ' • ' + nToGen + ' à générer' : '')
            + (nMissing ? ' • ⚠️ ' + nMissing + ' sans tarif' : '') + '</span></div>';
        
        let body;
        if(mode === 'metier') {
            // Les groupes d'equipe sont crees par l'utilisateur : sections
            // alphabetiques, comediens d'abord puisqu'ils ne portent pas de groupe.
            const groups = {};
            rows.forEach(r => {
                let cat;
                if(r.type === 'actor') cat = 'Comédien·nes';
                else {
                    const g = (state.data.groups || []).find(x => x.id === r.person.department);
                    cat = g ? g.name : 'Équipe technique';
                }
                (groups[cat] = groups[cat] || []).push(r);
            });
            const cats = Object.keys(groups).sort((a, b) => {
                if(a.indexOf('Comédien') === 0) return -1;
                if(b.indexOf('Comédien') === 0) return 1;
                return a.localeCompare(b, 'fr');
            });
            body = cats.map(c => '<div class="group-section"><div class="group-header">' + Utils.escape(c)
                + '<span class="ccol-group-count">' + groups[c].length + '</span></div>'
                + '<div class="compact-cards-grid">' + groups[c].sort(byName).map(ExpensesSalaries._cardHTML).join('') + '</div></div>').join('');
        } else {
            body = '<div class="compact-cards-grid">' + rows.map(ExpensesSalaries._cardHTML).join('') + '</div>';
        }
        container.innerHTML = toolbar + body;
    },
    
    _cardHTML: (r) => {
        const currency = state.data.budget?.currency || '€';
        const p = r.person;
        const photo = p.photo ? '<img src="' + p.photo + '" alt="Photo">' : r.icon;
        // Trois etats lisibles d'un coup d'oeil : tarif manquant (rouge), depense
        // deja generee (badge de son statut), rien encore genere.
        const stEmoji = { pending: '⏳', approved: '✅', rejected: '❌', done: '💰', escalated: '⬆️', returned: '↩️' };
        const edge = !r.hasRate ? 'border-left:3px solid var(--danger);' : (r.expense ? '' : 'border-left:3px solid var(--border);');
        const badge = r.expense
            ? '<div class="compact-card-badge" title="Dépense générée">' + (stEmoji[r.expense.status] || '•') + '</div>'
            : '';
        const open = r.expense
            ? "app.Expenses.editExpense('" + r.expense.id + "')"
            : "app.UI.openFiche('" + (r.type === 'actor' ? 'actor' : 'crew') + "', '" + p.id + "')";
        const actions = '<div class="compact-card-actions">'
            + '<button class="edit-btn" title="' + (r.expense ? 'Regénérer la dépense depuis le planning' : 'Générer la dépense') + '" onclick="event.stopPropagation(); app.Expenses.generateSalaryFor(\'' + r.type + '\',\'' + p.id + '\')">↻</button>'
            + (r.expense ? '<button class="delete-btn" title="Supprimer la dépense générée" onclick="event.stopPropagation(); app.Expenses.removeSalaryFor(\'' + r.type + '\',\'' + p.id + '\')">🗑️</button>' : '')
            + '</div>';
        return '<div class="compact-card" style="' + edge + '" onclick="' + open + '" title="' + Utils.escape(p.name || '') + '">'
            + actions + badge
            + '<div class="compact-card-photo">' + photo + '</div>'
            + '<div class="compact-card-name">' + Utils.escape(p.name || 'Sans nom') + '</div>'
            + '<div class="compact-card-role" style="font-weight:700; color:' + (r.hasRate ? 'var(--primary)' : 'var(--danger)') + ';">'
            + (r.hasRate ? (Math.round(r.amount).toLocaleString() + ' ' + currency) : '⚠️ Tarif manquant') + '</div>'
            + '<div class="compact-card-role" style="font-size:0.72rem;">' + Utils.escape(r.detail) + '</div>'
            + '<div class="compact-card-role" style="font-size:0.72rem;">' + (r.expense ? 'Dépense générée' : 'Pas encore générée') + '</div>'
            + '</div>';
    },
    
    // Genere OU met a jour la depense salaire d'UNE personne. Regenerer ecrase
    // le montant, la description et le nombre de jours, mais conserve
    // l'identifiant, le statut, les pieces jointes et l'historique de validation :
    // regenerer apres l'ajout d'un jour de tournage ne doit pas faire repasser la
    // depense en attente ni perdre son justificatif.
    generateSalaryFor: (type, personId) => {
        if(!Expenses.isBudgetManager()) { Utils.toast('Seul le responsable budget peut générer les salaires', 'error'); return; }
        const r = ExpensesSalaries.rows().find(x => x.type === type && String(x.person.id) === String(personId));
        if(!r) { Utils.toast('Cette personne n’est convoquée sur aucun jour de tournage.', 'info'); return; }
        if(!state.data.expenses) state.data.expenses = [];
        const isActor = type === 'actor';
        if(r.expense) {
            const e = r.expense;
            e.title = 'Salaire - ' + r.person.name;
            e.amountHT = r.amount; e.amountTTC = r.amount; e.amount = r.amount; e.vatRate = 0;
            e.description = r.detail;
            e.salaryMissingRate = !r.hasRate;
            e.updatedAt = new Date().toISOString();
            Store.save();
            Expenses.render();
            Utils.toast('Salaire de ' + r.person.name + ' recalculé', 'success');
            return;
        }
        state.data.expenses.push({
            id: Utils.generateUniqueId(),
            title: 'Salaire - ' + r.person.name,
            amountHT: r.amount, vatRate: 0, amountTTC: r.amount, amount: r.amount,
            category: isActor ? 'interpretation' : 'personnel',
            subcategory: isActor ? 'interpretation_principaux' : 'personnel_technique',
            department: isActor ? 'interpretation' : 'personnel',
            description: r.detail,
            status: 'pending',
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser?.email,
            createdByName: state.userProfile?.displayName || state.currentUser?.email?.split('@')[0],
            salaryPersonId: r.person.id,
            salaryPersonType: type,
            salaryMissingRate: !r.hasRate
        });
        Store.save();
        Expenses.render();
        Utils.toast('Salaire de ' + r.person.name + ' généré' + (r.hasRate ? '' : ' (tarif à compléter)'), r.hasRate ? 'success' : 'info');
    },
    
    // Supprime la depense salaire d'UNE personne. L'ancienne suppression en masse
    // effacait les depenses salaires de tout le projet d'un seul bouton, sans
    // moyen de n'en corriger qu'une.
    removeSalaryFor: async (type, personId) => {
        if(!Expenses.isBudgetManager()) { Utils.toast('Seul le responsable budget peut supprimer les dépenses salaires', 'error'); return; }
        const list = state.data.expenses || [];
        const i = list.findIndex(e => e && e.salaryPersonType === type && String(e.salaryPersonId) === String(personId));
        if(i < 0) return;
        if(!await ConfirmModal.confirmDelete('La dépense salaire de cette personne sera supprimée. Le calcul, lui, reste disponible.', 'Supprimer cette dépense salaire ?')) return;
        list.splice(i, 1);
        Store.save();
        Expenses.render();
        Utils.toast('Dépense salaire supprimée', 'success');
    }
};
