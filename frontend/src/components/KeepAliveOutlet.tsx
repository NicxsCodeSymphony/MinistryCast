import { useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { IsolatedSearch } from "../lib/SearchContext";

export default function KeepAliveOutlet() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const cache = useRef(new Map<string, ReturnType<typeof useOutlet>>());
  if (outlet) cache.current.set(pathname, outlet);

  return (
    <>
      {[...cache.current.entries()].map(([path, node]) => {
        const active = path === pathname;
        return (
          <IsolatedSearch key={path} active={active}>
            <div
              className={`h-full min-h-0 overflow-hidden ${active ? "page-enter" : ""}`}
              style={{ display: active ? "block" : "none" }}
              aria-hidden={!active}
            >
              {node}
            </div>
          </IsolatedSearch>
        );
      })}
    </>
  );
}
