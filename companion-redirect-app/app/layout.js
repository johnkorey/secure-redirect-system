export const metadata = {
  title: 'Redirect Service',
  description: 'Companion redirect service for Secure Redirect System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}

