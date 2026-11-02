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
