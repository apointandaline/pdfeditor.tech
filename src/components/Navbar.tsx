import { NavLink, Link } from 'react-router-dom';

export function Navbar() {
  return (
    <header className="site-nav">
      <Link to="/" className="site-nav__logo">
        PDFEDITS<span className="site-nav__logo-dim">.tech</span>
      </Link>
      <nav className="site-nav__links">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `site-nav__link ${isActive ? 'site-nav__link--active' : ''}`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/editor"
          className={({ isActive }) =>
            `site-nav__link ${isActive ? 'site-nav__link--active' : ''}`
          }
        >
          Editor
        </NavLink>
      </nav>
    </header>
  );
}
