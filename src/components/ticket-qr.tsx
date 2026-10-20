import QRCode from "qrcode";

/**
 * QR code for the door: it links to the organizer's check-in page for this booking, so
 * staff scan it with any phone camera, without an app. Rendered on the server as SVG
 * (no client JavaScript, no image request).
 */
export async function TicketQr({ url, label }: { url: string; label: string }) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div
      role="img"
      aria-label={label}
      className="size-44 rounded-lg bg-white p-2 [&_svg]:size-full"
      // The SVG comes from the QR library, built from our own URL; it contains no user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
