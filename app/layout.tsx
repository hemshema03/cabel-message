import { Suspense } from "react";
import "./globals.css";
import Providers from "./providers";
export const metadata = {
  title: "Cable Â· WhatsApp Manager",
  description: "Customer billing and service communications",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-sv-page font-sans text-[14px] leading-normal text-sv-text [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-sv-primary [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-60 [&_summary]:cursor-pointer">
        <Providers>
          <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
