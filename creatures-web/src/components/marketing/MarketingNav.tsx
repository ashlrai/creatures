import { useState, useEffect, useCallback } from 'react';

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Science', href: '#science' },
  { label: 'Use Cases', href: '#use-cases' },
] as const;

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      e.preventDefault();
      const id = href.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      setMenuOpen(false);
    },
    [],
  );

  return (
    <nav
      className={`hp-nav${scrolled ? ' hp-nav--scrolled' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="hp-nav__inner">
        <a href="#/" className="hp-nav__wordmark">
          Neurevo
        </a>

        <button
          className="hp-nav__hamburger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation menu"
        >
          <span className="hp-nav__hamburger-bar" />
          <span className="hp-nav__hamburger-bar" />
          <span className="hp-nav__hamburger-bar" />
        </button>

        <div className={`hp-nav__links${menuOpen ? ' hp-nav__links--open' : ''}`}>
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="hp-nav__link"
              onClick={(e) => handleNavClick(e, href)}
            >
              {label}
            </a>
          ))}
          <a href="#/app/sim/c_elegans" className="hp-nav__cta">
            Launch Platform
          </a>
        </div>
      </div>
    </nav>
  );
}
