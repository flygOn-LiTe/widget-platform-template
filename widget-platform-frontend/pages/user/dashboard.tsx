import useSWR from "swr";
import Image from "next/image";
import ConfigForm from "../../components/ConfigForm";
import { useEffect, useRef } from "react";
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

  const handleUpdateConfig = (config: any, token: any) => {
    // Save the config to local storage
    localStorage.setItem("config", JSON.stringify(config));

    // Update the widget URL with the new configuration
    const widgetUrl = `https://${backendUrl}/widget?name=widget&goal=${
      config.goal
    }&color=${encodeURIComponent(config.color)}&userId=${userData.id}`;
    const iframe = document.getElementById("widget-iframe");
    if (iframe) {
      (iframe as HTMLIFrameElement).src = widgetUrl;
    }
  };

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
      // Call the webhook subscription when the dashboard is loaded
      subscribeToWebhook();

      // Retrieve the config from local storage
      const savedConfig = localStorage.getItem("config");

      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        // Update the widget URL with the saved configuration
        const widgetUrl = `https://${backendUrl}/widget?name=widget&goal=${
          config.goal
        }&color=${encodeURIComponent(config.color)}&userId=${userData.id}`;
        const iframe = document.getElementById("widget-iframe");
        if (iframe) {
          (iframe as HTMLIFrameElement).src = widgetUrl;
        }
      }
    }
  }, [userData]); // Add userData as a dependency

  const copyWidgetUrlToClipboard = async () => {
    if (iframeRef.current) {
      try {
        await navigator.clipboard.writeText(iframeRef.current.src);
        toast.success("Copied widget URL to clipboard!");
      } catch (err) {
        console.error("Failed to copy URL: ", err);
      }
    }
  };

  return (
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
      <div className="flex justify-center">
        <div className="text-center border-2">
          <h1>Follower Goal Bar</h1>
          <ConfigForm onUpdate={handleUpdateConfig} />
          {data && (
            <iframe
              ref={iframeRef}
              id="widget-iframe"
              src={`https://${backendUrl}/widget?userId=${userData.id}`}
              width="530"
              height="160"
            />
          )}
          <button onClick={copyWidgetUrlToClipboard}>Copy Widget URL</button>
        </div>
      </div>
      <div className="text-center border-2">
          <h1>Sub Goal Bar</h1>
          {data && (
            <iframe
              ref={iframeRef}
              id="widget-iframe"
              src={`https://${backendUrl}/sub-goal?userId=${userData.id}`}
              width="530"
              height="160"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
