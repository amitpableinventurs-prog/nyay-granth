// Every module in the app, grouped as in the project blueprint. Used by the drawer and the "More" screen.
export const MENU = [
  {
    group: 'Study',
    items: [
      { to: '/library', label: 'Text Library', icon: 'bi-book', color: '#1e5bd8' },
      { to: '/ai', label: 'AI Assistance', icon: 'bi-robot', color: '#6d3fd1' },
      { to: '/pdfs', label: 'PDF Library', icon: 'bi-file-earmark-pdf', color: '#c2410c' },
      { to: '/audio', label: 'Audio', icon: 'bi-volume-up', color: '#f07a1a' },
      { to: '/presentations', label: 'PPT Viewer', icon: 'bi-easel', color: '#e0453a' },
      { to: '/search', label: 'Search', icon: 'bi-search', color: '#1a9a5b' },
      { to: '/bookmarks', label: 'Bookmarks', icon: 'bi-bookmark-star', color: '#13858f' },
      { to: '/notes', label: 'Notes', icon: 'bi-journal-richtext', color: '#3b4cc0' },
      { to: '/dictionary', label: 'Nyāya Dictionary', icon: 'bi-translate', color: '#9a3412' },
    ],
  },
  {
    group: 'Research Tools',
    items: [
      { to: '/tools/ocr', label: 'Sanskrit OCR', icon: 'bi-camera', color: '#0f766e' },
      { to: '/tools/sloka', label: 'Śloka Analyzer', icon: 'bi-soundwave', color: '#7c3aed' },
      { to: '/tools/transliterate', label: 'Voice & Script Input', icon: 'bi-mic', color: '#be185d' },
      { to: '/tools/citation', label: 'Citation Generator', icon: 'bi-quote', color: '#0369a1' },
      { to: '/tools/templates', label: 'Paper Templates', icon: 'bi-file-earmark-text', color: '#4d7c0f' },
      { to: '/learning-path', label: 'Learning Path', icon: 'bi-signpost-split', color: '#b45309' },
    ],
  },
  {
    group: 'Community',
    items: [
      { to: '/forum', label: 'Discussion Forum', icon: 'bi-chat-square-text', color: '#2563eb' },
      { to: '/classes', label: 'My Classes', icon: 'bi-mortarboard', color: '#0f766e' },
      { to: '/events', label: 'Live Classes', icon: 'bi-camera-video', color: '#dc2626' },
      { to: '/scholars', label: 'Scholar Profiles', icon: 'bi-person-badge', color: '#0891b2' },
      { to: '/reviews', label: 'Reviews', icon: 'bi-star', color: '#ca8a04' },
    ],
  },
  {
    group: 'Marketplace',
    items: [
      { to: '/shop', label: 'Shop', icon: 'bi-bag', color: '#b45309' },
      { to: '/vendor', label: 'Sell with us', icon: 'bi-shop', color: '#0f766e' },
    ],
  },
  {
    group: 'Account & Help',
    items: [
      { to: '/plans', label: 'Membership', icon: 'bi-gem', color: '#7c3aed' },
      { to: '/profile', label: 'Profile & Analytics', icon: 'bi-person-circle', color: '#1e3a8a' },
      { to: '/notifications', label: 'Notifications', icon: 'bi-bell', color: '#16a34a' },
      { to: '/archives', label: 'Archives', icon: 'bi-archive', color: '#1e3a8a' },
      { to: '/helpdesk', label: 'Publication Help Desk', icon: 'bi-headset', color: '#0d9488' },
      { to: '/feedback', label: 'Feedback', icon: 'bi-chat-heart', color: '#2563eb' },
      { to: '/contact', label: 'Contact Us', icon: 'bi-envelope', color: '#1d4ed8' },
      { to: '/about', label: 'About Us', icon: 'bi-info-circle', color: '#1e40af' },
    ],
  },
];

export const BOTTOM_NAV = [
  { to: '/', label: 'Home', icon: 'bi-house-door' },
  { to: '/library', label: 'Library', icon: 'bi-book' },
  { to: '/search', label: 'Search', icon: 'bi-search' },
  { to: '/ai', label: 'AI', icon: 'bi-robot' },
  { to: '/more', label: 'More', icon: 'bi-grid' },
];
