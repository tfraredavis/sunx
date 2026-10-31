import { useRef, useState } from 'react';
import { fileToPayload } from '../lib/fileToPayload.js';

/**
 * Upload any number of panel photos / PDFs. Each file is read separately by /api/parse-panel
 * and the panels found are passed to onPanels (appended to any already read).
 */
export default function PanelUpload({ onPanels, onSkip, hasPanels }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(null); // { done, total } while reading
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);

  async function readFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    setErrors([]);
    const found = [];
    const errs = [];
    for (let i = 0; i < files.length; i++) {
      setBusy({ done: i, total: files.length });
      const f = files[i];
      try {
        const payload = await fileToPayload(f);
        const r = await fetch('/api/parse-panel', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('[sunx] parse-panel failed', r.status, body);
          throw new Error('could not be read');
        }
        if (!body.panels?.length) throw new Error("doesn't look like an electrical panel");
        found.push(...body.panels);
      } catch (err) {
        errs.push(`${f.name}: ${err.message}`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (found.length) onPanels(found);
  }

  return (
    <div className="panel-upload">
      {!hasPanels && <p className="copy">To start, upload a photo of your electrical panel with the door open.</p>}
      <div
        className={`dropzone dropzone-sm${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          readFiles(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            <span>
              Reading panel {busy.done + 1} of {busy.total}…
            </span>
          </>
        ) : (
          <>
            <span className="dropzone-main">{hasPanels ? 'Add another panel photo' : 'Upload panel photos'}</span>
            <span className="dropzone-sub">JPG, PNG or PDF · add as many as you need (main panel, subpanels, close-ups)</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        hidden
        onChange={(e) => {
          readFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {errors.map((m) => (
        <p key={m} className="error">
          {m}
        </p>
      ))}
      {!hasPanels && !busy && (
        <button type="button" className="link-btn" onClick={onSkip}>
          Skip — I don't have a photo
        </button>
      )}
    </div>
  );
}
