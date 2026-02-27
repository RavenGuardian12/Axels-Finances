import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  getCloudStateMeta,
  pullCloudStateFromCloud,
  pushAppDataToCloudWithMeta,
  validateCloudSyncConfig,
} from './lib/cloudSync';
import ForecastPage from './pages/ForecastPage';
import SetupPage from './pages/SetupPage';
import { loadAppData, loadCloudSyncConfig, sanitizeAppData, saveAppData } from './lib/storage';
import { AppData } from './types';

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData());
  const [lastLoadedCloudUpdatedAt, setLastLoadedCloudUpdatedAt] = useState<string | null>(null);
  const [isInitialCloudLoadDone, setIsInitialCloudLoadDone] = useState(false);
  const skipNextAutoSaveRef = useRef(false);

  useEffect(() => {
    saveAppData(data);
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    const config = loadCloudSyncConfig();

    if (!config.autoSaveEnabled || validateCloudSyncConfig(config)) {
      setIsInitialCloudLoadDone(true);
      return;
    }

    const loadInitialCloudState = async () => {
      try {
        const cloudState = await pullCloudStateFromCloud(config);
        if (cancelled) {
          return;
        }

        if (cloudState.data) {
          skipNextAutoSaveRef.current = true;
          setData(sanitizeAppData(cloudState.data));
        }

        setLastLoadedCloudUpdatedAt(cloudState.updatedAt);
      } catch {
        // startup cloud sync should not block app usage
      } finally {
        if (!cancelled) {
          setIsInitialCloudLoadDone(true);
        }
      }
    };

    void loadInitialCloudState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isInitialCloudLoadDone) {
      return;
    }

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const config = loadCloudSyncConfig();
    if (!config.autoSaveEnabled) {
      return;
    }
    if (validateCloudSyncConfig(config)) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const remoteMeta = await getCloudStateMeta(config);
          // Safety: if this browser has never loaded cloud state and we can't confirm
          // remote metadata, skip autosave to avoid accidental first-write overwrites.
          if (!lastLoadedCloudUpdatedAt && !remoteMeta.updatedAt) {
            return;
          }
          if (
            remoteMeta.updatedAt &&
            (!lastLoadedCloudUpdatedAt ||
              Date.parse(remoteMeta.updatedAt) > Date.parse(lastLoadedCloudUpdatedAt))
          ) {
            const confirmed = window.confirm(
              'Cloud data was updated from another browser. Overwrite cloud with your current local data?',
            );
            if (!confirmed) {
              return;
            }
          }

          const saveResult = await pushAppDataToCloudWithMeta(config, data);
          setLastLoadedCloudUpdatedAt(saveResult.updatedAt ?? new Date().toISOString());
        } catch {
          // keep autosave non-blocking and silent; manual sync surface shows explicit errors
        }
      })();
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [data, isInitialCloudLoadDone, lastLoadedCloudUpdatedAt]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <SetupPage
            data={data}
            onChange={setData}
            lastCloudLoadAt={lastLoadedCloudUpdatedAt}
            onCloudLoadAtChange={setLastLoadedCloudUpdatedAt}
          />
        }
      />
      <Route path="/forecast" element={<ForecastPage data={data} onChange={setData} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
