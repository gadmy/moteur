
// ============================================================
// LECTEUR PHOTO reutilisable pour les galeries de fiches
// (comedien, decor, technicien). Defilement gauche/droite, coeur
// (favori, stocke dans entity.galleryFav) et croix (supprimer via la
// fonction de suppression propre a chaque famille).
// ============================================================
const PhotoViewer = {
    _coll: null, _idx: 0, _i: 0, _photos: [],
    _famOf: { actors: 'actor', locations: 'location', crew: 'crew', resources: 'resource' },
    _removeFn: {
        actors: (idx, i) => Actions.removeActorGalleryPhoto(idx, i),
        locations: (idx, i) => Actions.removeLocationPhoto(idx, i),
        crew: (idx, i) => Crew.removeGalleryPhoto(idx, i),
        resources: (idx, i) => Resources.removeGalleryPhoto(idx, i)
    },
    _entity: () => { const c = PhotoViewer._coll; return (c && state.data[c] && state.data[c][PhotoViewer._idx]) || null; },
    _canEdit: () => {
        const fam = PhotoViewer._famOf[PhotoViewer._coll];
        return (typeof Permissions === 'undefined' || !Permissions.canEditFiche) ? true : Permissions.canEditFiche(fam);
    },
    open: (coll, idx, start) => {
        const ent = state.data[coll] && state.data[coll][idx];
        if(!ent) return;
        const photos = ent.galleryPhotos || [];
        if(!photos.length) return;
        PhotoViewer._coll = coll; PhotoViewer._idx = idx; PhotoViewer._photos = photos;
        PhotoViewer._i = Math.max(0, Math.min(start || 0, photos.length - 1));
        let ov = document.getElementById('pv-overlay');
        if(!ov) {
            ov = document.createElement('div');
            ov.id = 'pv-overlay'; ov.className = 'pv-overlay';
            ov.addEventListener('click', (e) => { if(e.target === ov) PhotoViewer.close(); });
            document.body.appendChild(ov);
            document.addEventListener('keydown', PhotoViewer._onKey);
        }
        PhotoViewer._render();
    },
    close: () => {
        const ov = document.getElementById('pv-overlay');
        if(ov) ov.remove();
        document.removeEventListener('keydown', PhotoViewer._onKey);
    },
    _onKey: (e) => {
        if(!document.getElementById('pv-overlay')) return;
        if(e.key === 'Escape') PhotoViewer.close();
        else if(e.key === 'ArrowLeft') PhotoViewer.prev();
        else if(e.key === 'ArrowRight') PhotoViewer.next();
    },
    prev: () => { const n = PhotoViewer._photos.length; if(!n) return; PhotoViewer._i = (PhotoViewer._i - 1 + n) % n; PhotoViewer._render(); },
    next: () => { const n = PhotoViewer._photos.length; if(!n) return; PhotoViewer._i = (PhotoViewer._i + 1) % n; PhotoViewer._render(); },
    _toggleFav: () => {
        const ent = PhotoViewer._entity();
        if(!ent || !PhotoViewer._canEdit()) return;
        const url = PhotoViewer._photos[PhotoViewer._i];
        if(!url) return;
        if(!Array.isArray(ent.galleryFav)) ent.galleryFav = [];
        const k = ent.galleryFav.indexOf(url);
        if(k === -1) ent.galleryFav.push(url); else ent.galleryFav.splice(k, 1);
        Store.save();
        PhotoViewer._refreshSource();
        PhotoViewer._render();
    },
    _refreshSource: () => {
        if(PhotoViewer._coll === 'resources') { if(typeof Resources !== 'undefined' && Resources._refreshGalleryGrid) Resources._refreshGalleryGrid(PhotoViewer._idx); }
        else if(typeof CardModal !== 'undefined' && CardModal.refresh) CardModal.refresh();
    },
    _delete: async () => {
        const ent = PhotoViewer._entity();
        if(!ent || !PhotoViewer._canEdit()) return;
        const i = PhotoViewer._i;
        const fn = PhotoViewer._removeFn[PhotoViewer._coll];
        if(fn) await fn(PhotoViewer._idx, i);
        const ent2 = PhotoViewer._entity();
        const photos = (ent2 && ent2.galleryPhotos) || [];
        PhotoViewer._photos = photos;
        if(!photos.length) { PhotoViewer.close(); return; }
        PhotoViewer._i = Math.min(i, photos.length - 1);
        PhotoViewer._render();
    },
    _render: () => {
        const ov = document.getElementById('pv-overlay');
        if(!ov) return;
        const ent = PhotoViewer._entity();
        const photos = PhotoViewer._photos || [];
        const url = photos[PhotoViewer._i] || '';
        const n = photos.length;
        const canEdit = PhotoViewer._canEdit();
        const fav = !!(ent && Array.isArray(ent.galleryFav) && ent.galleryFav.includes(url));
        const esc = Utils.escape;
        const nav = n > 1
            ? `<button class="pv-nav pv-prev" onclick="event.stopPropagation(); app.PhotoViewer.prev()" title="Précédente">‹</button><button class="pv-nav pv-next" onclick="event.stopPropagation(); app.PhotoViewer.next()" title="Suivante">›</button>`
            : '';
        const actions = canEdit
            ? `<div class="pv-actions"><button class="pv-fav${fav ? ' on' : ''}" onclick="event.stopPropagation(); app.PhotoViewer._toggleFav()" title="${fav ? 'Retirer des favoris' : "J'aime"}">${fav ? '❤' : '🤍'}</button><button class="pv-del" onclick="event.stopPropagation(); app.PhotoViewer._delete()" title="Supprimer">✕</button></div>`
            : (fav ? `<div class="pv-actions"><span class="pv-fav on">❤</span></div>` : '');
        ov.innerHTML = `<button class="pv-close" onclick="event.stopPropagation(); app.PhotoViewer.close()" title="Fermer">✕</button>${n > 1 ? `<div class="pv-count">${PhotoViewer._i + 1} / ${n}</div>` : ''}<img class="pv-img" src="${esc(Utils.safeMediaUrl(url))}" alt="Photo">${nav}${actions}`;
    }
};
