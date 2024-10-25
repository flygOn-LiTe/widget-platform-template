import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Kanit } from "@next/font/google";
import { Toaster } from "react-hot-toast";
const kanit = Kanit({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-kanit",
});
export default function App({ Component, pageProps }: AppProps) {
  return (
    <main
      className={`${kanit.variable} font-sans bg-gradient-to-b from-[rgba(151,0,173,1)] to-[rgba(46,5,64,1)]`}
    >
      <Toaster />
      <Component {...pageProps} />
    </main>
  );
}
