export type SavedWorkSession = {
  id: string;
  state: string;
  accumulated_seconds: number;
  hourly_rate: number;
};

/** Finished sessions are the durable ledger; never reprice them using a current job rate. */
export function savedWorkTotals(sessions: SavedWorkSession[]) {
  const unique = new Map(sessions.filter(session => session.state === "finished").map(session => [session.id, session]));
  return [...unique.values()].reduce((total, session) => {
    const seconds = Number(session.accumulated_seconds);
    const rate = Number(session.hourly_rate);
    return {
      seconds: total.seconds + seconds,
      labour: total.labour + seconds / 3600 * rate,
      unpricedSeconds: total.unpricedSeconds + (rate === 0 ? seconds : 0),
    };
  }, { seconds: 0, labour: 0, unpricedSeconds: 0 });
}