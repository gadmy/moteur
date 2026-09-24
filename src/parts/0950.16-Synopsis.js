
const Synopsis = {
    // Table type -> { key (state.data), editorId }. Une entree = un champ de
    // l'onglet. Ajouter un champ = une ligne ici + le HTML de sa section.
    FIELDS: {
        synopsis: { key: 'synopsis', editorId: 'synopsisEditor' },
        short:    { key: 'synopsisShort', editorId: 'shortEditor' },
        long:     { key: 'synopsisLong', editorId: 'longEditor' },
        intent:   { key: 'synopsisIntent', editorId: 'intentEditor' },
        director: { key: 'directorNote', editorId: 'directorEditor' },
        producer: { key: 'producerNote', editorId: 'producerEditor' }
    },
    // Champs optionnels : grises dans la nav tant qu'on n'a pas clique dessus
    // au moins une fois (ou qu'ils ont deja du contenu).
    OPTIONAL_FIELDS: ['intent', 'director', 'producer'],

    getEditor: (type) => document.getElementById((Synopsis.FIELDS[type] || Synopsis.FIELDS.synopsis).editorId),
    
    _saveTimer: null,
    _savedRange: null,
    _activeSection: 'synopsis',
    _focusedBlockId: null,
    _focusedType: null,
    
    // Bascule l'affichage entre les sections
    switchSection: (target) => {
        Synopsis._clearDeleteHandles();
        Synopsis._activeSection = target;
        document.querySelectorAll('.synopsis-section').forEach(sec => {
            if(sec.dataset.section === target) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });
        document.querySelectorAll('.synopsis-nav-btn').forEach(btn => {
            if(btn.dataset.target === target) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        // Mettre à jour tous les compteurs au switch
        Synopsis.updateCounts();
    },

    // Champ optionnel (intention/realisateur/producteur) : grise dans la nav
    // tant qu'il est vide, degrise dès le premier caractere ecrit, regrise si
    // on efface tout le contenu. Base uniquement sur le contenu — pas de flag
    // "deja consulte" persiste.
    refreshDormant: (type) => {
        if(!Synopsis.OPTIONAL_FIELDS.includes(type)) return;
        const f = Synopsis.FIELDS[type];
        const hasContent = !!(state.data[f.key] && String(state.data[f.key]).replace(/<[^>]+>/g, '').trim());
        const btn = document.querySelector(`.synopsis-nav-btn[data-target="${type}"]`);
        if(btn) btn.classList.toggle('is-dormant', !hasContent);
    },
    // Applique l'etat grise/actif de chaque champ optionnel au chargement.
    applyDormantState: () => {
        Synopsis.OPTIONAL_FIELDS.forEach(type => Synopsis.refreshDormant(type));
    },
    
    // Met à jour les compteurs de caractères dans la sidebar
    updateCounts: () => {
        Object.keys(Synopsis.FIELDS).forEach(type => {
            const editor = Synopsis.getEditor(type);
            const countEl = document.getElementById('synopsis-count-' + type);
            if(editor && countEl) {
                let text = '';
                editor.querySelectorAll('.syn-block-content').forEach(c => { text += (c.innerText || c.textContent || ''); });
                text = text.trim();
                const n = text.length;
                countEl.textContent = n === 0 ? '0 caractère' : (n === 1 ? '1 caractère' : n.toLocaleString('fr-FR') + ' caractères');
            }
        });
    },
    
    saveSelection: () => {
        const sel = window.getSelection();
        if(sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // Vérifier que la sélection est dans un bloc de texte éditable
            const container = range.commonAncestorContainer;
            const box = container.nodeType === 3 ? container.parentElement : container;
            if(box && box.closest && box.closest('.syn-block-content')) {
                Synopsis._savedRange = range.cloneRange();
            }
        }
    },
    
    restoreSelection: () => {
        if(Synopsis._savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(Synopsis._savedRange);
        }
    },
    
    save: (type, notify = false) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        
        const key = (Synopsis.FIELDS[type] || Synopsis.FIELDS.synopsis).key;
        const parts = [];
        Array.from(editor.children).forEach(blockEl => {
            if(!blockEl.classList || !blockEl.classList.contains('syn-block')) return;
            const contentEl = blockEl.querySelector('.syn-block-content');
            const blockType = blockEl.dataset.blockType || 'text';
            parts.push('<div class="syn-block" data-block-type="' + blockType + '">' + (contentEl ? contentEl.innerHTML : '') + '</div>');
        });
        state.data[key] = parts.join('');
        
        Synopsis.refreshDormant(type);
        Synopsis.updateBoard();
        
        clearTimeout(Synopsis._saveTimer);
        Synopsis._saveTimer = setTimeout(() => Store.save(), 500);
        
        if(notify) Utils.notifyImpact('synopsis', 'board');
    },
    
    load: (type) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        
        const key = (Synopsis.FIELDS[type] || Synopsis.FIELDS.synopsis).key;
        let content = state.data[key] || '';
        if(content && !content.includes('<')) {
            content = content.split('\n').filter(l => l.trim()).map(l => '<p>' + l + '</p>').join('');
        }
        let blocks = Synopsis._blocksFromHtml(content);
        if(blocks.length === 0) blocks = [{ id: Utils.generateUniqueId(), type: 'text', html: '' }];
        Synopsis.renderBlocks(type, blocks);
    },
    
    // v595 : blocs réordonnables (texte / image / tableau) au lieu d'un
    // unique champ contenteditable. Chaque bloc est enveloppé, une fois
    // sauvegardé, dans <div class="syn-block" data-block-type="...">...</div> ;
    // l'ordre des div = l'ordre des blocs (et donc l'ordre du texte brut
    // affiché dans la colonne du séquencier, qui lit ce même champ).
    _blocksFromHtml: (html) => {
        if(!html) return [];
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const blockEls = Array.from(temp.children).filter(c => c.classList && c.classList.contains('syn-block'));
        if(blockEls.length === 0) return Synopsis._migrateLegacyHtml(html);
        return blockEls.map(el => ({
            id: Utils.generateUniqueId(),
            type: el.dataset.blockType || 'text',
            html: el.innerHTML
        }));
    },
    
    // Ancien format (un seul bloc de HTML continu, sans enveloppe de bloc) :
    // on découpe au niveau des tableaux et des images pour obtenir des blocs
    // dès le premier chargement, plutôt que de tout regrouper dans un seul
    // gros bloc texte.
    _migrateLegacyHtml: (html) => {
        const blocks = [];
        if(!html) return blocks;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        let currentText = document.createElement('div');
        const flushText = () => {
            if(currentText.innerHTML.trim()) {
                blocks.push({ id: Utils.generateUniqueId(), type: 'text', html: currentText.innerHTML });
            }
            currentText = document.createElement('div');
        };
        Array.from(temp.childNodes).forEach(node => {
            if(node.nodeType === 1 && node.tagName === 'TABLE') {
                flushText();
                blocks.push({ id: Utils.generateUniqueId(), type: 'table', html: node.outerHTML });
                return;
            }
            if(node.nodeType === 1 && node.tagName === 'IMG') {
                flushText();
                blocks.push({ id: Utils.generateUniqueId(), type: 'image', html: node.outerHTML });
                return;
            }
            // Un noeud P ou DIV qui ne contient QUE une image (cas frequent de
            // document.execCommand('insertImage')) devient aussi un bloc image.
            if(node.nodeType === 1 && (node.tagName === 'P' || node.tagName === 'DIV')) {
                const onlyChild = node.childNodes.length === 1 ? node.childNodes[0] : null;
                const textContent = (node.textContent || '').trim();
                if(onlyChild && onlyChild.nodeType === 1 && onlyChild.tagName === 'IMG' && !textContent) {
                    flushText();
                    blocks.push({ id: Utils.generateUniqueId(), type: 'image', html: onlyChild.outerHTML });
                    return;
                }
            }
            currentText.appendChild(node.cloneNode(true));
        });
        flushText();
        return blocks;
    },
    
    _blockIcon: (type) => ({ text: '📝', image: '🖼️', table: '▦' })[type] || '📝',
    
    renderBlocks: (type, blocks) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        editor.innerHTML = '';
        blocks.forEach((block, idx) => {
            editor.appendChild(Synopsis._buildBlockEl(type, block, idx));
        });
    },
    
    _buildBlockEl: (type, block, idx) => {
        const el = document.createElement('div');
        el.className = 'syn-block';
        el.dataset.blockId = block.id;
        el.dataset.blockType = block.type;
        // Le bloc entier n'est PAS draggable (ça interfèrerait avec la
        // sélection de texte à la souris dans le contenu éditable) : seule la
        // poignée ⋮⋮ ci-dessous déclenche le glisser.
        
        const header = document.createElement('div');
        header.className = 'syn-block-header';
        header.innerHTML = '<span class="syn-block-drag" title="Glisser pour réordonner">⋮⋮</span>'
            + '<span class="syn-block-num">' + (idx + 1) + '</span>'
            + '<span class="syn-block-type-icon">' + Synopsis._blockIcon(block.type) + '</span>'
            + '<button type="button" class="syn-block-del" title="Supprimer ce bloc">🗑️</button>';
        const delBtn = header.querySelector('.syn-block-del');
        delBtn.onmousedown = (e) => e.preventDefault();
        delBtn.onclick = (e) => { e.stopPropagation(); Synopsis.deleteBlock(type, block.id); };
        const dragHandle = header.querySelector('.syn-block-drag');
        dragHandle.draggable = true;
        
        const content = document.createElement('div');
        content.className = 'syn-block-content';
        content.innerHTML = block.html;
        if(block.type === 'text' || block.type === 'table') {
            content.contentEditable = 'true';
            content.addEventListener('input', () => Synopsis.save(type));
            content.addEventListener('focus', () => { Synopsis._focusedBlockId = block.id; Synopsis._focusedType = type; });
            content.addEventListener('keyup', () => Synopsis.saveSelection());
            content.addEventListener('mouseup', () => Synopsis.saveSelection());
            content.addEventListener('paste', (e) => Synopsis._handlePaste(e));
        }
        
        el.appendChild(header);
        el.appendChild(content);
        
        // Glisser-déposer pour réordonner les blocs (déclenché depuis la poignée)
        dragHandle.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', 'synblock:' + block.id);
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('syn-block-dragging');
        });
        dragHandle.addEventListener('dragend', () => el.classList.remove('syn-block-dragging'));
        el.addEventListener('dragover', (e) => {
            if(!e.dataTransfer.types.includes('text/plain')) return;
            e.preventDefault();
            el.classList.add('syn-block-drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('syn-block-drag-over'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('syn-block-drag-over');
            const data = e.dataTransfer.getData('text/plain');
            if(!data || !data.startsWith('synblock:')) return;
            const fromId = data.slice(9);
            if(fromId === block.id) return;
            Synopsis._reorderBlock(type, fromId, block.id);
        });
        
        return el;
    },
    
    _handlePaste: (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        if(html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            temp.querySelectorAll('*').forEach(el => {
                el.removeAttribute('style');
                el.removeAttribute('class');
            });
            document.execCommand('insertHTML', false, temp.innerHTML);
        } else {
            document.execCommand('insertText', false, text);
        }
    },
    
    _renumberBlocks: (type) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        editor.querySelectorAll('.syn-block').forEach((el, idx) => {
            const numEl = el.querySelector('.syn-block-num');
            if(numEl) numEl.textContent = idx + 1;
        });
    },
    
    _reorderBlock: (type, fromId, toId) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        const fromEl = editor.querySelector('.syn-block[data-block-id="' + fromId + '"]');
        const toEl = editor.querySelector('.syn-block[data-block-id="' + toId + '"]');
        if(!fromEl || !toEl) return;
        editor.insertBefore(fromEl, toEl);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
    },
    
    // Insère un élément bloc après le bloc actuellement focus dans ce champ
    // (ou à la fin si aucun bloc n'a le focus)
    _insertBlockEl: (type, el) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        if(Synopsis._focusedType === type && Synopsis._focusedBlockId) {
            const afterEl = editor.querySelector('.syn-block[data-block-id="' + Synopsis._focusedBlockId + '"]');
            if(afterEl) {
                if(afterEl.nextSibling) editor.insertBefore(el, afterEl.nextSibling);
                else editor.appendChild(el);
                return;
            }
        }
        editor.appendChild(el);
    },
    
    addTextBlock: (type) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        const block = { id: Utils.generateUniqueId(), type: 'text', html: '' };
        const el = Synopsis._buildBlockEl(type, block, 0);
        Synopsis._insertBlockEl(type, el);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
        const contentEl = el.querySelector('.syn-block-content');
        if(contentEl) contentEl.focus();
    },
    
    deleteBlock: (type, blockId) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        const el = editor.querySelector('.syn-block[data-block-id="' + blockId + '"]');
        if(!el) return;
        el.remove();
        if(!editor.querySelector('.syn-block')) {
            // Ne jamais laisser le champ sans aucun bloc : un bloc texte vide
            // reste toujours disponible pour reprendre l'écriture.
            editor.appendChild(Synopsis._buildBlockEl(type, { id: Utils.generateUniqueId(), type: 'text', html: '' }, 0));
        } else {
            Synopsis._renumberBlocks(type);
        }
        Synopsis.save(type, true);
    },
    
    render: (type) => { Synopsis.load(type); },
    renderTree: (type) => { Synopsis.load(type); },
    
    updateBoard: () => {
        const strip = (html) => { if(!html) return '(Vide)'; const d = document.createElement('div'); d.innerHTML = html; return d.innerText.trim() || '(Vide)'; };
        if(els.boardSynopsis) els.boardSynopsis.innerText = strip(state.data.synopsis);
        if(els.boardShort) els.boardShort.innerText = strip(state.data.synopsisShort);
        if(els.boardLong) els.boardLong.innerText = strip(state.data.synopsisLong);
        if(els.boardIntent) els.boardIntent.innerText = strip(state.data.synopsisIntent);
        if(els.boardDirector) els.boardDirector.innerText = strip(state.data.directorNote);
        if(els.boardProducer) els.boardProducer.innerText = strip(state.data.producerNote);
    },
    
    exec: (cmd, value = null) => {
        Synopsis.restoreSelection();
        document.execCommand(cmd, false, value);
        Synopsis.saveSelection();
    },
    
    formatBlock: (tag, type) => {
        if(!tag) return;
        Synopsis.restoreSelection();
        document.execCommand('formatBlock', false, '<' + tag + '>');
        Synopsis.saveSelection();
    },
    
    insertImage: (type) => {
        const url = prompt('URL de l\'image :');
        if(!url) return;
        const block = { id: Utils.generateUniqueId(), type: 'image', html: '<img src="' + Utils.escape(url) + '">' };
        const el = Synopsis._buildBlockEl(type, block, 0);
        Synopsis._insertBlockEl(type, el);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
    },
    
    insertTable: (type) => {
        const rows = parseInt(prompt('Nombre de lignes :', '3')) || 3;
        const cols = parseInt(prompt('Nombre de colonnes :', '3')) || 3;
        let html = '<table><thead><tr>';
        for(let c = 0; c < cols; c++) html += '<th>En-tête</th>';
        html += '</tr></thead><tbody>';
        for(let r = 0; r < rows - 1; r++) {
            html += '<tr>';
            for(let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        const block = { id: Utils.generateUniqueId(), type: 'table', html: html };
        const el = Synopsis._buildBlockEl(type, block, 0);
        Synopsis._insertBlockEl(type, el);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
    },
    
    // v595 : le clic droit natif du navigateur ne supprime ni un tableau ni
    // une image de façon fiable en contenteditable. Petite poignée de
    // suppression au clic, sur le même principe que le storyboard.
    _clearDeleteHandles: () => {
        document.querySelectorAll('.synopsis-del-handle, .synopsis-table-toolbar').forEach(el => el.remove());
    },
    
    _showTableDeleteHandle: (table, cell, type) => {
        Synopsis._clearDeleteHandles();
        const bar = document.createElement('div');
        bar.className = 'synopsis-table-toolbar';
        bar.innerHTML = (cell ? `<button type="button" data-act="row">➖ Supprimer la ligne</button>` : '')
            + `<button type="button" data-act="table">🗑️ Supprimer le tableau</button>`;
        bar.querySelectorAll('button').forEach(b => { b.onmousedown = (e) => e.preventDefault(); });
        bar.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = e.target.closest('button') && e.target.closest('button').dataset.act;
            if(act === 'row' && cell) {
                const row = cell.closest('tr');
                const allRows = table.querySelectorAll('tr');
                if(row) { if(allRows.length <= 1) table.remove(); else row.remove(); }
            } else if(act === 'table') {
                table.remove();
            }
            Synopsis._clearDeleteHandles();
            Synopsis.save(type, true);
        });
        document.body.appendChild(bar);
        const rect = table.getBoundingClientRect();
        bar.style.top = (window.scrollY + rect.top - 34) + 'px';
        bar.style.left = (window.scrollX + rect.left) + 'px';
    },
    
    _handleEditorClick: (e, type) => {
        Synopsis._clearDeleteHandles();
        const table = e.target.closest('table');
        if(table) { Synopsis._showTableDeleteHandle(table, e.target.closest('td, th'), type); }
    },
    
    init: () => {
        if(!Synopsis._globalClickBound) {
            Synopsis._globalClickBound = true;
            document.addEventListener('click', (e) => {
                if(e.target.closest('.synopsis-table-toolbar')) return;
                if(e.target.closest('table')) return;
                Synopsis._clearDeleteHandles();
            });
        }
        const types = Object.keys(Synopsis.FIELDS);
        types.forEach(type => {
            const editor = Synopsis.getEditor(type);
            if(editor && !editor.dataset.synInit) {
                editor.dataset.synInit = '1';
                editor.addEventListener('click', (e) => Synopsis._handleEditorClick(e, type));
            }
        });
    },
    
    // ========================================================
    // EXPORT PDF DU SYNOPSIS [Vague 3a] — jsPDF natif
    // 3 champs (synopsis / synopsisShort / synopsisLong)
    // Conversion HTML riche : p, h1-3, b/strong, i/em, u, s, ul/ol/li, blockquote, hr, img, table
    // Page de garde Final Draft optionnelle
    // ========================================================
    
    // Point d'entrée : ouvre la modale options
    openSynopsisPdfModal: () => {
        // Vérifier qu'au moins un champ a du contenu
        const hasContent = (state.data.synopsis || state.data.synopsisShort || state.data.synopsisLong || state.data.synopsisIntent || state.data.directorNote || state.data.producerNote);
        if(!hasContent) {
            Utils.toast('Aucun synopsis à exporter — remplissez au moins un champ', 'warning');
            return;
        }
        Actions.openExportModal('synopsis');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'synopsis');
        });
    },
    
    // Modale options avec toggles bouton bleu (style cohérent avec le scénario)
    // === HELPER : Parse HTML enrichi en blocs typés pour jsPDF ===
    // Retourne un array de blocs : [{type, ...payload}]
    // types : heading, paragraph, list, blockquote, image, hr, table
    // Pour paragraph/heading/blockquote/list: payload contient `runs` = array de {text, style}
    _parseRichHtml: (html) => {
        if(!html || !html.trim()) return [];
        const container = document.createElement('div');
        container.innerHTML = html;
        // v595 : le contenu est maintenant enveloppé dans des
        // <div class="syn-block">...</div> réordonnables. Ce parseur ne
        // reconnaît que des tags de contenu au premier niveau (p, h1-3,
        // table, img...) — on déplie donc les blocs avant de parser, sinon
        // tout le contenu est silencieusement ignoré.
        const blockWrappers = Array.from(container.children).filter(c => c.classList && c.classList.contains('syn-block'));
        if(blockWrappers.length > 0) {
            const flat = document.createElement('div');
            blockWrappers.forEach(w => { Array.from(w.childNodes).forEach(n => flat.appendChild(n.cloneNode(true))); });
            container.innerHTML = flat.innerHTML;
        }
        const blocks = [];
        
        // Helper : extraire les "runs" inline d'un élément (gras/italique/souligné)
        const extractRuns = (node) => {
            const runs = [];
            const walk = (el, style) => {
                el.childNodes.forEach(child => {
                    if(child.nodeType === Node.TEXT_NODE) {
                        const txt = child.textContent;
                        if(txt) runs.push({ text: txt, ...style });
                    } else if(child.nodeType === Node.ELEMENT_NODE) {
                        const tag = child.tagName.toLowerCase();
                        const newStyle = { ...style };
                        if(tag === 'b' || tag === 'strong') newStyle.bold = true;
                        else if(tag === 'i' || tag === 'em') newStyle.italic = true;
                        else if(tag === 'u') newStyle.underline = true;
                        else if(tag === 's' || tag === 'strike') newStyle.strike = true;
                        else if(tag === 'br') { runs.push({ text: '\n' }); return; }
                        walk(child, newStyle);
                    }
                });
            };
            walk(node, {});
            return runs.filter(r => r.text);
        };
        
        // Helper : process une liste (ul/ol) récursivement
        const processList = (listEl, ordered) => {
            const items = [];
            listEl.querySelectorAll(':scope > li').forEach((li, idx) => {
                items.push({ runs: extractRuns(li), marker: ordered ? `${idx+1}.` : '•' });
            });
            return { type: 'list', items, ordered };
        };
        
        // Boucle sur les enfants directs du container (éléments ET texte nu)
        Array.from(container.childNodes).forEach(el => {
            if(el.nodeType === Node.TEXT_NODE) {
                el.textContent.split(/\n+/).forEach(line => {
                    const t = line.trim();
                    if(t) blocks.push({ type: 'paragraph', runs: [{ text: t }] });
                });
                return;
            }
            if(el.nodeType !== Node.ELEMENT_NODE) return;
            const tag = el.tagName.toLowerCase();
            
            if(tag === 'h1' || tag === 'h2' || tag === 'h3') {
                blocks.push({ type: 'heading', level: parseInt(tag[1], 10), runs: extractRuns(el) });
            } else if(tag === 'p') {
                // Détecter une image dans le paragraphe (paste/insertion)
                const img = el.querySelector('img');
                if(img && img.src) {
                    blocks.push({ type: 'image', src: img.src, alt: img.alt || '' });
                    // Ajouter aussi le texte autour si présent
                    const cloned = el.cloneNode(true);
                    cloned.querySelectorAll('img').forEach(i => i.remove());
                    const runs = extractRuns(cloned);
                    if(runs.length) blocks.push({ type: 'paragraph', runs });
                } else {
                    const runs = extractRuns(el);
                    if(runs.length) blocks.push({ type: 'paragraph', runs });
                }
            } else if(tag === 'blockquote') {
                blocks.push({ type: 'blockquote', runs: extractRuns(el) });
            } else if(tag === 'ul') {
                blocks.push(processList(el, false));
            } else if(tag === 'ol') {
                blocks.push(processList(el, true));
            } else if(tag === 'hr') {
                blocks.push({ type: 'hr' });
            } else if(tag === 'img') {
                if(el.src) blocks.push({ type: 'image', src: el.src, alt: el.alt || '' });
            } else if(tag === 'table') {
                // Conversion table simple : array d'array de strings
                const rows = [];
                el.querySelectorAll('tr').forEach(tr => {
                    const row = [];
                    tr.querySelectorAll('td, th').forEach(cell => {
                        row.push(cell.innerText.trim());
                    });
                    if(row.length) rows.push(row);
                });
                if(rows.length) blocks.push({ type: 'table', rows });
            } else if(tag === 'div') {
                // div générique : on traite comme un paragraphe
                const runs = extractRuns(el);
                if(runs.length) blocks.push({ type: 'paragraph', runs });
            }
        });
        
        return blocks;
    },
    
    // === GÉNÉRATION JSPDF DU SYNOPSIS ===
    // opts = { includeCover, includeSynopsis, includeShort, includeLong, returnBlob }
    synopsisToPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();    // 210
        const pageHeight = doc.internal.pageSize.getHeight();  // 297
        
        // Marges A4 standard (pas de reliure pour le synopsis, c'est plus un livret)
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;  // 160 mm
        
        // État du curseur d'écriture
        let y = margin;
        
        // ===== HELPERS =====
        
        // Nouveau saut de page (réinitialise y au top)
        const newPage = () => {
            doc.addPage();
            y = margin;
        };
        
        // S'assure qu'il reste `space` mm avant la fin de page ; sinon saut
        const ensureSpace = (space) => {
            if(y + space > pageHeight - margin) {
                newPage();
                return true;
            }
            return false;
        };
        
        // Écrit une suite de "runs" (text + style inline) en gérant le wrapping
        // runs : array de {text, bold?, italic?, underline?, strike?}
        // x : abscisse de départ
        // maxWidth : largeur disponible
        // fontSize : taille en pt
        // lineHeight : hauteur de ligne en mm
        // textColor : array [r,g,b] ou null pour noir
        const writeRuns = (runs, opts2 = {}) => {
            const x = opts2.x || margin;
            const maxWidth = opts2.maxWidth || usableWidth;
            const fontSize = opts2.fontSize || 11;
            const lineHeight = opts2.lineHeight || 5.5;
            const color = opts2.color || [30, 30, 30];
            const align = opts2.align || 'left';
            
            doc.setFontSize(fontSize);
            doc.setTextColor(color[0], color[1], color[2]);
            
            // Reconstituer le texte complet avec marqueurs de style
            // On va découper en lignes avec splitTextToSize, puis re-trouver les runs sur chaque ligne
            // Approche pragmatique : on concatène et on rend ligne par ligne en repassant sur les runs
            const fullText = runs.map(r => r.text || '').join('');
            if(!fullText.trim()) return;
            
            // Pour simplifier le wrapping avec styles mixtes, on utilise une approche par "mot"
            // mais on découpe les longs textes en gardant les styles
            // Stratégie : on rend run par run en mode "écriture continue" avec retour ligne quand on dépasse
            
            let curX = x;
            // Si align=center, on doit pré-calculer (complexe). Fallback : on ne supporte center/right que pour runs simples (1 seul style)
            if(align === 'center' || align === 'right') {
                // Pour center/right, on use splitTextToSize sur le texte complet (perd les styles)
                // mais c'est utilisé surtout pour les headings où il n'y a pas de mix
                const isBold = runs.length > 0 && runs[0].bold;
                const isItalic = runs.length > 0 && runs[0].italic;
                let style = 'normal';
                if(isBold && isItalic) style = 'bolditalic';
                else if(isBold) style = 'bold';
                else if(isItalic) style = 'italic';
                doc.setFont('helvetica', style);
                
                const lines = doc.splitTextToSize(fullText, maxWidth);
                lines.forEach(line => {
                    ensureSpace(lineHeight);
                    let drawX = x;
                    if(align === 'right') drawX = x + maxWidth;
                    else if(align === 'center') drawX = x + maxWidth / 2;
                    doc.text(line, drawX, y, { align });
                    y += lineHeight;
                });
                return;
            }
            
            // [2a] Bloc a style uniforme (cas courant : un seul style) -> rendu natif jsPDF.
            // splitTextToSize gere l'espacement et le wrap ; evite le collage / chevauchement
            // du rendu mot-a-mot manuel quand getTextWidth derive (mesure patchee du projet).
            const _uniform = runs.every(r => !!r.bold === !!runs[0].bold && !!r.italic === !!runs[0].italic && !r.underline && !r.strike);
            if(_uniform) {
                let st = 'normal';
                if(runs[0].bold && runs[0].italic) st = 'bolditalic';
                else if(runs[0].bold) st = 'bold';
                else if(runs[0].italic) st = 'italic';
                doc.setFont('helvetica', st);
                doc.splitTextToSize(fullText, maxWidth).forEach(line => {
                    ensureSpace(lineHeight);
                    doc.text(line, x, y);
                    y += lineHeight;
                });
                return;
            }
            
            // Mode left-align : on parcourt chaque run et écrit mot par mot
            const endX = x + maxWidth;
            
            runs.forEach(run => {
                let style = 'normal';
                if(run.bold && run.italic) style = 'bolditalic';
                else if(run.bold) style = 'bold';
                else if(run.italic) style = 'italic';
                doc.setFont('helvetica', style);
                
                // Découper le run en mots (en gardant les espaces avec les mots qui suivent)
                const words = run.text.split(/(\s+)/);
                words.forEach(word => {
                    if(!word) return;
                    // Gestion des retours ligne explicites
                    if(word.includes('\n')) {
                        const parts = word.split('\n');
                        parts.forEach((part, idx) => {
                            if(idx > 0) {
                                y += lineHeight;
                                curX = x;
                                ensureSpace(lineHeight);
                            }
                            if(part) {
                                const w = doc.getTextWidth(part);
                                if(curX + w > endX && curX > x) {
                                    y += lineHeight;
                                    curX = x;
                                    ensureSpace(lineHeight);
                                }
                                doc.text(part, curX, y);
                                if(run.underline) doc.line(curX, y+0.8, curX + w, y+0.8);
                                if(run.strike) doc.line(curX, y-1.5, curX + w, y-1.5);
                                curX += w;
                            }
                        });
                        return;
                    }
                    
                    const wWidth = doc.getTextWidth(word);
                    // Si le mot ne tient pas, on retourne à la ligne (sauf si on est déjà au début)
                    if(curX + wWidth > endX && curX > x) {
                        y += lineHeight;
                        curX = x;
                        ensureSpace(lineHeight);
                    }
                    doc.text(word, curX, y);
                    if(run.underline && word.trim()) {
                        doc.setLineWidth(0.2);
                        doc.line(curX, y+0.8, curX + wWidth, y+0.8);
                    }
                    if(run.strike && word.trim()) {
                        doc.setLineWidth(0.2);
                        doc.line(curX, y-1.5, curX + wWidth, y-1.5);
                    }
                    curX += wWidth;
                });
            });
            
            // Retour ligne après le bloc
            y += lineHeight;
        };
        
        // === Rendu d'un bloc typé ===
        const renderBlock = (block) => {
            switch(block.type) {
                case 'heading': {
                    const sizes = { 1: 18, 2: 14, 3: 12 };
                    const spaceBefore = { 1: 8, 2: 6, 3: 4 };
                    const spaceAfter = { 1: 4, 2: 3, 3: 2 };
                    if(y > margin) y += spaceBefore[block.level] || 4;
                    ensureSpace(sizes[block.level] * 0.6 + (spaceAfter[block.level] || 2));
                    // Forcer bold pour les headings
                    const boldRuns = block.runs.map(r => ({ ...r, bold: true }));
                    writeRuns(boldRuns, {
                        fontSize: sizes[block.level] || 14,
                        lineHeight: sizes[block.level] * 0.45 + 1,
                        color: [20, 20, 20]
                    });
                    y += spaceAfter[block.level] || 2;
                    break;
                }
                
                case 'paragraph': {
                    writeRuns(block.runs, { fontSize: 11, lineHeight: 5.5, color: [40, 40, 40] });
                    y += 2;
                    break;
                }
                
                case 'blockquote': {
                    if(y > margin) y += 3;
                    const startY = y;
                    // Décalage indent gauche
                    writeRuns(block.runs.map(r => ({ ...r, italic: true })), {
                        x: margin + 8,
                        maxWidth: usableWidth - 10,
                        fontSize: 11,
                        lineHeight: 5.5,
                        color: [90, 90, 90]
                    });
                    // Barre verticale grise à gauche
                    doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
                    doc.setLineWidth(0.8);
                    doc.line(margin + 2, startY - 3, margin + 2, y - 2);
                    y += 3;
                    break;
                }
                
                case 'list': {
                    block.items.forEach(item => {
                        ensureSpace(6);
                        // Marker (puce ou numéro) à gauche
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(11);
                        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                        doc.text(PdfTheme.cleanText(item.marker), margin + 2, y);
                        // Contenu indenté
                        writeRuns(item.runs, {
                            x: margin + 8,
                            maxWidth: usableWidth - 8,
                            fontSize: 11,
                            lineHeight: 5.5,
                            color: [40, 40, 40]
                        });
                    });
                    y += 2;
                    break;
                }
                
                case 'hr': {
                    if(y > margin) y += 4;
                    ensureSpace(6);
                    doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                    doc.setLineWidth(0.4);
                    doc.line(margin + 20, y, pageWidth - margin - 20, y);
                    y += 8;
                    break;
                }
                
                case 'image': {
                    if(!block.src) break;
                    try {
                        // Calcul dimensions : on récupère via Image native
                        const imgEl = new Image();
                        imgEl.crossOrigin = 'anonymous';
                        imgEl.src = Utils.signedUrlFor(block.src);
                        // Attendre le chargement (déjà chargé si dataURL ou cache)
                        if(!imgEl.complete) {
                            // skip async loading dans ce contexte sync - on retourne
                            break;
                        }
                        const naturalW = imgEl.naturalWidth || 400;
                        const naturalH = imgEl.naturalHeight || 300;
                        const maxImgWidth = Math.min(usableWidth, 150);
                        const ratio = naturalH / naturalW;
                        const w = maxImgWidth;
                        const h = maxImgWidth * ratio;
                        // Saut de page si trop grand
                        ensureSpace(h + 6);
                        const xCenter = (pageWidth - w) / 2;
                        doc.addImage(block.src, 'PNG', xCenter, y, w, h);
                        y += h + 4;
                    } catch(e) {
                        console.warn('[Synopsis PDF] Erreur image :', e);
                    }
                    break;
                }
                
                case 'table': {
                    // Rendu basique : N colonnes égales, ligne entête en gras
                    if(!block.rows || block.rows.length === 0) break;
                    const nCols = Math.max(...block.rows.map(r => r.length));
                    const colWidth = usableWidth / nCols;
                    const rowHeight = 7;
                    
                    block.rows.forEach((row, rowIdx) => {
                        ensureSpace(rowHeight);
                        const isHeader = rowIdx === 0;
                        // Fond gris léger pour le header
                        if(isHeader) {
                            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
                            doc.rect(margin, y - 4, usableWidth, rowHeight, 'F');
                        }
                        // Bordures
                        doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                        doc.setLineWidth(0.2);
                        doc.rect(margin, y - 4, usableWidth, rowHeight);
                        for(let c = 1; c < nCols; c++) {
                            doc.line(margin + c * colWidth, y - 4, margin + c * colWidth, y - 4 + rowHeight);
                        }
                        // Texte des cellules
                        doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
                        doc.setFontSize(9);
                        doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                        row.forEach((cell, c) => {
                            const txt = (cell || '').substring(0, 40);
                            doc.text(txt, margin + c * colWidth + 2, y);
                        });
                        y += rowHeight;
                    });
                    y += 4;
                    break;
                }
            }
        };
        
        // ===== PAGE DE GARDE (modèle unifié PdfTheme) =====
        if(opts.includeCover !== false) {
            if(typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
                PdfTheme.coverPage(doc, { sectionName: 'Synopsis' });
            }
            doc.addPage();
            y = margin;
        }
        
        // ===== CONTENU =====
        const sections = [];
        if(opts.includeSynopsis && state.data.synopsis) sections.push({ title: 'Synopsis', html: state.data.synopsis });
        if(opts.includeShort && state.data.synopsisShort) sections.push({ title: 'Résumé court', html: state.data.synopsisShort });
        if(opts.includeLong && state.data.synopsisLong) sections.push({ title: 'Résumé long', html: state.data.synopsisLong });
        if(opts.includeIntent && state.data.synopsisIntent) sections.push({ title: "Note d'intention", html: state.data.synopsisIntent });
        if(opts.includeDirector && state.data.directorNote) sections.push({ title: 'Note du réalisateur', html: state.data.directorNote });
        if(opts.includeProducer && state.data.producerNote) sections.push({ title: 'Note du producteur', html: state.data.producerNote });
        
        // PLUS DE SAUT DE PAGE SYSTEMATIQUE (v601). Chaque section ouvrait une
        // page neuve : un synopsis d'un tiers de page laissait donc deux tiers de
        // blanc avant le resume court, lui aussi court, et ainsi de suite. Un
        // dossier de six sections faisait six pages presque vides.
        // LA REGLE EST DESORMAIS CELLE DU BON SENS TYPOGRAPHIQUE : on enchaine,
        // sauf s'il ne reste pas de quoi poser le titre ET quelques lignes
        // dessous. Un titre seul en bas de page est pire qu'un blanc.
        const PLACE_MIN = 42;   // mm : le titre, son filet, et environ 4 lignes
        sections.forEach((section, idx) => {
            if(idx > 0) {
                y += 8;                   // respiration entre deux sections
                ensureSpace(PLACE_MIN);   // saute la page seulement si c'est trop juste
            }
            
            // Titre de section — porte unique PdfTheme.sectionBand (v601).
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                            title: section.title,
                                            accent: PdfTheme.accentFor('Synopsis') });
            
            // Parser et rendre les blocs
            const blocks = Synopsis._parseRichHtml(section.html);
            blocks.forEach(block => renderBlock(block));
        });
        
        // ===== FOOTERS =====
        const totalPages = doc.internal.getNumberOfPages();
        const offset = (opts.includeCover !== false) ? 1 : 0;
        const contentTotal = totalPages - offset;
        const today = new Date();
        const dateStr = String(today.getDate()).padStart(2, '0') + '/' 
                      + String(today.getMonth() + 1).padStart(2, '0') + '/' 
                      + today.getFullYear();
        const projectName = state.data.title || 'Projet';
        
        for(let i = 1; i <= totalPages; i++) {
            if(opts.includeCover !== false && i === 1) continue;
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            // Nom projet à gauche
            doc.text(projectName, margin, pageHeight - 10);
            // Date + pagination à droite
            const pageNum = i - offset;
            doc.text(`${dateStr} — ${pageNum}/${contentTotal}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        }
        
        // ===== FOOTER UNIFIÉ =====
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { 
                skipFirstPage: opts.includeCover !== false,
                forDossier: !!opts.returnBlob
            });
        }
        
        // ===== SORTIE =====
        if(opts.returnBlob) return doc.output('blob');
        
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Synopsis')
            : `${state.data.title || 'Projet'} - Synopsis - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Synopsis PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Synopsis PDF généré');
    }
};
