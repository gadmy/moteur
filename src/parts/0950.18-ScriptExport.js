

// ========== MODULE EXPORT SCÉNARIO ==========
const ScriptExport = {
    // Convertit le HTML du scénario en texte brut avec type de bloc
    parseScriptContent: (html) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const blocks = [];
        
        temp.querySelectorAll('div, p').forEach(el => {
            const text = el.innerText.trim();
            if(!text) return;
            
            let type = 'action';
            if(el.classList.contains('sc-action')) type = 'action';
            else if(el.classList.contains('sc-perso')) type = 'character';
            else if(el.classList.contains('sc-dial')) type = 'dialogue';
            else if(el.classList.contains('sc-paren')) type = 'parenthetical';
            else if(el.classList.contains('sc-trans')) type = 'transition';
            else if(el.classList.contains('sc-centered')) type = 'centered';
            else if(el.classList.contains('sc-note')) type = 'note';
            else if(el.classList.contains('sc-general')) type = 'general';
            
            blocks.push({ type, text });
        });
        
        return blocks;
    },
    
    // ========== EXPORT FOUNTAIN ==========
    toFountain: () => {
        if(!state.data.scenes || state.data.scenes.length === 0) {
            Utils.toast('Aucune scène à exporter', 'warning');
            return;
        }
        
        let fountain = '';
        const meta = state.data.scriptMeta || {};
        
        // Page de titre (format Fountain)
        fountain += `Title: ${state.data.title || 'Sans titre'}\n`;
        if(meta.author) {
            fountain += `Author: ${meta.author}`;
            if(meta.coAuthor) fountain += ` & ${meta.coAuthor}`;
            fountain += '\n';
        }
        if(meta.draft) fountain += `Draft date: ${meta.draft}${meta.draftDate ? ' - ' + meta.draftDate : ''}\n`;
        if(meta.contact) fountain += `Contact: ${meta.contact}\n`;
        if(meta.copyright) fountain += `Copyright: ${meta.copyright}\n`;
        if(meta.source) fountain += `Credit: Basé sur ${meta.source}\n`;
        if(meta.notes) fountain += `Notes: ${meta.notes}\n`;
        fountain += '\n';
        
        // Scènes
        state.data.scenes.forEach((scene, idx) => {
            // Scene heading (forcer avec .)
            const heading = scene.title.toUpperCase();
            if(heading.match(/^(INT|EXT|I\/E|INT\.\/EXT)/)) {
                fountain += `\n${heading}\n\n`;
            } else {
                fountain += `\n.${heading}\n\n`;
            }
            
            // Contenu de la scène
            const blocks = ScriptExport.parseScriptContent(scene.scriptContent || '');
            
            blocks.forEach(block => {
                switch(block.type) {
                    case 'action':
                        fountain += `${block.text}\n\n`;
                        break;
                    case 'character':
                        fountain += `${block.text.toUpperCase()}\n`;
                        break;
                    case 'dialogue':
                        fountain += `${block.text}\n\n`;
                        break;
                    case 'parenthetical':
                        const paren = block.text.startsWith('(') ? block.text : `(${block.text})`;
                        fountain += `${paren}\n`;
                        break;
                    case 'transition':
                        fountain += `> ${block.text.toUpperCase()}\n\n`;
                        break;
                    case 'centered':
                        fountain += `> ${block.text} <\n\n`;
                        break;
                    case 'note':
                        fountain += `[[${block.text}]]\n\n`;
                        break;
                    case 'general':
                        fountain += `/* ${block.text} */\n\n`;
                        break;
                }
            });
        });
        
        // Télécharger le fichier
        const filename = (state.data.title || 'scenario').replace(/[^a-z0-9]/gi, '_') + '.fountain';
        ScriptExport.downloadFile(fountain, filename, 'text/plain');
        Utils.toast('Export Fountain réussi !', 'success');
    },
    
    // ========== EXPORT FDX (Final Draft) ==========
    toFDX: () => {
        if(!state.data.scenes || state.data.scenes.length === 0) {
            Utils.toast('Aucune scène à exporter', 'warning');
            return;
        }
        
        const meta = state.data.scriptMeta || {};
        
        // Construire le XML FDX
        let fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <TitlePage>
      <Content>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>${ScriptExport.escapeXml(state.data.title || 'Sans titre')}</Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text></Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>écrit par</Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.author || '')}${meta.coAuthor ? ' & ' + ScriptExport.escapeXml(meta.coAuthor) : ''}</Text>
        </Paragraph>`;
        
        if(meta.source) {
            fdx += `
        <Paragraph Alignment="Center" Type="Title Page">
          <Text></Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>Basé sur ${ScriptExport.escapeXml(meta.source)}</Text>
        </Paragraph>`;
        }
        
        fdx += `
        <Paragraph Alignment="Left" Type="Title Page">
          <Text></Text>
        </Paragraph>
        <Paragraph Alignment="Left" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.draft || '')}${meta.draftDate ? ' - ' + meta.draftDate : ''}</Text>
        </Paragraph>
        <Paragraph Alignment="Left" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.contact || '')}</Text>
        </Paragraph>`;
        
        if(meta.copyright) {
            fdx += `
        <Paragraph Alignment="Left" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.copyright)}</Text>
        </Paragraph>`;
        }
        
        fdx += `
      </Content>
    </TitlePage>
`;
        
        // Scènes
        state.data.scenes.forEach((scene, idx) => {
            // Scene Heading
            fdx += `    <Paragraph Type="Scene Heading" Number="${idx + 1}">
      <Text>${ScriptExport.escapeXml(scene.title.toUpperCase())}</Text>
    </Paragraph>\n`;
            
            // Contenu
            const blocks = ScriptExport.parseScriptContent(scene.scriptContent || '');
            
            blocks.forEach(block => {
                let fdxType = 'Action';
                switch(block.type) {
                    case 'action': fdxType = 'Action'; break;
                    case 'character': fdxType = 'Character'; break;
                    case 'dialogue': fdxType = 'Dialogue'; break;
                    case 'parenthetical': fdxType = 'Parenthetical'; break;
                    case 'transition': fdxType = 'Transition'; break;
                    case 'centered': fdxType = 'Action'; break; // FDX n'a pas de type centré natif
                    case 'note': fdxType = 'Action'; break;
                    case 'general': fdxType = 'General'; break;
                }
                
                let text = block.text;
                if(block.type === 'note') text = `[NOTE: ${text}]`;
                
                fdx += `    <Paragraph Type="${fdxType}"${block.type === 'centered' ? ' Alignment="Center"' : ''}>
      <Text>${ScriptExport.escapeXml(text)}</Text>
    </Paragraph>\n`;
            });
        });
        
        fdx += `  </Content>
</FinalDraft>`;
        
        // Télécharger le fichier
        const filename = (state.data.title || 'scenario').replace(/[^a-z0-9]/gi, '_') + '.fdx';
        ScriptExport.downloadFile(fdx, filename, 'application/xml');
        Utils.toast('Export Final Draft réussi !', 'success');
    },
    
    // Utilitaires
    escapeXml: (str) => {
        if(!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
    },
    
    downloadFile: (content, filename, mimeType) => {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
