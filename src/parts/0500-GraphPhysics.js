
  const GraphPhysics = {
      relax: (N, W, H, tours) => {
          if(!N || N.length < 2) return;
          const centre = N[0];
          for(let t = 0; t < tours; t++) {
              for(let i = 1; i < N.length; i++) {
                  const n = N[i];
                  if(n.pinned || n.ox === undefined) continue;
                  n.x += (centre.x + n.ox - n.x) * 0.06;
                  n.y += (centre.y + n.oy - n.y) * 0.06;
              }
              for(let i = 0; i < N.length; i++) {
                  for(let j = i + 1; j < N.length; j++) {
                      const a = N[i], b = N[j];
                      const sx = (a.w + b.w) / 2 + 14, sy = (a.h + b.h) / 2 + 12;
                      const dx = b.x - a.x, dy = b.y - a.y;
                      if(Math.abs(dx) >= sx || Math.abs(dy) >= sy) continue;
                      const meme = (a.kind === b.kind) && !a.center && !b.center;
                      const force = meme ? 0.6 : 1;
                      const px = sx - Math.abs(dx), py = sy - Math.abs(dy);
                      const figeA = a.center || a.pinned, figeB = b.center || b.pinned;
                      if(figeA && figeB) continue;
                      // On ecarte par le cote le MOINS enfonce : deplacement le
                      // plus court, donc mise en place la moins brutale.
                      const partA = figeA ? 0 : (figeB ? 1 : 0.5);
                      const partB = figeB ? 0 : (figeA ? 1 : 0.5);
                      if(px < py) {
                          const s = (dx >= 0 ? 1 : -1) * px * force;
                          a.x -= s * partA; b.x += s * partB;
                      } else {
                          const s = (dy >= 0 ? 1 : -1) * py * force;
                          a.y -= s * partA; b.y += s * partB;
                      }
                  }
              }
              N.forEach(n => {
                  n.x = Math.max(n.w / 2 + 6, Math.min(W - n.w / 2 - 6, n.x));
                  n.y = Math.max(n.h / 2 + 6, Math.min(H - n.h / 2 - 6, n.y));
              });
          }
      }
  };
