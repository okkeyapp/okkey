type CapsulesListRefreshListener = () => void;

const listeners = new Set<CapsulesListRefreshListener>();

export function subscribeCapsulesListRefresh(listener: CapsulesListRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCapsulesListRefresh(): void {
  for (const listener of listeners) {
    listener();
  }
}
