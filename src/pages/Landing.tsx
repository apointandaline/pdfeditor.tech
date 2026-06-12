import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';

interface Feature {
  num: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    num: '01',
    title: 'Edit existing text',
    body: 'Click any word in the PDF, replace it inline. Click without typing and the original snaps back.',
  },
  {
    num: '02',
    title: 'Insert text & images',
    body: 'Drop a text box anywhere, upload PNG / JPEG / WebP and place it with a click.',
  },
  {
    num: '03',
    title: 'Draw & annotate',
    body: 'Pen, highlighter, line, arrow, rectangle, ellipse. Resize and reshape any annotation.',
  },
  {
    num: '04',
    title: 'Save offline',
    body: 'Everything runs in your browser. Your files never leave your machine. Save as PDF when done.',
  },
];

export function Landing() {
  return (
    <div className="landing">
      <Navbar />
      <main className="landing__main">
        <section className="hero">
          <div className="hero__label">// PDFEDITOR.TECH · client-side</div>
          <h1 className="hero__title">
            Edit PDFs in your<br />browser. <em>No upload.</em>
          </h1>
          <p className="hero__tagline">
            A free, offline-friendly PDF editor that runs entirely client-side.
            Text, images, drawings — all happens in your browser. Files never
            leave your machine.
          </p>
          <Link to="/editor" className="hero__cta">
            Launch Editor
            <span className="hero__cta-arrow">→</span>
          </Link>
        </section>

        <section className="features" aria-label="Features">
          {FEATURES.map((f) => (
            <article key={f.num} className="feature">
              <div className="feature__num">{f.num}</div>
              <h2 className="feature__title">{f.title}</h2>
              <p className="feature__body">{f.body}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="landing__footer">
        <span>&copy; {new Date().getFullYear()} pdfeditor.tech</span>
        <span>
          <a href="https://github.com/apointandaline/pdfeditor.tech" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
