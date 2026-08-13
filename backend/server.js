const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const categoriesRoutes = require("./routes/categories");
const inventoryRoutes = require("./routes/inventory");
const syncRoutes = require("./routes/sync");
const ordersRoutes = require("./routes/orders");
const analyticsRoutes = require("./routes/analytics");
const modifiersRoutes = require("./routes/modifiers");
const storeRoutes = require("./routes/store");
const cashRoutes = require("./routes/cash");
const adminRoutes = require("./routes/admin");
const tablesRoutes = require("./routes/tables");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      "[" + new Date().toISOString() + "] " +
      req.method + " " + req.originalUrl +
      " -> " + res.statusCode +
      " (" + (Date.now() - start) + "ms)"
    );
  });
  next();
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});

app.use(globalLimiter);
app.use("/api/auth", authLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/modifiers", modifiersRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/reports", require("./routes/reports"));
app.use("/api/telegram", require("./routes/telegram"));
app.use("/api/users", require("./routes/users"));


app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
