// GENERIERT aus hilfe/branding.template.js und packages/shared/src/organizations.ts (npm run generate).
// Nicht von Hand aendern: Verbandsdaten (Domain, Name, Farbe, Logo) kommen aus organizations.ts.
// Client-seitiges dynamisches Branding & Favicon fuer alle Verbaende / Organisationen.
(function () {
  const ORGS = {
    "cevi": {
      "slug": "cevi",
      "name": "Cevi Schichtplan",
      "shortName": "Cevi",
      "domain": "cevi-schichtplan.ch",
      "unitTerm": "Abteilung",
      "unitTermPlural": "Abteilungen",
      "leadTerm": "Abteilungsleitung",
      "nicknameTerm": "Cevi-Name",
      "authProvider": "Cevi.DB (Hitobito)",
      "logo": "/cevi-logo.svg",
      "accent": "225 29 72",
      "accentInkLight": "190 18 60",
      "accentInkDark": "251 113 133",
      "accentFg": "255 255 255"
    },
    "pfadi": {
      "slug": "pfadi",
      "name": "Pfadi Schichtplan",
      "shortName": "Pfadi",
      "domain": "pfadi-schichtplan.ch",
      "unitTerm": "Abteilung",
      "unitTermPlural": "Abteilungen",
      "leadTerm": "Abteilungsleitung",
      "nicknameTerm": "Pfadiname",
      "authProvider": "PBS MiData (Hitobito)",
      "logo": "/pfadi-schichtplan-logo.svg",
      "notice": "Unabhängiges Projekt, nicht von der Pfadibewegung Schweiz (PBS) betrieben oder herausgegeben.",
      "accent": "32 85 62",
      "accentInkLight": "32 85 62",
      "accentInkDark": "93 187 138",
      "accentFg": "255 255 255"
    },
    "jubla": {
      "slug": "jubla",
      "name": "Jubla Schichtplan",
      "shortName": "Jubla",
      "domain": "jubla-schichtplan.ch",
      "unitTerm": "Schar",
      "unitTermPlural": "Scharen",
      "leadTerm": "Scharleitung",
      "nicknameTerm": "Leitername",
      "authProvider": "Jubla-Datenbank (Hitobito)",
      "logo": "/jubla-logo.svg",
      "accent": "40 53 131",
      "accentInkLight": "40 53 131",
      "accentInkDark": "102 177 226",
      "accentFg": "255 255 255"
    },
    "verein": {
      "slug": "verein",
      "name": "Vereins Schichtplan",
      "shortName": "Verein",
      "domain": "vereins-schichtplan.ch",
      "unitTerm": "Verein",
      "unitTermPlural": "Vereine",
      "leadTerm": "Vereinsleitung / Vorstand",
      "nicknameTerm": "Spitzname",
      "authProvider": "E-Mail & Passwort",
      "logo": "/verein-logo.svg",
      "accent": "37 99 235",
      "accentInkLight": "29 78 216",
      "accentInkDark": "147 197 253",
      "accentFg": "255 255 255"
    }
  };
  // Auch fuer andere Skripte der Seite (z. B. den Ruecksprung in der Kopfzeile)
  window.SCHICHTPLAN_ORGS = ORGS;

  // Verband aus einem Text (Hostname, Rücksprung-URL): erst die Verbände mit eigener Kennung, dann Cevi
  function orgFromText(text) {
    const own = Object.values(ORGS).find((o) => o.slug !== 'cevi' && text.includes(o.slug));
    if (own) return own;
    return text.includes('cevi') ? ORGS.cevi : null;
  }

  function detectOrg() {
    const host = window.location.hostname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const orgParam = params.get('org');
    if (orgParam && ORGS[orgParam]) return ORGS[orgParam];

    // Der Host der Hilfe-Seite hat Vorrang vor einem gemerkten Rücksprung
    const byHost = orgFromText(host);
    if (byHost) return byHost;

    // Check referrer or sessionStorage for return_url
    try {
      const returnUrl = sessionStorage.getItem('schichtplan_return_url');
      if (returnUrl) {
        const byReturn = orgFromText(returnUrl);
        if (byReturn) return byReturn;
      }
    } catch (_) {}

    return ORGS.cevi;
  }

  const org = detectOrg();

  // 1. CSS-Variablen sofort auf :root setzen (verhindert FOUC)
  function applyThemeVariables() {
    const root = document.documentElement;
    root.setAttribute('data-org', org.slug);
    root.style.setProperty('--accent', org.accent);
    root.style.setProperty('--accent-fg', org.accentFg);
    root.style.setProperty('--accent-ink-light', org.accentInkLight);
    root.style.setProperty('--accent-ink-dark', org.accentInkDark);

    const isDark =
      root.dataset.theme === 'dark' ||
      (root.dataset.theme !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.style.setProperty(
      '--accent-ink',
      isDark ? org.accentInkDark : org.accentInkLight
    );
  }

  // 2. Favicon & Apple-Touch-Icon dynamisch setzen
  function applyFavicon() {
    if (!document.head) return;
    const iconUrl = org.logo;

    // Bestehende Icon-Tags entfernen/bereinigen, damit der Browser nicht das alte Icon cached
    document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());

    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/svg+xml';
    iconLink.href = iconUrl;
    document.head.appendChild(iconLink);

    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = iconUrl;
    document.head.appendChild(appleLink);
  }

  applyThemeVariables();
  applyFavicon();

  // Theme-Umschaltung beobachten
  const observer = new MutationObserver(() => applyThemeVariables());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // 3. DOM-Elemente aktualisieren, sobald verfuegbar
  function updateDom() {
    applyThemeVariables();
    applyFavicon();

    // Logo & Titel im Header
    document.querySelectorAll('[data-org-logo]').forEach((img) => {
      img.setAttribute('src', org.logo);
      img.setAttribute('alt', `${org.name} Logo`);
    });

    document.querySelectorAll('[data-org-sub]').forEach((el) => {
      el.textContent = org.name;
    });

    document.querySelectorAll('[data-org-title-link]').forEach((el) => {
      el.setAttribute('aria-label', `${org.name} Hilfe, Startseite`);
    });

    // App-Links & Ruecksprung
    document.querySelectorAll('[data-app-link]').forEach((a) => {
      const current = a.getAttribute('href') || '';
      if (current.includes('cevi-schichtplan.ch') && org.slug !== 'cevi') {
        a.setAttribute('href', `https://${org.domain}`);
      }
    });

    // Footer-Elemente
    document.querySelectorAll('[data-footer-copyright]').forEach((el) => {
      const year = new Date().getFullYear();
      el.innerHTML = `&copy; ${year} ${org.name} &middot; ehrenamtlich &amp; Open Source${org.notice ? ' &middot; ' + org.notice : ''}`;
    });

    document.querySelectorAll('[data-footer-app-domain]').forEach((a) => {
      a.setAttribute('href', `https://${org.domain}`);
      a.textContent = org.domain;
    });

    document.querySelectorAll('[data-footer-login-domain]').forEach((a) => {
      a.setAttribute('href', `https://login.${org.domain}`);
    });

    document.querySelectorAll('[data-footer-status-domain]').forEach((a) => {
      a.setAttribute('href', `https://status.${org.domain}`);
    });

    document.querySelectorAll('[data-footer-privacy-domain]').forEach((a) => {
      a.setAttribute('href', `https://${org.domain}/datenschutz`);
    });

    // Seitentitel im Tab aktualisieren (falls noetig)
    if (document.title.includes('Cevi Schichtplan') && org.slug !== 'cevi') {
      document.title = document.title.replace(/Cevi Schichtplan/g, org.name);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateDom);
  } else {
    updateDom();
  }
})();
