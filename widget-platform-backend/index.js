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
        "user:read:email moderator:read:followers channel:read:subscriptions", // Add the required scope
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
  console.log("req.isAuthenticated():", req.isAuthenticated());
  console.log("req.user:", req.user);

  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

app.get("/api/user", ensureAuthenticated, async (req, res) => {
  // Fetch the access token from Redis for the authenticated user
  console.log("req.user.id: " + req.user.id);
  const tokens = await getTokens(req.user.id);
  const accessToken = tokens.accessToken;

  console.log("access token " + accessToken);

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
  // Read the widget.html file
  fs.readFile(
    path.join(__dirname, "public", "widget.html"),
    "utf8",
    (err, widgetMarkup) => {
      if (err) {
        console.error("Failed to read widget.html:", err);
        res.status(500).json({ error: "Failed to read widget.html" });
        return;
      }

      // Replace the placeholder with the backend URL
      const updatedMarkup = widgetMarkup.replace(
        /{{BACKEND_URL}}/g,
        `https://${process.env.PUBLIC_URL}`
      );

      // Set the appropriate content type and return the widget markup
      res.setHeader("Content-Type", "text/html");
      res.send(updatedMarkup);
    }
  );
});

app.get("/followerbar-two", (req, res) => {
  // Read the widget.html file
  fs.readFile(
    path.join(__dirname, "public", "followerbar-2.html"),
    "utf8",
    (err, widgetMarkup) => {
      if (err) {
        console.error("Failed to read widget.html:", err);
        res.status(500).json({ error: "Failed to read widget.html" });
        return;
      }

      // Set the appropriate content type and return the widget markup
      res.setHeader("Content-Type", "text/html");
      res.send(widgetMarkup);
    }
  );
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

async function getAppAccessToken() {
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID);
  url.searchParams.set("client_secret", process.env.TWITCH_CLIENT_SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("scope", "moderator:read:followers"); // Add the required scope

  try {
    const response = await fetch(url, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const expiresIn = data.expires_in;
    console.log("App access token expires in:", expiresIn);
    const expirationTimestamp = Date.now() + expiresIn * 1000; // Convert to milliseconds
    console.log("App access token expires in:", expirationTimestamp, "ms");
    return data.access_token;
  } catch (error) {
    console.error("Failed to get app access token:", error);
    return null;
  }
}

app.get("/subscribe-follow-webhook", async (req, res) => {
  const appAccessToken = await getAppAccessToken();
  console.log("User access token:", req.user.accessToken);
  console.log("User ID:", req.user.id);
  console.log("App Access Token:", appAccessToken);
  if (!appAccessToken) {
    console.error("Failed to get app access token");
    res.status(500).send("Failed to get app access token");
    return;
  }

  async function getCurrentSubscriptions() {
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
      console.log("Current subscriptions:", data);
      return data.data;
    } catch (error) {
      console.error("Failed to get current subscriptions:", error);
      return [];
    }
  }

  const callbackUrl = `${`https://${process.env.PUBLIC_URL}`}/webhook-callback`; // Replace with your callback URL

  const headers = {
    "Client-ID": process.env.TWITCH_CLIENT_ID,
    "Content-Type": "application/json",
    Authorization: `Bearer ${appAccessToken}`,
  };
  // Get the current subscriptions
  const currentSubscriptions = await getCurrentSubscriptions();

  // Check if there's an existing subscription with the same parameters
  const existingSubscription = currentSubscriptions.find(
    (sub) =>
      sub.type === "channel.follow" &&
      sub.condition.broadcaster_user_id === req.user.id
  );

  // If there's an existing subscription, return an error response
  if (existingSubscription) {
    console.log(
      "Subscription already exists. Continuing to use the existing subscription."
    );
    res.status(200).send("Existing subscription found. Continuing to use it.");
    return;
  }
  const body = {
    type: "channel.follow",
    version: "2",
    condition: {
      broadcaster_user_id: req.user.id,
      moderator_user_id: req.user.id,
    },
    transport: {
      method: "webhook",
      callback: callbackUrl,
      secret: process.env.TWITCH_WEBHOOK_SECRET, // Replace with your webhook secret
    },
  };

  try {
    console.log("Subscribing to webhook...");
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

    const data = await response.json();
    console.log("Webhook subscription data:", data);
    res.status(200).send("Webhook subscription successful");
  } catch (error) {
    console.error("Failed to subscribe to webhook:", error);
    res.status(500).send("Failed to subscribe to webhook");
  }
});

app.post("/webhook-callback", async (req, res) => {
  // Verify that the request came from Twitch
  console.log("request body: " + req.body);
  const signature = req.header("Twitch-Eventsub-Message-Signature");
  const messageId = req.header("Twitch-Eventsub-Message-Id");
  const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
  const message = messageId + timestamp + JSON.stringify(req.body);

  const hmac = crypto.createHmac("sha256", process.env.TWITCH_WEBHOOK_SECRET);
  hmac.update(message);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  if (signature !== expectedSignature) {
    console.error("Invalid signature, ignoring the request");
    res.status(403).send("Forbidden");
    return;
  }

  // Handle the challenge for webhook subscription
  if (req.body.challenge) {
    res.send(req.body.challenge);
    return;
  }

  // Process the webhook event
  const eventData = req.body.event;
  if (eventData) {
    console.log("event data: " + eventData);
    const broadcasterUserId = eventData.broadcaster_user_id;
    console.log("Broadcaster User ID:", broadcasterUserId);
    const accessToken = await client.hget(
      `user:${broadcasterUserId}`,
      "accessToken"
    );
    if (!accessToken) {
      console.error("Access token not found for user:", broadcasterUserId);
      res.sendStatus(500);
      return;
    }
    const followerCount = await getFollowerCount(
      broadcasterUserId,
      accessToken
    );
    console.log("Follower count:", followerCount);
    // Update the follower count in your application and notify the widget
    sendUpdateToUser(broadcasterUserId, followerCount);
  }

  res.sendStatus(200);
});
const clients = new Map();

app.get("/sse", (req, res) => {
  const userId = req.query.userId;

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

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
