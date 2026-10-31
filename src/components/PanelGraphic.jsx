/**
 * Visual electrical panel. Two columns in slot order (odd left, even right); 2-pole breakers are double
 * height; circuits sharing a slot (tandems) stack inside one cell. Tap a breaker to put it on / take it off backup.
 * Breakers on backup are dark orange; shed breakers are gray.
 */
export default function PanelGraphic({ panels, selected, onToggle }) {
  return (
    <div className="panels">
      {panels.map((panel, pi) => {
        // Each column is its own stack in slot order (odd left, even right), so a 2-pole breaker and
        // the circuit below it can never overlap even if slot numbers conflict. Circuits sharing a
        // slot (tandems) stack inside one cell; 2-pole cells are double height.
        const columns = [new Map(), new Map()];
        panel.breakers.forEach((b, bi) => {
          const col = columns[b.slot % 2 === 1 ? 0 : 1];
          if (!col.has(b.slot)) col.set(b.slot, { slot: b.slot, span: 1, items: [] });
          const cell = col.get(b.slot);
          cell.span = Math.max(cell.span, b.poles);
          cell.items.push({ ...b, id: `${pi}-${bi}` });
        });

        return (
          <figure key={pi} className="panel">
            <figcaption>
              <span className="panel-name">{panel.name}</span>
              {panel.mainAmps && <span className="panel-main">{panel.mainAmps}A main</span>}
            </figcaption>
            <div className="panel-grid">
              {columns.map((col, ci) => (
                <div key={ci} className={`panel-col side-${ci + 1}`}>
                  {[...col.values()]
                    .sort((x, y) => x.slot - y.slot)
                    .map((cell) => (
                      <div key={cell.slot} className={`panel-cell span-${cell.span}`}>
                        {cell.items.map((b) => {
                          const on = selected.has(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className={`breaker${on ? ' is-on' : ''}${b.poles === 2 ? ' is-2p' : ''}`}
                              aria-pressed={on}
                              title={on ? 'On backup — tap to shed' : 'Shed — tap to put on backup'}
                              onClick={() => onToggle(b.id)}
                            >
                              <span className="breaker-label">{b.label || 'Unlabeled'}</span>
                              <span className="breaker-amps">
                                {b.amps ? `${b.amps}A` : '—'}
                                {b.poles === 2 ? ' · 2P' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </figure>
        );
      })}
    </div>
  );
}
