
  const Geo = {
      _t: null,
      suggestCities: (input) => {
          const q = (input && input.value || '').trim();
          if(q.length < 2) return;
          clearTimeout(Geo._t);
          Geo._t = setTimeout(async () => {
              try {
                  const res = await fetch('https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(q) + '&fields=nom,codesPostaux&boost=population&limit=8');
                  if(!res.ok) return;
                  const communes = await res.json();
                  const dl = document.getElementById('city-suggestions');
                  if(!dl) return;
                  dl.innerHTML = (communes || []).map(x => '<option value="' + Utils.escape(x.nom) + '">' + Utils.escape((x.codesPostaux || [])[0] || '') + '</option>').join('');
              } catch(e) { /* hors ligne ou API indisponible : saisie libre */ }
          }, 300);
      }
  };

  // Fermeture des menus du hub (ouverts au clic) lors d'un clic à l'extérieur — actif dès le chargement
  document.addEventListener('click', (e) => {
      if(!e.target.closest('.nav-dropdown')) document.querySelectorAll('.nav-dropdown .dropdown-menu.show').forEach(m => m.classList.remove('show'));
  });

  // === CONSTANTES PARTAGÉES ===