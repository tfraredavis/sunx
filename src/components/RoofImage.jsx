import { useEffect, useState } from 'react';

/**
 * Sunroof-style roof picture (aerial photo + annual sunlight heatmap) from /api/roof.
 * Renders nothing if the address has no Solar API coverage or the service is unavailable.
 */
export default function RoofImage({ lat, lon }) {
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let cancelled = false;
    setState({ status: 'loading', data: null });
    fetch('/api/roof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat, lon }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('[sunx] roof failed', r.status, body);
          throw new Error(body.error);
        }
        return body;
      })
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch(() => !cancelled && setState({ status: 'none', data: null }));
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (state.status === 'none') return null;

  return (
    <figure className="roof">
      {state.status === 'loading' ? (
        <div className="roof-frame roof-loading">
          <span className="spinner" aria-hidden="true" />
        </div>
      ) : (
        <img className="roof-frame" src={state.data.image} alt="Aerial view of your roof shaded by yearly sunlight" />
      )}
      <figcaption>
        <span className="roof-scale">
          <span>Less sun</span>
          <span className="roof-gradient" aria-hidden="true" />
          <span>More sun</span>
        </span>
        <span className="roof-credit">
          Imagery and data © Google{state.data?.imageryDate ? ` · ${state.data.imageryDate}` : ''}
        </span>
      </figcaption>
    </figure>
  );
}
