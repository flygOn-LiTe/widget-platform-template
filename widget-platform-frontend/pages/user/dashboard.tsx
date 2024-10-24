import useSWR from "swr";
import Image from "next/image";
import ConfigForm from "../../components/ConfigForm";
import { useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
const fetcher = async (url: any) => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = new Error("An error occurred while fetching the data.");
    throw error;
  }

  return response.json();
};

const Dashboard = () => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { data, error } = useSWR(`https://${backendUrl}/api/user`, fetcher);

  if (error) {
    console.error(`Error: ${error}`);
  }

  const userData = data?.data[0];

  const handleUpdateFollowerConfig = (config: any) => {
    localStorage.setItem("followerConfig", JSON.stringify(config));
    updateWidgetUrl("follower", config);
  };

  const handleUpdateSubscriberConfig = (config: any) => {
    localStorage.setItem("subscriberConfig", JSON.stringify(config));
    updateWidgetUrl("subscriber", config);
  };

  const updateWidgetUrl = useCallback(
    (widgetType: string, config: any) => {
      const widgetUrl = `https://${backendUrl}/widget?name=${widgetType}&goal=${
        config.goal
      }&color=${encodeURIComponent(config.color)}&userId=${userData.id}`;
      const iframe = document.getElementById(`${widgetType}-iframe`);
      if (iframe) {
        (iframe as HTMLIFrameElement).src = widgetUrl;
      }
    },
    [userData]
  );

  async function subscribeToWebhook() {
    try {
      const response = await fetch(
        `https://${backendUrl}/subscribe-all-events`,
        {
          credentials: "include",
        }
      );

      if (response.ok) {
        console.log("Webhook subscription successful");
      } else {
        console.error("Failed to subscribe to webhook");
      }
    } catch (error) {
      console.error("Failed to subscribe to webhook:", error);
    }
  }

  useEffect(() => {
    if (userData) {
      subscribeToWebhook();

      const savedFollowerConfig = localStorage.getItem("followerConfig");
      if (savedFollowerConfig) {
        const config = JSON.parse(savedFollowerConfig);
        updateWidgetUrl("follower", config);
      }

      const savedSubscriberConfig = localStorage.getItem("subscriberConfig");
      if (savedSubscriberConfig) {
        const config = JSON.parse(savedSubscriberConfig);
        updateWidgetUrl("subscriber", config);
      }
    }
  }, [updateWidgetUrl, userData]);

  const copyWidgetUrlToClipboard = async (widgetType: string) => {
    const iframe = document.getElementById(
      `${widgetType}-iframe`
    ) as HTMLIFrameElement;
    if (iframe) {
      try {
        await navigator.clipboard.writeText(iframe.src);
        toast.success(`Copied ${widgetType} widget URL to clipboard!`);
      } catch (err) {
        console.error("Failed to copy URL: ", err);
      }
    }
  };

  return (
    <div className="flex justify-center items-center bg-gradient-to-b from-[rgba(151,0,173,1)] to-[rgba(46,5,64,1)]">
      <div>
        {userData && (
          <div className="flex justify-center items-center">
            <div className="avatar p-5">
              <div className="w-14 rounded">
                <Image
                  src={userData.profile_image_url}
                  alt={`${userData.display_name}'s profile`}
                  width={64}
                  height={64}
                />
              </div>
            </div>
            <div>
              <p>Welcome, you are now logged in {userData.display_name}!</p>
            </div>
          </div>
        )}
        <div className="flex justify-center p-5 bg-slate-300">
          <div className="text-center border-2 p-4 rounded-md shadow-md">
            <h1 className="text-xl font-bold mb-4">Follower Goal Bar</h1>
            <ConfigForm
              onUpdate={handleUpdateFollowerConfig}
              widgetType="follower"
            />
            {data && (
              <>
                <iframe
                  ref={iframeRef}
                  id="follower-iframe"
                  src={`https://${backendUrl}/widget?name=follower&userId=${userData.id}`}
                  width="560"
                  height="160"
                  className="mb-4"
                />
                <button
                  onClick={() => copyWidgetUrlToClipboard("follower")}
                  className="btn btn-primary mb-4"
                >
                  Copy Widget URL
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-center p-5 bg-slate-300">
          <div className="text-center border-2 p-4 rounded-md shadow-md">
            <h1 className="text-xl font-bold mb-4">Sub Goal Bar</h1>
            <ConfigForm
              onUpdate={handleUpdateSubscriberConfig}
              widgetType="subscriber"
            />
            {data && (
              <>
                <iframe
                  ref={iframeRef}
                  id="subscriber-iframe"
                  src={`https://${backendUrl}/widget?name=subscriber&userId=${userData.id}`}
                  width="560"
                  height="160"
                  className="mb-4"
                />
                <button
                  onClick={() => copyWidgetUrlToClipboard("subscriber")}
                  className="btn btn-primary mb-4"
                >
                  Copy Widget URL
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
