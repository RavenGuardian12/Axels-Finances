import { CloudSyncConfig } from '../../types';

interface CloudSyncSectionProps {
  cloudConfig: CloudSyncConfig;
  lastCloudLoadAt: string | null;
  hideAnonKey: boolean;
  cloudSyncBusy: boolean;
  cloudSyncStatus: string;
  onToggleHideAnonKey: () => void;
  onUpdateCloudConfig: (updater: (prev: CloudSyncConfig) => CloudSyncConfig) => void;
  onPasteAnonKey: () => void;
  onManualAnonKey: () => void;
  onAnonKeyPaste: (value: string) => void;
  onSaveToCloud: () => void;
  onLoadFromCloud: () => void;
}

export default function CloudSyncSection({
  cloudConfig,
  lastCloudLoadAt,
  hideAnonKey,
  cloudSyncBusy,
  cloudSyncStatus,
  onToggleHideAnonKey,
  onUpdateCloudConfig,
  onPasteAnonKey,
  onManualAnonKey,
  onAnonKeyPaste,
  onSaveToCloud,
  onLoadFromCloud,
}: CloudSyncSectionProps) {
  return (
    <section className="panel span-two">
      <div className="row-between">
        <h2>Cloud Sync (Optional)</h2>
        <span className="muted">Supabase REST</span>
      </div>
      <p className="muted">
        Use this to access the same data on any computer. Local storage remains your default backup.
      </p>
      <label>
        Supabase URL
        <input
          placeholder="https://YOUR_PROJECT.supabase.co"
          value={cloudConfig.url}
          onChange={(event) =>
            onUpdateCloudConfig((prev) => ({
              ...prev,
              url: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Supabase Anon Key
        <div className="row">
          <input
            type={hideAnonKey ? 'password' : 'text'}
            placeholder="eyJ..."
            value={cloudConfig.anonKey}
            autoComplete="off"
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text');
              if (!pasted) {
                return;
              }
              event.preventDefault();
              onAnonKeyPaste(pasted);
            }}
            onChange={(event) =>
              onUpdateCloudConfig((prev) => ({
                ...prev,
                anonKey: event.target.value,
              }))
            }
          />
          <button type="button" className="secondary" onClick={onToggleHideAnonKey}>
            {hideAnonKey ? 'Show' : 'Hide'}
          </button>
          <button type="button" className="secondary" onClick={onPasteAnonKey}>
            Paste
          </button>
          <button type="button" className="secondary" onClick={onManualAnonKey}>
            Manual
          </button>
        </div>
      </label>
      <label>
        Sync Key
        <input
          placeholder="Choose a private key (example: axel-main)"
          value={cloudConfig.syncKey}
          onChange={(event) =>
            onUpdateCloudConfig((prev) => ({
              ...prev,
              syncKey: event.target.value,
            }))
          }
        />
      </label>
      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={cloudConfig.autoSaveEnabled}
          onChange={(event) =>
            onUpdateCloudConfig((prev) => ({
              ...prev,
              autoSaveEnabled: event.target.checked,
            }))
          }
        />
        Auto-save to cloud after changes
      </label>
      <div className="row">
        <button type="button" className="secondary" onClick={onSaveToCloud} disabled={cloudSyncBusy}>
          Save to Cloud
        </button>
        <button type="button" className="secondary" onClick={onLoadFromCloud} disabled={cloudSyncBusy}>
          Load from Cloud
        </button>
      </div>
      {cloudSyncStatus && <p className="muted">{cloudSyncStatus}</p>}
      <p className="muted">
        Last cloud load: {lastCloudLoadAt ? new Date(lastCloudLoadAt).toLocaleString() : 'Not loaded yet'}
      </p>
      {cloudConfig.autoSaveEnabled && (
        <p className="muted">Autosave is on. Changes sync automatically after a short delay.</p>
      )}
      <p className="muted">Auto-load on startup is enabled when Auto-save is on.</p>
      <p className="muted">
        Table expected in Supabase:{' '}
        <code>app_states(sync_key text primary key, payload jsonb, updated_at timestamptz default now())</code>.
      </p>
    </section>
  );
}
