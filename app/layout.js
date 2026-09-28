import "./globals.css";

export const metadata = {
  title: "Ninja Time — Synchronisation",
  description: "Tableau de suivi de la synchronisation Ninja Time vers le tableau français.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
