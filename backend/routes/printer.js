const express = require("express");
const { exec } = require("child_process");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/printer/list — List all installed printers
router.get("/list", async (req, res) => {
  try {
    const isWindows = process.platform === "win32";
    
    let command;
    if (isWindows) {
      // Windows: Use PowerShell to get printers
      command = 'powershell.exe -Command "Get-Printer | Select-Object -ExpandProperty Name"';
    } else {
      // Mac/Linux: Use lpstat
      command = "lpstat -a 2>/dev/null | awk '{print $1}' || echo ''";
    }

    exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Printer list error:", error);
        return res.json({ printers: [], error: "Could not detect printers" });
      }

      const printers = stdout
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      res.json({ printers });
    });
  } catch (err) {
    console.error("Printer list failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;