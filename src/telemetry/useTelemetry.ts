import { useEffect, useMemo, useRef, useState } from "react";
import { deriveAlarms, ScadaTelemetryAdapter, SimulationTelemetryAdapter } from "./simulation";
import type { AlarmEvent, TelemetryAdapter, TelemetrySample } from "../domain/types";

export type TelemetryMode = "live" | "paused" | "replay";

export function useTelemetry(selectedAssetId: string) {
  const [samples, setSamples] = useState<Record<string, TelemetrySample>>({});
  const [history, setHistory] = useState<Record<string, TelemetrySample[]>>({});
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [mode, setMode] = useState<TelemetryMode>("live");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const adapter = useMemo<TelemetryAdapter>(() => {
    const telemetryMode = import.meta.env.VITE_TELEMETRY_MODE ?? "simulation";
    return telemetryMode === "scada" ? new ScadaTelemetryAdapter() : new SimulationTelemetryAdapter();
  }, []);

  useEffect(() => {
    const unsubscribe = adapter.subscribe((batch) => {
      if (modeRef.current === "paused") return;
      commitSamples(batch);
    });

    adapter.connect().catch((error) => {
      console.error("Telemetry adapter failed to connect", error);
    });

    return () => {
      unsubscribe();
      void adapter.disconnect();
    };
  }, [adapter]);

  function commitSamples(batch: TelemetrySample[]) {
    setSamples((current) => {
      const next = { ...current };
      batch.forEach((sample) => { next[sample.assetId] = sample; });
      return next;
    });

    setHistory((current) => {
      const next = { ...current };
      batch.forEach((sample) => {
        const previous = next[sample.assetId] ?? [];
        next[sample.assetId] = [...previous.slice(-47), sample];
      });
      return next;
    });

    setAlarms(deriveAlarms(batch));
  }

  async function replayLastHour() {
    setMode("replay");
    const end = Date.now();
    const frames = await adapter.replayWindow(end - 60 * 60 * 1000, end, 5 * 60 * 1000);
    frames.forEach((frame, index) => {
      window.setTimeout(() => {
        if (modeRef.current === "replay") commitSamples(frame);
      }, index * 220);
    });
    window.setTimeout(() => {
      if (modeRef.current === "replay") setMode("live");
    }, frames.length * 220 + 350);
  }

  return {
    samples,
    selectedSample: samples[selectedAssetId],
    selectedHistory: history[selectedAssetId] ?? [],
    alarms,
    mode,
    setMode,
    replayLastHour
  };
}
