import { useRef, useState } from 'react';

export default function Upload({ onFile, busy, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function pick(files) {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  }

  return (
    <section className="upload">
      <h1>Hello. To get started, please upload your electric bill.</h1>

      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
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
          pick(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            <span>Reading your bill…</span>
          </>
        ) : (
          <>
            <span className="dropzone-main">Upload bill</span>
            <span className="dropzone-sub">PDF or photo</span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />

      {error && <p className="error">{error}</p>}
    </section>
  );
}
