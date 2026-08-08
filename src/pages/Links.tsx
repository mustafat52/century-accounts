import { useMemo } from 'react';
import Topbar from '../components/Topbar';
import LinkModal from '../components/LinkModal';
import { useApp } from '../context/AppContext';

export default function Links() {
  const { links, openLinkModal } = useApp();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof links>();
    links.forEach((link) => {
      const key = link.category || 'General';
      const list = map.get(key) ?? [];
      list.push(link);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [links]);

  return (
    <>
      <Topbar title="Important Links" subtitle="Every link the business uses regularly, in one place" />
      <div className="view-body">
        <div className="chip-row">
          <button className="btn btn-ghost btn-small desktop-only" onClick={openLinkModal}>
            + New Link
          </button>
        </div>

        {grouped.map(([category, categoryLinks]) => (
          <div className="panel" key={category}>
            <div className="panel-head">
              <h3>{category}</h3>
            </div>
            {categoryLinks.map((link) => (
              <a key={link.id} className="link-row" href={link.url} target="_blank" rel="noreferrer">
                <div>
                  <div className="link-label">{link.label}</div>
                  <div className="link-url">{link.url}</div>
                </div>
              </a>
            ))}
          </div>
        ))}

        {links.length === 0 && (
          <div className="panel">
            <div style={{ padding: 20 }} className="row-sub">
              No links saved yet.
            </div>
          </div>
        )}
      </div>
      <LinkModal />
    </>
  );
}