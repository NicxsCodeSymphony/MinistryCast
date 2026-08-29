export type RosterRole = {
  role: string;
  name: string;
};

export type RosterPayload = {
  heading: string;
  date: string;
  roles: RosterRole[];
};

export const DEFAULT_ROSTER_ROLES: RosterRole[] = [
  { role: "Scripture Reading", name: "" },
  { role: "Opening Prayer", name: "" },
  { role: "Closing Prayer", name: "" },
  { role: "Worship Leader", name: "" },
];

export function defaultRosterDate(serviceAt?: string | null) {
  if (serviceAt) {
    const day = serviceAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  }
  const d = new Date();
  const add = d.getDay() === 0 ? 7 : 7 - d.getDay();
  d.setDate(d.getDate() + add);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatRosterDate(isoDay: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!match) return isoDay;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function emptyRoster(serviceAt?: string | null): RosterPayload {
  return {
    heading: "Next Week",
    date: defaultRosterDate(serviceAt),
    roles: DEFAULT_ROSTER_ROLES.map((row) => ({ ...row })),
  };
}

export function normalizeRoster(
  raw: unknown,
  serviceAt?: string | null,
): RosterPayload {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const heading =
    typeof obj.heading === "string" && obj.heading.trim()
      ? obj.heading.trim()
      : "Next Week";
  const date =
    typeof obj.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)
      ? obj.date
      : defaultRosterDate(serviceAt);
  const roles = Array.isArray(obj.roles)
    ? obj.roles
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const role = typeof item.role === "string" ? item.role.trim() : "";
          if (!role) return null;
          const name = typeof item.name === "string" ? item.name.trim() : "";
          return { role, name };
        })
        .filter((row): row is RosterRole => Boolean(row))
    : [];
  return {
    heading,
    date,
    roles: roles.length
      ? roles
      : DEFAULT_ROSTER_ROLES.map((row) => ({ ...row })),
  };
}
