const express = require("express");
const net = require("net");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Raw TCP print - sends ONLY the content, NO HTTP headers
router.post("/raw", async (req, res) => {
  try {
    const { address, port, content } = req.body;

    if (!address || !content) {
      return res.status(400).json({ error: "address and content required" });
    }

    const printerPort = parseInt(port) || 9100;

    // Open raw TCP socket - NO HTTP, just raw bytes
    const client = new net.Socket();
    let responded = false;

    client.setTimeout(5000);

    client.connect(printerPort, address, () => {
      // Send ONLY the content - no HTTP headers
      client.write(content, "utf8", () => {
        client.end();
      });
    });

    client.on("close", () => {
      if (!responded) {
        responded = true;
        res.json({ success: true, method: "raw-tcp" });
      }
    });

    client.on("error", (err) => {
      console.error("[RAW PRINT] Socket error:", err.message);
      if (!responded) {
        responded = true;
        res.status(500).json({ error: "Cannot reach printer at " + address + ":" + printerPort });
      }
    });

    client.on("timeout", () => {
      client.destroy();
      if (!responded) {
        responded = true;
        res.status(500).json({ error: "Printer timeout at " + address + ":" + printerPort });
      }
    });

  } catch (error) {
    console.error("[RAW PRINT] error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;