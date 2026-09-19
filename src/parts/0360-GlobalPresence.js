
  const GlobalPresence = {
      renderBadges: () => {
          const cards = document.querySelectorAll('.project-card[data-project-id]');
          if(!cards.length) return;
          const me = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
          const byProject = {};
          (state.dbPresence || []).forEach(r => {
              const em = (r.user_email || '').toLowerCase();
              const pid = r.project_id;
              if(!pid || em === me) return;
              (byProject[pid] = byProject[pid] || []).push(em);
          });
          cards.forEach(card => {
              const old = card.querySelector('.gp-badges');
              if(old) old.remove();
              const emails = Array.from(new Set(byProject[card.dataset.projectId] || []));
              if(!emails.length) return;
              const wrap = document.createElement('div');
              wrap.className = 'gp-badges';
              wrap.title = 'En ce moment sur le projet : ' + emails.join(', ');
              emails.slice(0, 3).forEach(em => {
                  const a = document.createElement('span');
                  a.className = 'gp-avatar';
                  a.style.backgroundColor = (Utils.getColor ? Utils.getColor(em) : '#c0392b');
                  a.textContent = (Utils.getInitials ? Utils.getInitials(em) : (em[0]||'?').toUpperCase());
                  wrap.appendChild(a);
              });
              card.appendChild(wrap);
          });
      }
  };

    // StoreRealtime — sous-module B.1.4 : écoute temps réel Supabase (DB changes, presence) + chargement