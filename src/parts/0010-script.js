
  // Routage GitHub Pages : 404.html a mémorisé le chemin demandé, on le restaure
  try { var _mr = sessionStorage.getItem('moteur_redirect'); if(_mr) { sessionStorage.removeItem('moteur_redirect'); history.replaceState(null, '', _mr); } } catch(e) {}

  // PRE-DEMARRAGE — la page d'accueil est ECRITE AVANT le bloc de code (ligne ~6500
  // contre ~11400) : le navigateur l'affiche et la rend cliquable alors qu'il lui
  // reste tout le JavaScript a charger. Un onclick qui appelait app.Landing.showAuth
  // levait donc « app is not defined ». Les boutons appellent maintenant moteurAuth,
  // qui existe des la premiere ligne : avant le demarrage il MEMORISE l'intention,
  // apres il est remplace par la vraie fonction (voir module LANDING).
  // Ne pas tester « typeof app » ici : app est un const, il est en zone morte
  // pendant l'evaluation du script et typeof leve une erreur au lieu de rendre
  // 'undefined'.
  window.__moteurWanted = null;
  window.moteurAuth = function(mode) {
      window.__moteurWanted = mode || 'login';
      try { document.documentElement.style.cursor = 'progress'; } catch(e) {}
  };
