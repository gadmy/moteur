
  const Tooltip = {
      el: null, timer: null, current: null, _inited: false,
      DELAY: 450,

      _ensure: () => {
          if(Tooltip.el) return Tooltip.el;
          const t = document.createElement('div');
          t.className = 'app-tooltip';
          t.setAttribute('role', 'tooltip');
          document.body.appendChild(t);
          return (Tooltip.el = t);
      },

      // Un menu déroulant est-il ouvert ? Si oui : aucune bulle (sinon elle le recouvrirait).
      _menuOpen: () => !!document.querySelector('.menu-dropdown.visible, .dropdown-menu.show'),

      // Texte à afficher ; neutralise le title natif (restauré au mouseout) pour éviter le doublon.
      _arm: (el) => {
          const nat = el.getAttribute('title');
          if(nat) { el.setAttribute('data-tt-native', nat); el.removeAttribute('title'); return nat; }
          return el.getAttribute('data-tooltip') || '';
      },
      _disarm: (el) => {
          if(el && el.hasAttribute && el.hasAttribute('data-tt-native')) {
              el.setAttribute('title', el.getAttribute('data-tt-native'));
              el.removeAttribute('data-tt-native');
          }
      },

      _place: (el) => {
          const t = Tooltip.el; if(!t) return;
          const r = el.getBoundingClientRect();
          const tw = t.offsetWidth, th = t.offsetHeight;
          const gap = 8, pad = 6, vw = window.innerWidth, vh = window.innerHeight;
          const pref = el.getAttribute('data-tooltip-pos') || 'top';
          const orders = {
              top:    ['top','bottom','right','left'],
              bottom: ['bottom','top','right','left'],
              left:   ['left','right','top','bottom'],
              right:  ['right','left','top','bottom']
          };
          const order = orders[pref] || orders.top;
          const fits = {
              top:    r.top    - gap - th >= pad,
              bottom: r.bottom + gap + th <= vh - pad,
              left:   r.left   - gap - tw >= pad,
              right:  r.right  + gap + tw <= vw - pad
          };
          const side = order.find(z => fits[z]) || order[0];
          let x, y;
          if(side === 'top' || side === 'bottom') {
              x = r.left + r.width / 2 - tw / 2;
              y = side === 'top' ? r.top - gap - th : r.bottom + gap;
          } else {
              y = r.top + r.height / 2 - th / 2;
              x = side === 'left' ? r.left - gap - tw : r.right + gap;
          }
          t.style.left = Math.min(Math.max(x, pad), vw - tw - pad) + 'px';
          t.style.top  = Math.min(Math.max(y, pad), vh - th - pad) + 'px';
      },

      _show: (el) => {
          if(Tooltip._menuOpen()) return;
          const txt = Tooltip._arm(el);
          if(!txt) return;
          const t = Tooltip._ensure();
          t.textContent = txt;
          Tooltip.current = el;
          t.classList.add('visible');
          Tooltip._place(el);
      },

      hide: () => {
          clearTimeout(Tooltip.timer); Tooltip.timer = null;
          if(Tooltip.current) Tooltip._disarm(Tooltip.current);
          Tooltip.current = null;
          if(Tooltip.el) Tooltip.el.classList.remove('visible');
      },

      init: () => {
          if(Tooltip._inited) return;
          Tooltip._inited = true;
          document.addEventListener('mouseover', (e) => {
              const el = e.target.closest && e.target.closest('[data-tooltip], [title]');
              if(!el || el === Tooltip.current) return;
              clearTimeout(Tooltip.timer);
              Tooltip.timer = setTimeout(() => Tooltip._show(el), Tooltip.DELAY);
          }, true);
          document.addEventListener('mouseout', (e) => {
              const from = e.target.closest && e.target.closest('[data-tooltip], [title], [data-tt-native]');
              if(!from) return;
              if(e.relatedTarget && from.contains && from.contains(e.relatedTarget)) return;
              Tooltip.hide();
          }, true);
          ['mousedown','click','keydown','wheel'].forEach(ev => document.addEventListener(ev, Tooltip.hide, true));
          window.addEventListener('scroll', Tooltip.hide, true);
          window.addEventListener('resize', Tooltip.hide);
          window.addEventListener('blur', Tooltip.hide);
      }
  };
