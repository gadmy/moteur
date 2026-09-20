
  const BreakdownExport = {
      exportPDF: async (opts = {}) => {
          await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
          const doc = new jsPDF('p', 'mm', 'a4');
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 15;
          let y = margin;
          
          const projectTitle = state.data.title || 'Projet sans titre';
          const scenes = state.data.scenes || [];
          
          if(scenes.length === 0) {
              Utils.toast('Aucune scène à exporter', 'warning');
              return;
          }
          
          // Couleurs par catégorie
          const catColors = {
              'PERSONNAGES': [76, 175, 80],
              'FIGURANTS': [139, 195, 74],
              'COSTUMES': [156, 39, 176],
              'MAQUILLAGE': [233, 30, 99],
              'ACCESSOIRES': [255, 152, 0],
              'VÉHICULES': [96, 125, 139],
              'DECORS-LIEUX': [33, 150, 243],
              'EFFETS SPÉCIAUX': [244, 67, 54],
              'SONS': [0, 188, 212],
              'ANIMAUX': [121, 85, 72],
              'CASCADES': [255, 87, 34],
              'NOTES': [158, 158, 158]
          };
          
          // ===== PAGE DE GARDE (Phase C.1) — optionnelle =====
          if(opts.includeCover !== false) {
              PdfTheme.coverPage(doc, { sectionName: 'Dépouillement' });
              doc.addPage();
          }
          y = margin;
          
          // Légende des catégories
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
          doc.text('Légende des catégories :', margin, y);
          y += 6;
          
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          let legendX = margin;
          let legendCol = 0;
          Object.entries(catColors).forEach(([cat, rgb], idx) => {
              if(legendCol >= 3) {
                  legendCol = 0;
                  legendX = margin;
                  y += 5;
              }
              doc.setFillColor(rgb[0], rgb[1], rgb[2]);
              doc.circle(legendX + 2, y - 1, 2, 'F');
              doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
              doc.text(cat, legendX + 6, y);
              legendX += 60;
              legendCol++;
          });
          
          y += 15;
          
          // ===== DÉPOUILLEMENT PAR SCÈNE =====
          scenes.forEach((scene, sceneIdx) => {
              const breakdown = scene.breakdown || {};
              const hasContent = Object.values(breakdown).some(arr => arr && arr.length > 0);
              
              if(!hasContent) return;
              
              // Nouvelle page si nécessaire
              if(y > pageHeight - 60) {
                  doc.addPage();
                  y = margin;
              }
              
              // En-tête de scène
              doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
              doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
              doc.setFillColor(...PdfTheme.accentFor('Dépouillement'));
              doc.rect(margin, y, 1.8, 10, 'F');
              doc.setDrawColor(...PdfTheme.COLORS.BORDER);
              doc.rect(margin, y, pageWidth - margin * 2, 10, 'S');
              
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
              const sceneTitle = `#${sceneIdx + 1} - ${scene.title || 'Sans titre'}`;
              doc.text(sceneTitle, margin + 3, y + 7);
              
              // Badge statut
              if(scene.isFinal) {
                  doc.setFillColor(...PdfTheme.COLORS.SUCCESS);
                  doc.setTextColor(...PdfTheme.COLORS.WHITE);
                  doc.roundedRect(pageWidth - margin - 20, y + 2, 18, 6, 1, 1, 'F');
                  doc.setFontSize(6);
                  doc.text('FINAL', pageWidth - margin - 11, y + 6, { align: 'center' });
              } else {
                  doc.setFillColor(...PdfTheme.COLORS.WARNING);
                  doc.setTextColor(...PdfTheme.COLORS.BLACK);
                  doc.roundedRect(pageWidth - margin - 25, y + 2, 23, 6, 1, 1, 'F');
                  doc.setFontSize(6);
                  doc.text('BROUILLON', pageWidth - margin - 13.5, y + 6, { align: 'center' });
              }
              
              y += 14;
              
              // Catégories du dépouillement
              Object.entries(breakdown).forEach(([cat, items]) => {
                  if(!items || items.length === 0) return;
                  
                  if(y > pageHeight - 25) {
                      doc.addPage();
                      y = margin;
                  }
                  
                  const rgb = catColors[cat] || [100, 100, 100];
                  
                  // Nom de la catégorie
                  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
                  doc.circle(margin + 2, y + 1, 2, 'F');
                  doc.setFontSize(9);
                  doc.setFont('helvetica', 'bold');
                  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
                  doc.text(cat, margin + 6, y + 2);
                  
                  // Liste des éléments
                  doc.setFont('helvetica', 'normal');
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                  doc.setFontSize(8);
                  
                  const itemsText = items.map(item => Utils.bdText(item)).join(', ');
                  const lines = doc.splitTextToSize(itemsText, pageWidth - margin * 2 - 10);
                  
                  y += 5;
                  lines.forEach(line => {
                      if(y > pageHeight - 15) {
                          doc.addPage();
                          y = margin;
                      }
                      doc.text(line, margin + 6, y);
                      y += 4;
                  });
                  
                  y += 3;
              });
              
              y += 8;
          });
          
          // ===== RÉCAPITULATIF GLOBAL =====
          doc.addPage();
          y = margin;
          
          PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                      title: 'Récapitulatif global',
                                      accent: PdfTheme.accentFor('Dépouillement') });
          
          y = 30;
          
          // Agrégation par catégorie. On regroupe par nom, mais on retient les
          // FICHES distinctes derriere : deux chemises destinees a deux
          // comediens doivent apparaitre comme « chemise x2 », sans quoi le
          // recapitulatif fait croire a une seule piece a preparer.
          const globalBreakdown = {};
          scenes.forEach(scene => {
              const breakdown = scene.breakdown || {};
              Object.entries(breakdown).forEach(([cat, items]) => {
                  if(!items || items.length === 0) return;
                  if(!globalBreakdown[cat]) globalBreakdown[cat] = new Map();
                  items.forEach(item => {
                      const txt = Utils.bdText(item);
                      if(!globalBreakdown[cat].has(txt)) globalBreakdown[cat].set(txt, new Set());
                      const id = Utils.bdId(item);
                      if(id) globalBreakdown[cat].get(txt).add(id);
                  });
              });
          });
          
          Object.entries(globalBreakdown).forEach(([cat, itemsMap], catIdx) => {
              if(y > pageHeight - 30) {
                  doc.addPage();
                  y = margin;
              }
              
              const rgb = catColors[cat] || [100, 100, 100];
              const items = Array.from(itemsMap.keys());
              
              // Espace avant chaque nouvelle catégorie (sauf la 1ère)
              if(catIdx > 0) y += 4;
              
              // En-tête catégorie
              doc.setFillColor(rgb[0], rgb[1], rgb[2]);
              doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
              doc.setTextColor(...PdfTheme.COLORS.WHITE);
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bold');
              doc.text(PdfTheme.cleanText(`${cat} (${items.length})`), margin + 3, y + 6);
              y += 8;
              
              // Espace entre bandeau coloré et 1ère ligne du tableau
              y += 4;
              
              // Liste
              doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'normal');
              
              items.forEach((item, idx) => {
                  if(y > pageHeight - 15) {
                      doc.addPage();
                      y = margin;
                  }
                  // Compter dans combien de scènes
                  const sceneCount = scenes.filter(s => {
                      const bd = s.breakdown?.[cat] || [];
                      return bd.some(i => Utils.bdText(i) === item);
                  }).length;
                  
                  const nFiches = (itemsMap.get(item) || new Set()).size;
                  const libelle = nFiches > 1 ? `${item} x${nFiches}` : item;
                  let itemTxt = PdfTheme.cleanText(`• ${libelle}`);
                  while(doc.getTextWidth(itemTxt) > pageWidth - margin * 2 - 30 && itemTxt.length > 5) itemTxt = itemTxt.substring(0, itemTxt.length - 2) + '...';
                  doc.text(itemTxt, margin + 3, y);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                  doc.text(`(${sceneCount} scène${sceneCount > 1 ? 's' : ''})`, pageWidth - margin - 3, y, { align: 'right' });
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                  y += 4.5;
              });
              
              y += 6;
          });
          
          // ===== FOOTERS UNIFIÉS (Phase C.1) =====
          PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
          
          // ===== TÉLÉCHARGEMENT (nom unifié) =====
          if(opts.returnBlob) return doc.output('blob');
          doc.save(PdfTheme.filename('Dépouillement'));
          
          Utils.toast('Dépouillement PDF exporté !', 'success');
          History.log('EXPORT', 'Dépouillement PDF généré');
      }
  };
