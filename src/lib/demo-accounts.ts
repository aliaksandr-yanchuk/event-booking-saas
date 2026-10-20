/**
 * Organizer accounts created by the demo seed, listed on the login page. The password
 * is public on purpose: this is a demo, and the weekly reset recreates everything.
 */
export const DEMO_PASSWORD = "seatline-demo";

export const DEMO_ACCOUNTS = [
  { email: "owner@harbor-hall.example", name: "Hana Mori", organizationSlug: "harbor-hall", role: "OWNER" },
  { email: "door@harbor-hall.example", name: "Taro Ito", organizationSlug: "harbor-hall", role: "STAFF" },
  { email: "owner@kyoto-chamber.example", name: "Emi Sato", organizationSlug: "kyoto-chamber", role: "OWNER" },
] as const;
