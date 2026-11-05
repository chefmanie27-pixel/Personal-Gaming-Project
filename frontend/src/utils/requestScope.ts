// Discard responses superseded by a newer filter/page request.
export function createRequestScope() {
  let revision = 0;
  return {
    next() {
      const current = ++revision;
      return () => revision === current;
    },
    invalidate() {
      revision++;
    },
  };
}

// Guard reads, writes and follow-up navigation against superseded work or a changed resource/session.
export function createOperationScope(context: () => readonly unknown[]) {
  const scope = createRequestScope();
  let disposed = false;
  return {
    next() {
      const current = scope.next(),
        snapshot = [...context()];
      return () => {
        if (disposed || !current()) return false;
        const now = context();
        return (
          now.length === snapshot.length &&
          snapshot.every((value, index) => Object.is(value, now[index]))
        );
      };
    },
    invalidate() {
      scope.invalidate();
    },
    dispose() {
      disposed = true;
      scope.invalidate();
    },
  };
}
