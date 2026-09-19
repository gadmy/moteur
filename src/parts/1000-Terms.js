
  const Terms = {
      _gate: false,      // true = mode verrouillage (bloque le tableau de bord)
      _onGateOk: null,

      // Ouverture volontaire (menu Aide, formulaire d'inscription).
      show: () => {
          Terms._gate = false;
          Terms._render();
          document.getElementById('terms-modal').style.display = 'flex';
      },

      // Appelée après connexion. Bloque l'accès aux projets tant que
      // terms_accepted n'est pas vrai en base (comptes admin exemptés).
      // onOk() est appelé immédiatement si tout est déjà en ordre, ou une
      // fois l'acceptation enregistrée.
      checkAndGate: (onOk) => {
          if(typeof Admin !== 'undefined' && Admin.isAdmin && Admin.isAdmin()) { onOk(); return; }
          if(state.userProfile && state.userProfile.terms_accepted) { onOk(); return; }
          Terms._gate = true;
          Terms._onGateOk = onOk;
          Terms._render();
          document.getElementById('terms-modal').style.display = 'flex';
      },

      _render: () => {
          const ck = document.getElementById('terms-modal-check');
          const btn = document.getElementById('terms-modal-close-btn');
          const err = document.getElementById('terms-modal-error');
          const alreadyOk = !Terms._gate && state.userProfile && state.userProfile.terms_accepted;
          if(ck) { ck.checked = !!alreadyOk; ck.disabled = !!alreadyOk; }
          if(btn) {
              btn.disabled = false;
              btn.classList.toggle('enabled', !!alreadyOk);
              btn.textContent = alreadyOk ? 'Fermer' : "J'accepte et je continue";
          }
          if(err) err.classList.add('d-none');
      },

      toggleAccept: (checked) => {
          const btn = document.getElementById('terms-modal-close-btn');
          if(btn) btn.classList.toggle('enabled', checked);
      },

      // Clic sur le bouton du pied de modale.
      confirm: async () => {
          const ck = document.getElementById('terms-modal-check');
          const btn = document.getElementById('terms-modal-close-btn');
          const err = document.getElementById('terms-modal-error');
          const alreadyOk = !Terms._gate && state.userProfile && state.userProfile.terms_accepted;

          if(alreadyOk) { Terms.hide(); return; }
          if(!ck || !ck.checked) return; // le bouton est normalement désactivé tant que non coché

          // Ouverture depuis l'écran d'inscription (compte pas encore créé) :
          // rien à écrire, la case du formulaire d'inscription gère ce cas.
          if(!state.currentUser) { document.getElementById('terms-modal').style.display = 'none'; return; }

          if(btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }
          try {
              const email = (state.currentUser?.email || '').toLowerCase();
              const nowIso = new Date().toISOString();
              const { data: updData, error: updErr } = await supabase
                  .from('user_profiles')
                  .update({ terms_accepted: true, terms_accepted_at: nowIso })
                  .eq('email', email)
                  .select('email');
              if(updErr) throw updErr;
              if(!updData || updData.length === 0) {
                  // Pas de fiche existante (compte ancien / cas limite) : on la crée.
                  const { error: insErr } = await supabase.from('user_profiles').insert({
                      email, owner_email: email, name: '', terms_accepted: true, terms_accepted_at: nowIso,
                      profile_type: 'producer', created_at: nowIso, is_public: false
                  });
                  if(insErr) throw insErr;
              }
              state.userProfile = state.userProfile || {};
              state.userProfile.terms_accepted = true;
              state.userProfile.terms_accepted_at = nowIso;
              const wasGate = Terms._gate;
              Terms._gate = false;
              document.getElementById('terms-modal').style.display = 'none';
              if(wasGate) { const cb = Terms._onGateOk; Terms._onGateOk = null; if(cb) cb(); }
          } catch(e) {
              console.warn('[Terms] écriture terms_accepted échouée:', e);
              if(err) { err.textContent = "Erreur d'enregistrement, réessaie."; err.classList.remove('d-none'); }
              if(btn) { btn.disabled = false; btn.textContent = "J'accepte et je continue"; }
          }
      },

      hide: () => {
          if(Terms._gate) return; // pas de fermeture tant que non accepté
          document.getElementById('terms-modal').style.display = 'none';
      }
  };

  // ==================== MODULE SCRIPTSHARE (partage scenario externe) ====================