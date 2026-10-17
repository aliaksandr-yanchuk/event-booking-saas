import { randomInt } from "node:crypto";

// No 0/O, 1/I/L: references are read out over the phone and typed by hand.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 8;

/**
 * Booking references double as the "password" for the confirmation page,
 * so they come from a CSPRNG: 31^8 ≈ 8.5 × 10^11 combinations.
 */
export function generateBookingReference(random: (max: number) => number = randomInt): string {
  let reference = "";
  for (let i = 0; i < LENGTH; i++) {
    reference += ALPHABET[random(ALPHABET.length)];
  }
  return `${reference.slice(0, 4)}-${reference.slice(4)}`;
}

export function isBookingReference(value: string): boolean {
  return new RegExp(`^[${ALPHABET}]{4}-[${ALPHABET}]{4}$`).test(value);
}
