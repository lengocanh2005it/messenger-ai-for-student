/** Fire-and-forget async work on the next event-loop tick (no request-path latency). */
export function runInBackground(
  task: () => Promise<void>,
  onError: (error: unknown) => void,
): void {
  setImmediate(() => {
    void task().catch(onError);
  });
}
