import type { RosterPayload } from "../../lib/roster";

export type ServiceItemKind = "song" | "sermon" | "scripture" | "media" | "roster";

export type ServiceItem = {
  id: string;
  itemType: ServiceItemKind;
  songId?: string | null;
  sermonId?: string | null;
  passageId?: string | null;
  mediaAssetId?: string | null;
  payload?: RosterPayload | null;
  title: string;
  subtitle: string;
  duration: string;
  label: string;
  icon: string;
  accent: "tertiary" | "primary" | "secondary";
  border?: "primary" | "tertiary";
  keyBadge?: string;
  durationTone?: "primary" | "tertiary";
};

export function newServiceItem(
  item: Omit<ServiceItem, "id">,
): ServiceItem {
  return {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
