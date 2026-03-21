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

  // Derive which dirs are from config (removable) vs CLI (not removable)
  const _cliDirs = new Set<string>();
  // CLI dirs are the first entries (tracesDir + original dataDirs), but we can't know exactly from the API
  // So we consider "suggested" as definitely addable, and anything in watched that's also in discovered is removable

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sp-head">
          <h3>Watched Directories</h3>
          <button className="sp-close" onClick={onClose}>
            {'\u00D7'}
          </button>
        </div>

        {error && <div className="sp-error">{error}</div>}

        {!dirs ? (
          <div className="workspace__empty">Loading...</div>
        ) : (
          <div className="sp-body">
            {/* Watching */}
            <h4 className="sp-section">Watching ({dirs.watched.length})</h4>
            {dirs.watched.map((d) => (
              <div key={d} className="sp-dir">
                <span className="dot dot--ok" />
                <span className="sp-dir__path">{d}</span>
                <button
                  className="sp-btn sp-btn--rm"
                  disabled={busy}
                  onClick={() => modifyDir('remove', d)}
                  title="Remove"
                >
                  {'\u00D7'}
                </button>
              </div>
            ))}

            {/* Suggested */}
            {dirs.suggested.length > 0 && (
              <>
                <h4 className="sp-section">Suggested ({dirs.suggested.length})</h4>
                {dirs.suggested.map((d) => (
                  <div key={d} className="sp-dir sp-dir--sug">
                    <span className="dot dot--warn" />
                    <span className="sp-dir__path">{d}</span>
                    <button
                      className="sp-btn sp-btn--add"
                      disabled={busy}
                      onClick={() => modifyDir('add', d)}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Manual add */}
            <h4 className="sp-section">Add Directory</h4>
            <div className="sp-manual">
              <input
                className="sp-input"
                type="text"
                placeholder="/path/to/traces"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
              />
              <button
                className="sp-btn sp-btn--add"
                disabled={busy || !manualPath.trim()}
                onClick={handleManualAdd}
              >
                Add
              </button>
            </div>

            {/* Rescan */}
            <div style={{ marginTop: 'var(--s4)' }}>
              <button className="sp-btn sp-btn--rescan" disabled={busy} onClick={fetchDirs}>
                {busy ? 'Scanning...' : '\u21BB Rescan Directories'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
