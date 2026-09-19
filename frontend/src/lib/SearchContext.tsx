import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SearchContextValue = {
  query: string;
  setQuery: (query: string) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch() {
  const value = useContext(SearchContext);
  if (!value) {
    throw new Error("useSearch must be used within SearchProvider");
  }
  return value;
}

/** Keep a hidden page from reacting to the header search of the visible page. */
export function IsolatedSearch({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const parent = useSearch();
  const frozen = useRef(parent.query);
  if (active) frozen.current = parent.query;
  const value = useMemo(
    () => ({
      query: active ? parent.query : frozen.current,
      setQuery: parent.setQuery,
    }),
    [active, parent.query, parent.setQuery],
  );
  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}
