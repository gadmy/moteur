
  const Landing = {
      show: () => {
          Router.capturePending();
          document.getElementById('landing-view').style.display = 'flex';
          document.getElementById('auth-view').style.display = 'none';
          Router.sync();
      },
      
      hide: () => {
          document.getElementById('landing-view').style.display = 'none';
      },
      
      showAuth: (mode) => {
          Landing.hide();
          document.getElementById('auth-view').style.display = 'flex';
          Router.sync();
          if(mode === 'signup') {
              Auth.toggleMode('signup');
          } else {
              Auth.toggleMode('login');
          }
      },

      // Rejoue un clic fait sur la page d'accueil AVANT que l'application soit
      // prete (voir le garde moteurAuth du <head>). Appele une seule fois, quand
      // on sait qu'il n'y a pas de session : si l'utilisateur est deja connecte
      // il part au hub, l'intention memorisee n'a plus de sens et est jetee.
      replayPending: () => {
          const wanted = window.__moteurWanted;
          window.__moteurWanted = null;
          try { document.documentElement.style.cursor = ''; } catch(e) {}
          if(wanted) Landing.showAuth(wanted);
      },

      // Carrousel de captures d'écran de la page publique. Un seul index
      // courant, la piste coulisse via transform (pas de librairie externe).
      carouselIndex: 0,
      carouselInit: () => {
          const track = document.getElementById('landingCarouselTrack');
          const dots = document.getElementById('landingCarouselDots');
          if(!track || !dots) return;
          const n = track.children.length;
          dots.innerHTML = Array.from({ length: n }, (_, i) =>
              `<button class="landing-carousel-dot${i === 0 ? ' active' : ''}" onclick="app.Landing.carouselGoTo(${i})" aria-label="Aller à la capture ${i + 1}"></button>`
          ).join('');
      },
      carouselGoTo: (i) => {
          const track = document.getElementById('landingCarouselTrack');
          if(!track) return;
          const n = track.children.length;
          if(n === 0) return;
          Landing.carouselIndex = ((i % n) + n) % n;
          track.style.transform = `translateX(-${Landing.carouselIndex * 100}%)`;
          document.querySelectorAll('#landingCarouselDots .landing-carousel-dot').forEach((d, idx) => d.classList.toggle('active', idx === Landing.carouselIndex));
      },
      carouselNext: () => Landing.carouselGoTo(Landing.carouselIndex + 1),
      carouselPrev: () => Landing.carouselGoTo(Landing.carouselIndex - 1)
  };

  // A partir d'ici les boutons de la page d'accueil tapent directement dans Landing.
  window.moteurAuth = (mode) => Landing.showAuth(mode);
  Landing.carouselInit();

  // ==================== MODULE ROUTER (URLs) ====================