export const THEME_STORAGE_KEY = 'cevi-theme';

/**
 * Setzt das gespeicherte Farbschema, bevor React hydriert (kein Aufblitzen).
 * In <head> des Root-Layouts rendern; <html> braucht `suppressHydrationWarning`.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
