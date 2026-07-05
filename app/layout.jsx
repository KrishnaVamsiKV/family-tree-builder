export const metadata = {
  title: "Family Tree Builder",
  description: "Build and share your family tree.",
};

// Fit the device width and disable the browser's own pinch-zoom so the tree
// canvas can handle pinch gestures itself.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
