// Interface text for the share panel and the QR code. Catalog slot: `share`.

export const en = {
  qrLabel: (link: string) => `QR code that opens ${link}`,
  code: "Arena code",
  link: "Link",
  share: "Share",
  scan: "Scan the QR code with a phone camera, or open the link below.",
  /** The text the phone's share sheet sends with the link. */
  shareText: (code: string) => `Join my AlgoTank arena with the code ${code}.`,
};

export const id: typeof en = {
  qrLabel: (link) => `Kode QR yang membuka ${link}`,
  code: "Kode arena",
  link: "Tautan",
  share: "Bagikan",
  scan: "Pindai kode QR dengan kamera ponsel, atau buka tautan di bawah ini.",
  shareText: (code) => `Ayo gabung ke arena AlgoTank-ku pakai kode ${code}.`,
};
