// lang.js
// Requires i18next and optionally i18next-http-backend
// Include in HTML before lang.js:
// <script src="https://unpkg.com/i18next@23.0.1/dist/umd/i18next.min.js"></script>
// <script src="https://unpkg.com/i18next-http-backend@2.2.1/i18nextHttpBackend.min.js"></script>

(function() {
  // Update all elements with data-i18n, allowing HTML
  function updateTexts() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.innerHTML = i18next.t(key); // use innerHTML instead of textContent
    });
  }

  // Detect browser language
  function detectUserLanguage() {
    const lang = navigator.language || navigator.userLanguage || 'en';
    return lang.split('-')[0]; // e.g., "en-US" -> "en"
  }

  // Initialize i18next
  i18next
    .use(i18nextHttpBackend)
    .init({
      lng: detectUserLanguage(),
      fallbackLng: 'en',
      debug: false,
      interpolation: {
        escapeValue: false // important to allow HTML tags in translations
      },
      backend: {
        loadPath: '/content/locales/{{lng}}.json'
      }
    }, function(err, t) {
      if (err) console.error('i18next init error:', err);
      updateTexts();
    });

  // Public function to change language
  window.setLanguage = function(lang) {
    i18next.changeLanguage(lang, (err, t) => {
      if (err) console.error('Language change error:', err);
      updateTexts();
    });
  };
})();