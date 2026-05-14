import type { Game } from "../game/Game";
import { TelemetryCollector } from "./TelemetryCollector";

export function attachTelemetry(game: Game): () => void {
  if (game.creativeMode) return () => {};

  const collector = new TelemetryCollector(game);
  return () => collector.detach();
}
