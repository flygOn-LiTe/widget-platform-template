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

  const handleTestFollowerEvent = async () => {
    try {
      // Get the current follower count from localStorage or set it to 150 if not found
      const currentFollowerCount = parseInt(
        localStorage.getItem("followerCount") || "150",
        10
      );
      const newFollowerCount = currentFollowerCount + 1;

      // Update localStorage with the new follower count
      localStorage.setItem("followerCount", `${newFollowerCount}`);

      await fetch(`https://${backendUrl}/test/follower-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userData.id,
          followerCount: newFollowerCount,
        }),
      });
      toast.success("Follower event triggered successfully!");
    } catch (error) {
      console.error("Failed to trigger follower event:", error);
    }
  };

  const handleTestSubscriberEvent = async () => {
    try {
      // Get the current subscriber count from localStorage or set it to 20 if not found
      const currentSubscriberCount = parseInt(
        localStorage.getItem("subscriberCount") || "20",
        10
      );
      const newSubscriberCount = currentSubscriberCount + 1;

      // Update localStorage with the new subscriber count
      localStorage.setItem("subscriberCount", `${newSubscriberCount}`);
      await fetch(`https://${backendUrl}/test/subscriber-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userData.id,
          subscriberCount: newSubscriberCount,
          subscriberName: "TestSubscriber",
        }),
      });
      toast.success("Subscriber event triggered successfully!");
    } catch (error) {
      console.error("Failed to trigger subscriber event:", error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      {userData && (
        <div className="flex flex-col sm:flex-row justify-center items-center mb-6">
          <div className="avatar p-4">
            <div className="w-20 sm:w-24 rounded-full shadow-lg">
              <Image
                src={userData.profile_image_url}
                alt={`${userData.display_name}'s profile`}
                width={96}
                height={96}
              />
            </div>
          </div>
          <div className="text-center sm:text-left sm:ml-4">
            <p className="text-lg font-semibold">
              Welcome, {userData.display_name}!
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col lg:flex-row lg:justify-between gap-8">
        <div className="flex flex-col items-center w-full lg:w-1/2">
          <div className="text-center border-2 p-4 rounded-md shadow-md w-full">
            <h1 className="text-3xl font-bold mb-4">Follower Goal Bar</h1>
            <ConfigForm
              onUpdate={handleUpdateFollowerConfig}
              widgetType="follower"
            />
            {data && (
              <>
                <div className="flex flex-col items-center">
                  <iframe
                    ref={iframeRef}
                    id="follower-iframe"
                    src={`https://${backendUrl}/widget?name=follower&userId=${userData.id}`}
                    width="100%"
                    height="200"
                    className="mb-4 border rounded-md"
                  />
                  <button
                    onClick={handleTestFollowerEvent}
                    className="btn bg-blue-500 text-white w-48 mb-4"
                  >
                    Test Follower Event
                  </button>

                  <button
                    onClick={() => copyWidgetUrlToClipboard("follower")}
                    className="btn bg-black text-white w-48"
                  >
                    Copy Browser Source
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center w-full lg:w-1/2">
          <div className="text-center border-2 p-4 rounded-md shadow-md w-full">
            <h1 className="text-3xl font-bold mb-4">Subscriber Goal Bar</h1>
            <ConfigForm
              onUpdate={handleUpdateSubscriberConfig}
              widgetType="subscriber"
            />
            {data && (
              <>
                <div className="flex flex-col items-center">
                  <iframe
                    ref={iframeRef}
                    id="subscriber-iframe"
                    src={`https://${backendUrl}/widget?name=subscriber&userId=${userData.id}`}
                    width="100%"
                    height="200"
                    className="mb-4 border rounded-md"
                  />
                  <button
                    onClick={handleTestSubscriberEvent}
                    className="btn bg-blue-500 text-white w-48 mb-4"
                  >
                    Test Subscriber Event
                  </button>

                  <button
                    onClick={() => copyWidgetUrlToClipboard("subscriber")}
                    className="btn bg-black text-white w-48"
                  >
                    Copy Browser Source
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
