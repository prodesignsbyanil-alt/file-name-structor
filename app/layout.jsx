import "./globals.css";

export const metadata = {
  title: "File Name Structor Pro",
  description: "AI-powered smart filename generator for creative assets.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}