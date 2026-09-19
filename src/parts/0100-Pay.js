
  const Pay = {
      // Brut affiché / contrats : nouveau champ, repli sur l'ancien tarif unique
      gross: (p) => (p && (p.salaryGross || p.dailyRate)) || '',
      net: (p) => (p && p.salaryNet) || '',
      budget: (p) => (p && p.salaryBudget) || '',
      // Montant retenu pour les coûts production : budget HT > brut > ancien tarif
      cost: (p) => parseFloat((p && (p.salaryBudget || p.salaryGross || p.dailyRate)) || 0) || 0,
      // Placeholders d'estimation depuis le premier montant connu (brut prioritaire)
      estimates: (p) => {
          const r = CONFIG.salaryRatios || { netFromGross: 0.78, budgetFromGross: 1.45 };
          const g0 = parseFloat(Pay.gross(p)) || 0;
          const n0 = parseFloat(Pay.net(p)) || 0;
          const b0 = parseFloat(Pay.budget(p)) || 0;
          const gross = g0 || (n0 ? n0 / r.netFromGross : 0) || (b0 ? b0 / r.budgetFromGross : 0);
          if(!gross) return { gross: 'Brut', net: 'Net', budget: 'Budget HT' };
          const f = (x) => '\u2248 ' + (Math.round(x * 100) / 100);
          return { gross: f(gross), net: f(gross * r.netFromGross), budget: f(gross * r.budgetFromGross) };
      }
  };

  // === GÉO : autocomplétion des communes via geo.api.gouv.fr (gratuit, sans clé) ===