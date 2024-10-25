import { Inter } from "next/font/google";
import Image from "next/image";
const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const backendUrl = `https://${process.env.NEXT_PUBLIC_BACKEND_URL}`;
  return (
    <div className="h-screen flex justify-center items-center bg-gradient-to-b from-[rgba(151,0,173,1)] to-[rgba(46,5,64,1)]">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl lg:text-7xl font-extrabold text-white pb-5">
          YOUR TITLE HERE
        </h1>
        <div className="flex justify-center items-center">
          <Image
            src="/twitch-fruit-logo.png"
            alt="Fruit"
            width={450}
            height={450}
          />
        </div>
        <h2 className="text-lg lg:text-5xl font-bold text-white pb-5 pt-5">
          A Twitch Widget Platform
        </h2>
        <a href={`${backendUrl}/auth/twitch`}>
          <button className="btn">Login with Twitch</button>
        </a>
      </div>
    </div>
  );
}
