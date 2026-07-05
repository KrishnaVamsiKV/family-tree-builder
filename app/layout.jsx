export const metadata = {
  title: "Family Tree Builder",
  description: "Build and share your family tree.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
