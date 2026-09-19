
  const ProjectFolders = {
      KEY: 'moteur_project_folders',
      _state: null,

      _load: () => {
          if(ProjectFolders._state) return ProjectFolders._state;
          let st = { folders: [], assignments: {} };
          try {
              const raw = localStorage.getItem(ProjectFolders.KEY);
              if(raw) {
                  const parsed = JSON.parse(raw);
                  if(parsed && Array.isArray(parsed.folders)) st = { folders: parsed.folders, assignments: parsed.assignments || {} };
              }
          } catch(e) { console.warn('[ProjectFolders] load:', e && e.message); }
          ProjectFolders._state = st;
          return st;
      },

      _persist: () => {
          try { PreferencesSync.save(ProjectFolders.KEY, JSON.stringify(ProjectFolders._load())); }
          catch(e) { console.warn('[ProjectFolders] persist:', e && e.message); }
      },

      // A appeler apres une synchro distante (PreferencesSync.load) pour relire le localStorage.
      reload: () => { ProjectFolders._state = null; return ProjectFolders._load(); },

      // ----- Lecture -----
      // ProjectFolders.all retirée v569, jamais appelée.
      get: (id) => ProjectFolders._load().folders.find(f => f.id === id) || null,
      children: (parentId) => ProjectFolders._load().folders.filter(f => (f.parentId || null) === (parentId || null)),
      folderOf: (projectId) => ProjectFolders._load().assignments[projectId] || null,
      projectsIn: (folderId) => {
          const a = ProjectFolders._load().assignments;
          return Object.keys(a).filter(pid => a[pid] === folderId);
      },
      path: (id) => {
          const out = [];
          let cur = ProjectFolders.get(id);
          const guard = new Set();
          while(cur && !guard.has(cur.id)) { guard.add(cur.id); out.unshift(cur); cur = cur.parentId ? ProjectFolders.get(cur.parentId) : null; }
          return out;
      },

      // ----- Ecriture -----
      create: ({ name, color, priority, parentId } = {}) => {
          const st = ProjectFolders._load();
          const folder = {
              id: (crypto.randomUUID ? crypto.randomUUID() : 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
              name: (name || 'Nouveau dossier').toString().slice(0, 120),
              color: color || '#9E9E9E',
              priority: priority || '',
              parentId: parentId || null
          };
          st.folders.push(folder);
          ProjectFolders._persist();
          return folder;
      },

      update: (id, patch = {}) => {
          const f = ProjectFolders.get(id);
          if(!f) return null;
          if(patch.name !== undefined) f.name = patch.name.toString().slice(0, 120);
          if(patch.color !== undefined) f.color = patch.color;
          if(patch.priority !== undefined) f.priority = patch.priority;
          if(patch.parentId !== undefined && !ProjectFolders._wouldCycle(id, patch.parentId)) f.parentId = patch.parentId || null;
          ProjectFolders._persist();
          return f;
      },

      // Empeche de deplacer un dossier dans l'un de ses propres descendants.
      _wouldCycle: (id, newParentId) => {
          if(!newParentId) return false;
          if(newParentId === id) return true;
          let cur = ProjectFolders.get(newParentId);
          const guard = new Set();
          while(cur && !guard.has(cur.id)) { if(cur.id === id) return true; guard.add(cur.id); cur = cur.parentId ? ProjectFolders.get(cur.parentId) : null; }
          return false;
      },

      // Supprime un dossier ; ses sous-dossiers et projets remontent au parent (null = racine).
      remove: (id) => {
          const st = ProjectFolders._load();
          const f = ProjectFolders.get(id);
          if(!f) return;
          const newParent = f.parentId || null;
          st.folders.forEach(c => { if((c.parentId || null) === id) c.parentId = newParent; });
          Object.keys(st.assignments).forEach(pid => { if(st.assignments[pid] === id) { if(newParent) st.assignments[pid] = newParent; else delete st.assignments[pid]; } });
          st.folders = st.folders.filter(x => x.id !== id);
          ProjectFolders._persist();
      },

      // Range un projet (folderId null = racine / non classe).
      assign: (projectId, folderId) => {
          const st = ProjectFolders._load();
          if(folderId) st.assignments[projectId] = folderId;
          else delete st.assignments[projectId];
          ProjectFolders._persist();
      },

      // Nettoie les assignations vers des dossiers disparus.
      prune: () => {
          const st = ProjectFolders._load();
          const ids = new Set(st.folders.map(f => f.id));
          let changed = false;
          Object.keys(st.assignments).forEach(pid => { if(!ids.has(st.assignments[pid])) { delete st.assignments[pid]; changed = true; } });
          if(changed) ProjectFolders._persist();
      }
  };
