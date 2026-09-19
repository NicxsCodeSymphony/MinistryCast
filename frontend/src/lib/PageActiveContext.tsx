import { createContext, useContext, type ReactNode } from "react";

const PageActiveContext = createContext(true);

export function PageActiveProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <PageActiveContext.Provider value={active}>
      {children}
    </PageActiveContext.Provider>
  );
}

/** True when this KeepAlive page is the visible route. */
export function usePageActive() {
  return useContext(PageActiveContext);
}
