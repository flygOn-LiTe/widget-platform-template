import useSWR from "swr";
import Image from "next/image";
import ConfigForm from "../../components/ConfigForm";
import { useEffect, useRef, useState } from "react";
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
  const followerIframeRef = useRef<HTMLIFrameElement | null>(null);
  const subGoalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const { data, error } = useSWR(`https://${backendUrl}/api/user`, fetcher);

  const [followerConfig, setFollowerConfig] = useState({
    goal: 1000,
    color: "#FF0000",
  });

  const [subGoalConfig, setSubGoalConfig] = useState({
    subGoal: 500,
    subColor: "#00FF00",
  });

  if (error) {
    console.error(`Error: ${error}`);
  }

  const userData = data?.data[0];

  const handleUpdateFollowerConfig = (config: any) => {
    // Update state and localStorage
    setFollowerConfig(config);
    localStorage.setItem("followerConfig", JSON.stringify(config));

    // Update the follower goal widget URL
    if (followerIframeRef.current && userData) {
      const followerWidgetUrl = `https://${backendUrl}/widget?name=widget&goal=${
        config.goal
      }&color=${encodeURIComponent(config.color)}&userId=${userData.id}`;
      followerIframeRef.current.src = followerWidgetUrl;
    }
  };

  const handleUpdateSubGoalConfig = (config: any) => {
    // Update state and localStorage
    setSubGoalConfig(config);
    localStorage.setItem("subGoalConfig", JSON.stringify(config));

    // Update the sub goal widget URL
    if (subGoalIframeRef.current && userData) {
      const subGoalWidgetUrl = `https://${backendUrl}/widget?name=sub-goal&goal=${
        config.subGoal
      }&color=${encodeURIComponent(config.subColor)}&userId=${userData.id}`;
      subGoalIframeRef.current.src = subGoalWidgetUrl;
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
      const savedFollowerConfig = localStorage.getItem("followerConfig");
      const savedSubGoalConfig = localStorage.getItem("subGoalConfig");

      if (savedFollowerConfig) {
        const config = JSON.parse(savedFollowerConfig);
        setFollowerConfig(config);

        // Update the follower goal widget URL
        const followerWidgetUrl = `https://${backendUrl}/widget?name=widget&goal=${
          config.goal
        }&color=${encodeURIComponent(config.color)}&userId=${userData.id}`;

        if (followerIframeRef.current) {
          followerIframeRef.current.src = followerWidgetUrl;
        }
      }

      if (savedSubGoalConfig) {
        const config = JSON.parse(savedSubGoalConfig);
        setSubGoalConfig(config);

        // Update the sub goal widget URL
        const subGoalWidgetUrl = `https://${backendUrl}/widget?name=sub-goal&goal=${
          config.subGoal
        }&color=${encodeURIComponent(config.subColor)}&userId=${userData.id}`;

        if (subGoalIframeRef.current) {
          subGoalIframeRef.current.src = subGoalWidgetUrl;
        }
      }
    }
  }, [userData]);

  const copyWidgetUrlToClipboard = async (
    iframeRef: React.RefObject<HTMLIFrameElement>
  ) => {
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
          <ConfigForm onUpdate={handleUpdateFollowerConfig} />
          {data && (
            <iframe
              ref={followerIframeRef}
              id="follower-widget-iframe"
              src={`https://${backendUrl}/widget?name=widget&goal=${
                followerConfig.goal
              }&color=${encodeURIComponent(followerConfig.color)}&userId=${
                userData?.id
              }`}
              width="530"
              height="160"
            />
          )}
          <button onClick={() => copyWidgetUrlToClipboard(followerIframeRef)}>
            Copy Follower Goal Widget URL
          </button>
        </div>
      </div>

      <div className="flex justify-center mt-5">
        <div className="text-center border-2">
          <h1>Subscriber Goal Bar</h1>
          <ConfigForm onUpdate={handleUpdateSubGoalConfig} />
          {data && (
            <iframe
              ref={subGoalIframeRef}
              id="sub-goal-widget-iframe"
              src={`https://${backendUrl}/widget?name=sub-goal&goal=${
                subGoalConfig.subGoal
              }&color=${encodeURIComponent(subGoalConfig.subColor)}&userId=${
                userData?.id
              }`}
              width="530"
              height="160"
            />
          )}
          <button onClick={() => copyWidgetUrlToClipboard(subGoalIframeRef)}>
            Copy Subscriber Goal Widget URL
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
