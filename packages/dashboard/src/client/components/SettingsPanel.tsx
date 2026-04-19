import { useCallback, useEffect, useState } from 'react';

interface DirData {
  watched: string[];
  discovered: string[];
  suggested: string[];
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [dirs, setDirs] = useState<DirData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');

  const fetchDirs = useCallback(async () => {
    try {
      const res = await fetch('/api/directories');
      if (res.ok) {
        setDirs(await res.json());
        setError(null);
      } else setError(`Failed: ${res.status}`);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    fetchDirs();
  }, [fetchDirs]);

  const modifyDir = useCallback(
    async (action: 'add' | 'remove', dir: string) => {
      setBusy(true);
      setError(null);
      try {
        const body = action === 'add' ? { add: dir } : { remove: dir };
        const res = await fetch('/api/directories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(`Failed: ${(data as { error?: string }).error ?? res.status}`);
        } else {
          await fetchDirs();
        }
      } catch (e) {
        setError(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      setBusy(false);
    },
    [fetchDirs],
  );

  const handleManualAdd = useCallback(() => {
    const trimmed = manualPath.trim();
    if (!trimmed) return;
    modifyDir('add', trimmed);
    setManualPath('');
  }, [manualPath, modifyDir]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: interactive element with role+keyboard handlers
    <div
      className="settings-overlay"
      role="button"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClose();
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: interactive element with role+keyboard handlers */}
      <div
        className="settings-panel"
        role="button"
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="settings-panel__header">
          <div className="settings-panel__eyebrow">AGENTFLOW · SETTINGS</div>
          <div className="settings-panel__title-row">
            <h2 className="settings-panel__title">Watched directories</h2>
            <button type="button" className="btn btn--secondary" onClick={onClose} title="Close">
              {'\u00D7'}
            </button>
          </div>
          <p className="settings-panel__subtitle">
            Configure directories scanned for trace files. Discovered paths auto-populate.
          </p>
        </header>

        {error && (
          <div className="settings-panel__error">
            <span className="dot dot--fail" />
            <span>{error}</span>
          </div>
        )}

        {!dirs ? (
          <div className="loading-state">Loading directories{'\u2026'}</div>
        ) : (
          <div className="settings-panel__body">
            <section className="settings-section">
              <header className="settings-section__header">
                <h3 className="settings-section__title">WATCHING</h3>
                <span className="settings-section__count">{dirs.watched.length}</span>
              </header>
              <div className="settings-section__rows">
                {dirs.watched.map((d) => (
                  <div key={d} className="settings-row">
                    <span className="dot dot--ok" />
                    <code className="settings-row__path">{d}</code>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={busy}
                      onClick={() => modifyDir('remove', d)}
                      title="Remove directory"
                    >
                      {'\u00D7'}
                    </button>
                  </div>
                ))}
                {dirs.watched.length === 0 && (
                  <div className="empty-state">
                    <p>No directories watched yet.</p>
                  </div>
                )}
              </div>
            </section>

            {dirs.suggested.length > 0 && (
              <section className="settings-section">
                <header className="settings-section__header">
                  <h3 className="settings-section__title">SUGGESTED</h3>
                  <span className="settings-section__count">{dirs.suggested.length}</span>
                </header>
                <div className="settings-section__rows">
                  {dirs.suggested.map((d) => (
                    <div key={d} className="settings-row">
                      <span className="dot dot--warn" />
                      <code className="settings-row__path">{d}</code>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        disabled={busy}
                        onClick={() => modifyDir('add', d)}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="settings-section">
              <header className="settings-section__header">
                <h3 className="settings-section__title">ADD DIRECTORY</h3>
              </header>
              <div className="settings-form">
                <div className="settings-form__row">
                  <label className="settings-form__label" htmlFor="manual-path">
                    Path
                  </label>
                  <div className="settings-form__control">
                    <input
                      id="manual-path"
                      className="settings-form__input"
                      type="text"
                      placeholder="/path/to/traces"
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                    />
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy || !manualPath.trim()}
                      onClick={handleManualAdd}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <footer className="settings-panel__footer">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={fetchDirs}
              >
                {busy ? 'Scanning\u2026' : `\u21BB Rescan directories`}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
