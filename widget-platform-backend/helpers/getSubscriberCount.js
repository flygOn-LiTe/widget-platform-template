const fetch = require("node-fetch");

async function getSubscriberCount(channelId, accessToken) {
  const headers = {
    "Client-ID": process.env.TWITCH_CLIENT_ID,
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  const response = await fetch(
    `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${channelId}`,
    {
      method: "GET",
      headers,
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Twitch API error response:", errorData);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.total;
}

module.exports = {
  getSubscriberCount,
};
