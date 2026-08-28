export type ServiceItem = {
  id: string;
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

export type ServiceItemKind = "song" | "sermon" | "scripture" | "media";

export function newServiceItem(
  item: Omit<ServiceItem, "id">,
): ServiceItem {
  return {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
