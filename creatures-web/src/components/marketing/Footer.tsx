const FOOTER_LINKS = [
  { label: 'Platform', href: '#/app/sim/c_elegans' },
  { label: 'GitHub', href: '#' },
  { label: 'Documentation', href: '#' },
] as const;

export function Footer() {
  return (
    <footer className="hp-footer" role="contentinfo">
      <div className="hp-footer__inner">
        <span className="hp-footer__wordmark">Neurevo</span>
        <nav className="hp-footer__links" aria-label="Footer navigation">
          {FOOTER_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="hp-footer__link">
              {label}
            </a>
          ))}
        </nav>
        <p className="hp-footer__copy">2026 Neurevo. Connectome-driven virtual organisms.</p>
      </div>
    </footer>
  );
}
