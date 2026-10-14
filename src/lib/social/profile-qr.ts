import QRCode from "qrcode";
import { qrHex } from "./profile-export";

export function createProfileQr(url: string, foreground: string, background: string, size: number) {
  return QRCode.toString(url, {
    type: "svg", width: size, margin: 4, errorCorrectionLevel: "M",
    color: { dark: `#${qrHex(foreground, "000000")}`, light: `#${qrHex(background, "ffffff")}` },
  });
}