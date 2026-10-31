import { useEffect, useState } from 'react';

/**
 * Side index for the three sections. Clicking an item scrolls to it; the item for the
 * section currently on screen is highlighted. On narrow screens it becomes a sticky top bar.
 * `items`: [{ id, label }]. `onSelect(id)` runs before scrolling (e.g. to reveal the battery section).
 * `watch`: change it when sections appear so they get observed.
 */
export default function SectionNav({ items, onSelect, watch }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    // Active = the last section whose top has passed 40% of the viewport. At the very bottom of
    // the page the last section wins, so a short final section can still be highlighted.
    function update() {
      const present = items.map((it) => document.getElementById(it.id)).filter(Boolean);
      if (!present.length) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) return setActive(present[present.length - 1].id);
      const line = window.innerHeight * 0.4;
      let current = present[0].id;
      for (const el of present) if (el.getBoundingClientRect().top <= line) current = el.id;
      setActive(current);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items, watch]); // re-run when a section is revealed

  function go(id) {
    onSelect?.(id);
    setActive(id);
    // Wait a tick so a newly revealed section exists before scrolling.
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }

  return (
    <nav className="section-nav" aria-label="Sections">
      <ol>
        {items.map((it, i) => (
          <li key={it.id}>
            <button
              type="button"
              className={active === it.id ? 'is-active' : ''}
              aria-current={active === it.id ? 'true' : undefined}
              onClick={() => go(it.id)}
            >
              <span className="section-nav-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="section-nav-label">{it.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
