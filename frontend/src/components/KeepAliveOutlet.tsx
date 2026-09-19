import { useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { IsolatedSearch } from "../lib/SearchContext";
import { PageActiveProvider } from "../lib/PageActiveContext";

/**
 * Keep route pages mounted (preserving local state) while switching tabs.
 * Cache each path's element once — never replace with a fresh outlet on revisit,
 * or React remounts the page and refetches.
 */
export default function KeepAliveOutlet() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const cache = useRef(new Map<string, ReturnType<typeof useOutlet>>());

  if (outlet && !cache.current.has(pathname)) {
    cache.current.set(pathname, outlet);
  }

  return (
    <>
      {[...cache.current.entries()].map(([path, node]) => {
        const active = path === pathname;
        return (
          <IsolatedSearch key={path} active={active}>
            <PageActiveProvider active={active}>
              <div
                className={`h-full min-h-0 overflow-hidden ${active ? "page-enter" : ""}`}
                style={{ display: active ? "block" : "none" }}
                aria-hidden={!active}
              >
                {node}
              </div>
            </PageActiveProvider>
          </IsolatedSearch>
        );
      })}
    </>
  );
}
