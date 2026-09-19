
  const Icons = {
      currentStyle: 'duotone',
      
      map: {
          // Navigation
          'user':         { svg: 'ico-user', emoji: '👤', cat: 'system' },
          'users':        { svg: 'ico-users', emoji: '👥', cat: 'casting' },
          'folder':       { svg: 'ico-folder', emoji: '📁', cat: 'system' },
          'contact':      { svg: 'ico-contact', emoji: '📇', cat: 'system' },
          // Écriture
          'scenario':     { svg: 'ico-file-text', emoji: '📝', cat: 'writing' },
          'synopsis':     { svg: 'ico-book-open', emoji: '📖', cat: 'writing' },
          'sequencer':    { svg: 'ico-clapperboard', emoji: '🎬', cat: 'writing' },
          'title-page':   { svg: 'ico-film', emoji: '🎞️', cat: 'writing' },
          // Visuel
          'storyboard':   { svg: 'ico-grid', emoji: '🎨', cat: 'visual' },
          'moodboard':    { svg: 'ico-image', emoji: '🖼️', cat: 'visual' },
          'palette':      { svg: 'ico-palette', emoji: '🎨', cat: 'visual' },
          // Casting
          'casting':      { svg: 'ico-theater', emoji: '🎭', cat: 'casting' },
          'actor':        { svg: 'ico-star', emoji: '⭐', cat: 'casting' },
          // Production
          'breakdown':    { svg: 'ico-clipboard', emoji: '📋', cat: 'production' },
          'planning':     { svg: 'ico-calendar', emoji: '📅', cat: 'production' },
          'location':     { svg: 'ico-map-pin', emoji: '📍', cat: 'production' },
          'crew':         { svg: 'ico-users', emoji: '👥', cat: 'production' },
          'resources':    { svg: 'ico-box', emoji: '📦', cat: 'production' },
          'report':       { svg: 'ico-clipboard', emoji: '📋', cat: 'production' },
          // Admin
          'expenses':     { svg: 'ico-wallet', emoji: '💰', cat: 'admin' },
          'contract':     { svg: 'ico-file-signature', emoji: '📄', cat: 'admin' },
          'stats':        { svg: 'ico-chart', emoji: '📊', cat: 'admin' },
          'presentation': { svg: 'ico-monitor', emoji: '🖥️', cat: 'admin' },
          'settings':     { svg: 'ico-settings', emoji: '⚙️', cat: 'system' },
          // Social
          'forum':        { svg: 'ico-message', emoji: '💬', cat: 'social' },
          'feed':         { svg: 'ico-rss', emoji: '📰', cat: 'social' },
          'message':      { svg: 'ico-mail', emoji: '✉️', cat: 'social' },
          'notification': { svg: 'ico-bell', emoji: '🔔', cat: 'social' },
          'community':    { svg: 'ico-globe', emoji: '🌐', cat: 'social' },
          'universe':     { svg: 'ico-globe', emoji: '🌍', cat: 'social' },
          'collaboration':{ svg: 'ico-users', emoji: '🤝', cat: 'social' },
          // Aide
          'help':         { svg: 'ico-help', emoji: '❓', cat: 'help' },
          'guide':        { svg: 'ico-book', emoji: '📖', cat: 'help' },
          'course':       { svg: 'ico-graduation', emoji: '🎓', cat: 'help' },
          // Interface
          'design':       { svg: 'ico-palette', emoji: '🎨', cat: 'system' },
          'theme-light':  { svg: 'ico-sun', emoji: '☀️', cat: 'system' },
          'theme-dark':   { svg: 'ico-moon', emoji: '🌙', cat: 'system' },
          'focus':        { svg: 'ico-maximize', emoji: '🖥️', cat: 'system' },
          'search':       { svg: 'ico-search', emoji: '🔍', cat: 'system' },
          'plus':         { svg: 'ico-plus', emoji: '➕', cat: 'system' },
          'close':        { svg: 'ico-x', emoji: '✖️', cat: 'system' },
          'check':        { svg: 'ico-check', emoji: '✅', cat: 'system' },
          'back':         { svg: 'ico-arrow-left', emoji: '⬅️', cat: 'system' },
          'download':     { svg: 'ico-download', emoji: '📥', cat: 'system' },
          'upload':       { svg: 'ico-upload', emoji: '📤', cat: 'system' },
          'export':       { svg: 'ico-download', emoji: '📤', cat: 'system' },
          'save':         { svg: 'ico-save', emoji: '💾', cat: 'system' },
          'delete':       { svg: 'ico-trash', emoji: '🗑️', cat: 'system' },
          'edit':         { svg: 'ico-edit', emoji: '✏️', cat: 'system' },
          'view':         { svg: 'ico-eye', emoji: '👁️', cat: 'system' },
          'shortcuts':    { svg: 'ico-keyboard', emoji: '⌨️', cat: 'system' },
          'interface':    { svg: 'ico-layers', emoji: '📐', cat: 'system' },
          'link':         { svg: 'ico-link', emoji: '🔗', cat: 'system' },
          'share':        { svg: 'ico-share', emoji: '🔗', cat: 'social' },
          'heart':        { svg: 'ico-heart', emoji: '❤️', cat: 'social' },
          'clock':        { svg: 'ico-clock', emoji: '🕐', cat: 'system' },
          'home':         { svg: 'ico-home', emoji: '🏠', cat: 'system' },
          'car':          { svg: 'ico-car', emoji: '🚗', cat: 'production' },
          'costume':      { svg: 'ico-shirt', emoji: '👗', cat: 'production' },
      },
      
      styles: {
          'duotone':  { name: 'Duotone', emoji: '◐' }
      },
      
      init: () => {
          Icons.currentStyle = 'duotone';
          document.body.classList.add('icon-style-duotone');
      },
      
      // Icons.render / Icons.emoji retirées v569, jamais appelées : les
      // icônes sont toujours écrites en HTML littéral (span.moteur-icon) au
      // lieu de passer par ce générateur.
  };
