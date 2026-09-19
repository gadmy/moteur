
    window.addEventListener('load', function() {
      /* pdf.js worker: configure dans LazyLib pdfjs.after */
    });
    
    // iOS Safari 100vh fix
    function setVH() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      document.documentElement.style.setProperty('--real-vh', `${vh}px`);
    }
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', function() { setTimeout(setVH, 100); });
    
    // Smooth scroll polyfill check for Safari
    if (!('scrollBehavior' in document.documentElement.style)) {
      window.smoothScrollTo = function(element, options) {
        const start = window.pageYOffset;
        const target = element.getBoundingClientRect().top + start;
        const duration = 300;
        let startTime = null;
        function animation(currentTime) {
          if (startTime === null) startTime = currentTime;
          const timeElapsed = currentTime - startTime;
          const progress = Math.min(timeElapsed / duration, 1);
          const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          window.scrollTo(0, start + (target - start) * ease);
          if (timeElapsed < duration) requestAnimationFrame(animation);
        }
        requestAnimationFrame(animation);
      };
    }
