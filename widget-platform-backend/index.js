const express = require("express");
const passport = require("passport");
const TwitchStrategy = require("passport-twitch-new").Strategy;
const cors = require("cors");
var session = require("express-session");
const Redis = require("ioredis");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getFollowerCount } = require("./helpers/getFollowerCount");
const { getSubscriberCount } = require("./helpers/getSubscriberCount");

var RedisStore = require("connect-redis")(session);
var client = new Redis(process.env.REDIS_URL);
client.on("error", (err) => {
  console.error("Redis error:", err);
});
client.on("ready", () => {
  console.log("Redis client is ready");
});

// Load environment variables
dotenv.config();

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin: `https://${process.env.FRONTEND_URL}`,
  optionsSuccessStatus: 200,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use(
  session({
    store: new RedisStore({ client: client }),
    secret: process.env.SESSION_SECRET, // Replace with your session secret
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // Set to true if you're using HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      sameSite: "none",
    },
  })
);
// Store tokens in Redis
function storeTokens(userId, accessToken, refreshToken) {
  // Use a hash to store both tokens under the user's ID
  client.hset(
    `user:${userId}`,
    "accessToken",
    accessToken,
    "refreshToken",
    refreshToken
  );
}

// Retrieve tokens from Redis
async function getTokens(userId) {
  const tokens = await client.hgetall(`user:${userId}`);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}
// Configure Passport.js
passport.use(
  new TwitchStrategy(
    {
      clientID: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      callbackURL: `${`https://${process.env.PUBLIC_URL}`}/auth/twitch/callback`,
      scope:
        "user:read:email moderator:read:followers channel:read:subscriptions channel:read:redemptions bits:read", // Add the required scope
    },
    (accessToken, refreshToken, profile, done) => {
      console.log("STORING IN REDIS: " + profile.id, accessToken, refreshToken);
      // Store the tokens in Redis
      storeTokens(profile.id, accessToken, refreshToken);

      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());

// Authentication routes
app.get("/auth/twitch", passport.authenticate("twitch"));
app.get(
  "/auth/twitch/callback",
  passport.authenticate("twitch", { failureRedirect: "/login" }),
  (req, res) => {
    // Successful authentication, redirect home.
    res.redirect(`${`https://${process.env.FRONTEND_URL}`}/user/dashboard`); // Redirect to your client's home page or any other page after successful authentication
  }
);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

app.get("/api/user", ensureAuthenticated, async (req, res) => {
  // Fetch the access token from Redis for the authenticated user
  const tokens = await getTokens(req.user.id);
  const accessToken = tokens.accessToken;

  try {
    const response = await fetch("https://api.twitch.tv/helix/users", {
      method: "GET",
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.use(express.static("public"));

app.get("/widget", (req, res) => {
  const widgetName = req.query.name; // Widget name is passed as a query parameter

  if (!widgetName) {
    return res.status(400).json({ error: "Widget name is required" });
  }

  const widgetPath = path.join(__dirname, "public", `${widgetName}.html`);

  // Read the widget HTML file dynamically
  fs.readFile(widgetPath, "utf8", (err, widgetMarkup) => {
    if (err) {
      console.error(`Failed to read ${widgetName}.html:`, err);
      return res.status(404).json({ error: "Widget not found" });
    }

    // Replace the placeholder with the backend URL
    const updatedMarkup = widgetMarkup.replace(
      /{{BACKEND_URL}}/g,
      `https://${process.env.PUBLIC_URL}`
    );

    // Set the appropriate content type and return the widget markup
    res.setHeader("Content-Type", "text/html");
    res.send(updatedMarkup);
  });
});

app.get("/api/follower-count", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const accessToken = await client.hget(`user:${userId}`, "accessToken");

    const queryParams = {
      broadcaster_id: userId,
    };

    const followerCountResponse = await fetch(
      "https://api.twitch.tv/helix/channels/followers?" +
        new URLSearchParams(queryParams) +
        "&first=1",
      {
        method: "GET",
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (followerCountResponse.status === 401) {
      // Token has expired. Refresh it.
      const refreshTokenResponse = await fetch(
        `${`https://${process.env.PUBLIC_URL}`}/refresh-token?userId=${userId}`
      );
      // If the refresh was successful, retry fetching the follower count.
      if (refreshTokenResponse.ok) {
        return res.redirect(`/api/follower-count?userId=${userId}`);
      } else {
        return res.status(401).json({ error: "Failed to refresh token" });
      }
    }

    const data = await followerCountResponse.json();

    if (followerCountResponse.ok) {
      res.json({ followerCount: data.total });
    } else {
      res.status(followerCountResponse.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch follower count" });
  }
});

app.get("/api/subscriber-count", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const accessToken = await client.hget(`user:${userId}`, "accessToken");

    const queryParams = {
      broadcaster_id: userId,
    };

    const subscriberCountResponse = await fetch(
      "https://api.twitch.tv/helix/subscriptions?" +
        new URLSearchParams(queryParams),
      {
        method: "GET",
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (subscriberCountResponse.status === 401) {
      // Token has expired. Refresh it.
      const refreshTokenResponse = await fetch(
        `${`https://${process.env.PUBLIC_URL}`}/refresh-token?userId=${userId}`
      );
      // If the refresh was successful, retry fetching the subscriber count.
      if (refreshTokenResponse.ok) {
        return res.redirect(`/api/subscriber-count?userId=${userId}`);
      } else {
        return res.status(401).json({ error: "Failed to refresh token" });
      }
    }

    const data = await subscriberCountResponse.json();

    if (subscriberCountResponse.ok) {
      res.json({ subscriberCount: data.total });
    } else {
      res.status(subscriberCountResponse.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch subscriber count" });
  }
});

async function getAppAccessToken() {
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID);
  url.searchParams.set("client_secret", process.env.TWITCH_CLIENT_SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set(
    "scope",
    "moderator:read:followers channel:read:subscriptions channel:read:redemptions bits:read"
  ); // Add the required scope

  try {
    const response = await fetch(url, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const expiresIn = data.expires_in;

    const expirationTimestamp = Date.now() + expiresIn * 1000; // Convert to milliseconds

    return data.access_token;
  } catch (error) {
    console.error("Failed to get app access token:", error);
    return null;
  }
}

async function getCurrentSubscriptions(appAccessToken) {
  const headers = {
    "Client-ID": process.env.TWITCH_CLIENT_ID,
    "Content-Type": "application/json",
    Authorization: `Bearer ${appAccessToken}`,
  };

  try {
    const response = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
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
    return data.data;
  } catch (error) {
    console.error("Failed to get current subscriptions:", error);
    return [];
  }
}

async function subscribeToEvent(
  eventType,
  userId,
  appAccessToken,
  callbackUrl
) {
  const currentSubscriptions = await getCurrentSubscriptions(appAccessToken);

  // Check if there's an existing subscription with the same parameters
  const existingSubscription = currentSubscriptions.find(
    (sub) =>
      sub.type === eventType && sub.condition.broadcaster_user_id === userId
  );

  if (existingSubscription) {
    console.log(
      `Subscription for ${eventType} already exists. Continuing to use the existing subscription.`
    );
    return { success: true, message: "Existing subscription found." };
  }

  const headers = {
    "Client-ID": process.env.TWITCH_CLIENT_ID,
    "Content-Type": "application/json",
    Authorization: `Bearer ${appAccessToken}`,
  };

  // Set the correct version for the event type
  const version = eventType === "channel.follow" ? "2" : "1";

  const body = {
    type: eventType,
    version: version,
    condition: {
      broadcaster_user_id: userId,
      moderator_user_id: userId,
    },
    transport: {
      method: "webhook",
      callback: callbackUrl,
      secret: process.env.TWITCH_WEBHOOK_SECRET,
    },
  };

  try {
    console.log(`Subscribing to ${eventType} webhook...`);
    const response = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Twitch API error response:", errorData);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`Subscription to ${eventType} successful.`);
    return { success: true, message: "Webhook subscription successful." };
  } catch (error) {
    console.error(`Failed to subscribe to ${eventType} event:`, error);
    return { success: false, message: "Failed to subscribe to webhook." };
  }
}

app.get("/subscribe-all-events", async (req, res) => {
  const appAccessToken = await getAppAccessToken();
  if (!appAccessToken) {
    console.error("Failed to get app access token");
    return res.status(500).send("Failed to get app access token");
  }

  const userId = req.user.id;
  const callbackUrl = `${`https://${process.env.PUBLIC_URL}`}/webhook-callback`;

  // Array of event types you want to subscribe to
  const eventTypes = ["channel.follow", "channel.subscribe", "channel.cheer"];

  const subscriptionResults = [];

  for (const eventType of eventTypes) {
    const result = await subscribeToEvent(
      eventType,
      userId,
      appAccessToken,
      callbackUrl
    );
    subscriptionResults.push({ eventType, ...result });
  }

  res.status(200).json(subscriptionResults);
});

app.post("/webhook-callback", async (req, res) => {
  // Verify that the request came from Twitch
  const signature = req.header("Twitch-Eventsub-Message-Signature");
  const messageId = req.header("Twitch-Eventsub-Message-Id");
  const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
  const message = messageId + timestamp + JSON.stringify(req.body);

  const hmac = crypto.createHmac("sha256", process.env.TWITCH_WEBHOOK_SECRET);
  hmac.update(message);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  if (signature !== expectedSignature) {
    console.error("Invalid signature, ignoring the request");
    return res.status(403).send("Forbidden");
  }

  // Handle the challenge for webhook subscription
  if (req.body.challenge) {
    return res.send(req.body.challenge);
  }

  // Process the webhook event
  const eventType = req.body.subscription.type;
  const eventData = req.body.event;

  if (!eventData) {
    return res.sendStatus(400);
  }

  console.log(`Received ${eventType} event: `, eventData);
  const broadcasterUserId = eventData.broadcaster_user_id;

  try {
    const accessToken = await client.hget(
      `user:${broadcasterUserId}`,
      "accessToken"
    );
    // Handle specific event types
    switch (eventType) {
      case "channel.follow":
        // Handle follow event
        console.log(
          "Handling follow event for broadcaster:",
          broadcasterUserId
        );

        if (!accessToken) {
          console.error("Access token not found for user:", broadcasterUserId);
          return res.sendStatus(500);
        }

        // Get follower count
        const followerCount = await getFollowerCount(
          broadcasterUserId,
          accessToken
        );

        console.log("Follower count:", followerCount);

        // Update the follower count in your application and notify the widget
        sendUpdateToUser(broadcasterUserId, {
          eventType: "channel.follow",
          followerCount,
        });

        break;

      case "channel.subscribe":
        console.log("New subscriber:", eventData);

        if (!accessToken) {
          console.error("Access token not found for user:", broadcasterUserId);
          return res.sendStatus(500);
        }
        // Get subscriber count using the helper function
        try {
          const subscriberCount = await getSubscriberCount(
            broadcasterUserId,
            accessToken
          );

          console.log("Subscriber count:", subscriberCount);

          // Update the subscriber count in your application and notify the widget
          sendUpdateToUser(broadcasterUserId, {
            eventType: "channel.subscribe",
            subscriber: eventData.user_name,
            subscriberCount,
          });
        } catch (error) {
          console.error("Error fetching subscriber count:", error);
        }
        break;

      case "channel.cheer":
        // Handle cheer event
        console.log("Bits cheered:", eventData);
        sendUpdateToUser(broadcasterUserId, {
          eventType: "channel.cheer",
          bits: eventData.bits,
          user: eventData.user_name,
        });
        break;

      // Add other event types if needed
      default:
        console.log("Unhandled event type:", eventType);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error processing webhook event:", error);
    res.sendStatus(500);
  }
});

const clients = new Map();

app.get("/sse", (req, res) => {
  const userId = req.query.userId;
  console.log("ESTABLISHING SSE CONNECTION FOR USER: " + userId);
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }

  const userClients = clients.get(userId);
  userClients.add(res);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  req.on("close", () => {
    userClients.delete(res);
    if (userClients.size === 0) {
      clients.delete(userId);
    }
  });
});

// When you need to send an update to a specific user, look up their Set of clients and send the update to each client
function sendUpdateToUser(userId, data) {
  if (clients.has(userId)) {
    clients.get(userId).forEach((client) => {
      console.log(
        "SENDING UPDATE TO USER: " +
          userId +
          " WITH DATA: " +
          JSON.stringify(data)
      );
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

app.get("/refresh-token", async (req, res) => {
  const userId = req.query.userId;
  const refreshToken = await client.hget(`user:${userId}`, "refreshToken");

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token not found" });
  }

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      // Update the access token and refresh token in memory (or in your database)
      await client.hset(`user:${userId}`, "accessToken", data.access_token);
      await client.hset(`user:${userId}`, "refreshToken", data.refresh_token);

      return res.json({ newToken: data.access_token });
    } else {
      return res.status(400).json({ error: "Failed to refresh token" });
    }
  } catch (error) {
    console.error("Error refreshing token:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

//test endpoints
app.post("/test/follower-event", (req, res) => {
  const userId = req.body.userId || "defaultUserId";
  const followerCount = req.body.followerCount || 100; // Simulated follower count

  sendUpdateToUser(userId, {
    eventType: "channel.follow",
    followerCount,
  });

  console.log(`Simulated follower event for user: ${userId}`);
  res.json({
    success: true,
    message: "Follower event triggered successfully.",
  });
});

app.post("/test/subscriber-event", (req, res) => {
  const userId = req.body.userId || "defaultUserId";
  const subscriberCount = req.body.subscriberCount || 10; // Simulated subscriber count
  const subscriberName = req.body.subscriberName || "TestSubscriber";

  sendUpdateToUser(userId, {
    eventType: "channel.subscribe",
    subscriber: subscriberName,
    subscriberCount,
  });

  console.log(`Simulated subscriber event for user: ${userId}`);
  res.json({
    success: true,
    message: "Subscriber event triggered successfully.",
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
