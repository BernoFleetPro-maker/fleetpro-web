// server/server.js
// FleetPro — robust server to avoid duplicate tasks & return live vehicle data
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.resolve();

app.use(cors());
app.use(express.json());

// ---------- Storage ----------
const dataDir = path.join(__dirname, "data");
const tasksFile = path.join(dataDir, "tasks.json");
const driversFile = path.join(dataDir, "drivers.json");
const locationsFile = path.join(dataDir, "locations.json");
const vehiclesFile = path.join(dataDir, "vehicles.json");
const pointsFile = path.join(dataDir, "points.json");
const loadingPointsFile = path.join(dataDir, "loadingPoints.json");
const dropoffPointsFile = path.join(dataDir, "dropoffPoints.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
for (const f of [
  tasksFile,
  driversFile,
  locationsFile,
  vehiclesFile,
  pointsFile,
  loadingPointsFile,
  dropoffPointsFile,
]) {
  if (!fs.existsSync(f)) fs.writeFileSync(f, "[]", "utf8");
}

// ---------- Helpers ----------
function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed read JSON:", file, e);
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function normalizeDriverId(v) {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return String(v);
  const s = v.trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";
  return s;
}
function hasDriver(v) {
  return normalizeDriverId(v) !== "";
}
function nowISOString() {
  return new Date().toISOString();
}

// ---------- Routes ----------
app.get("/", (req, res) => res.send("✅ FleetPro server running"));

/* ---------------- TASKS ---------------- */
app.get("/api/tasks", (req, res) => {
  const tasks = readJSON(tasksFile);
  res.json(tasks);
});

app.post("/api/tasks", (req, res) => {
  try {
    const tasks = readJSON(tasksFile);
    const body = req.body || {};
    const driverId = normalizeDriverId(body.driverId);
    const id = Date.now().toString();
    const status = hasDriver(driverId) ? "todo" : "unassigned";

    const newTask = {
      id,
      title: body.title || "",
      loadLocation: body.loadLocation || "",
      dropoffLocation: body.dropoffLocation || "",
      extraDropoff: body.extraDropoff || "",
      orderNumber: body.orderNumber || "",
      driverId,
      date: body.date || "",
      time: body.time || "",
      description: body.description || "",
      status,
      createdAt: nowISOString(),
      updatedAt: nowISOString(),
    };

    tasks.push(newTask);
    writeJSON(tasksFile, tasks);
    console.log(`🟢 Created new task "${newTask.title || id}" → ${status.toUpperCase()}`);
    res.json(newTask);
  } catch (err) {
    console.error("POST /api/tasks error:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.put("/api/tasks/:id", (req, res) => {
  try {
    const tasks = readJSON(tasksFile);
    const id = String(req.params.id);
    const index = tasks.findIndex((t) => String(t.id) === id);
    if (index === -1) return res.status(404).json({ error: "Task not found" });

    const existing = tasks[index];
    const body = req.body || {};
    const driverId = normalizeDriverId(body.driverId ?? existing.driverId);

    const updated = {
      ...existing,
      ...body,
      driverId,
      updatedAt: nowISOString(),
    };

    updated.status = hasDriver(driverId) ? "todo" : "unassigned";
    if (!hasDriver(driverId)) updated.driverId = "";

    tasks[index] = updated;
    writeJSON(tasksFile, tasks);
    res.json(updated);
  } catch (err) {
    console.error("PUT /api/tasks/:id error:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

app.delete("/api/tasks/:id", (req, res) => {
  try {
    const tasks = readJSON(tasksFile);
    const id = String(req.params.id);
    const idx = tasks.findIndex((t) => String(t.id) === id);
    if (idx === -1) return res.status(404).json({ error: "Task not found" });
    const removed = tasks.splice(idx, 1);
    writeJSON(tasksFile, tasks);
    res.json(removed[0]);
  } catch (err) {
    console.error("DELETE /api/tasks/:id error:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

/* ---------------- DRIVERS ---------------- */
app.get("/api/drivers", (req, res) => {
  res.json(readJSON(driversFile));
});

app.post("/api/drivers", (req, res) => {
  try {
    const drivers = readJSON(driversFile);
    const id = Date.now().toString();
    const newDriver = {
      id,
      name: req.body.name || "",
      phone: req.body.phone || "",
      createdAt: nowISOString(),
      ...req.body,
    };
    drivers.push(newDriver);
    writeJSON(driversFile, drivers);
    res.json(newDriver);
  } catch (err) {
    console.error("POST /api/drivers error:", err);
    res.status(500).json({ error: "Failed to create driver" });
  }
});

app.put("/api/drivers/:id", (req, res) => {
  try {
    const drivers = readJSON(driversFile);
    const id = String(req.params.id);
    const index = drivers.findIndex((d) => String(d.id) === id);
    if (index === -1) return res.status(404).json({ error: "Driver not found" });

    const updated = { ...drivers[index], ...req.body, updatedAt: nowISOString() };
    drivers[index] = updated;
    writeJSON(driversFile, drivers);
    res.json(updated);
  } catch (err) {
    console.error("PUT /api/drivers/:id error:", err);
    res.status(500).json({ error: "Failed to update driver" });
  }
});

app.delete("/api/drivers/:id", (req, res) => {
  try {
    const drivers = readJSON(driversFile);
    const id = String(req.params.id);
    const idx = drivers.findIndex((d) => String(d.id) === id);
    if (idx === -1) return res.status(404).json({ error: "Driver not found" });
    const removed = drivers.splice(idx, 1);
    writeJSON(driversFile, drivers);
    res.json(removed[0]);
  } catch (err) {
    console.error("DELETE /api/drivers/:id error:", err);
    res.status(500).json({ error: "Failed to delete driver" });
  }
});

/* ---------------- LOCATIONS ---------------- */
app.get("/api/locations", (req, res) => {
  res.json(readJSON(locationsFile));
});

app.post("/api/locations", (req, res) => {
  try {
    const locations = readJSON(locationsFile);
    const id = Date.now().toString();
    const newLoc = {
      id,
      title: req.body.title || "",
      address: req.body.address || "",
      lat: req.body.lat || null,
      lon: req.body.lon || null,
      type: req.body.type || "",
      createdAt: nowISOString(),
      ...req.body,
    };
    locations.push(newLoc);
    writeJSON(locationsFile, locations);
    res.json(newLoc);
  } catch (err) {
    console.error("POST /api/locations error:", err);
    res.status(500).json({ error: "Failed to create location" });
  }
});

/* ---------------- VEHICLES ---------------- */
app.get("/api/vehicles", (req, res) => {
  res.json(readJSON(vehiclesFile));
});

app.post("/api/vehicles", (req, res) => {
  try {
    const vehicles = readJSON(vehiclesFile);
    const id = Date.now().toString();
    const newVehicle = {
      id,
      reg: (req.body.reg || "").toUpperCase(),
      description: req.body.description || "",
      createdAt: nowISOString(),
      ...req.body,
    };
    vehicles.push(newVehicle);
    writeJSON(vehiclesFile, vehicles);
    res.json(newVehicle);
  } catch (err) {
    console.error("POST /api/vehicles error:", err);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});

/* ---------------- POINTS ---------------- */
// ✅ All loading/dropoff points now use locations.json
app.get("/api/points", (req, res) => {
  try {
    const locations = readJSON(locationsFile);
    const combined = locations.filter(
      (loc) =>
        loc.type &&
        (loc.type.toLowerCase() === "loading" || loc.type.toLowerCase() === "dropoff")
    );
    res.json(combined);
  } catch (err) {
    console.error("GET /api/points error:", err);
    res.status(500).json({ error: "Failed to read points" });
  }
});

// ✅ Create new loading or dropoff point
app.post("/api/points", (req, res) => {
  try {
    const locations = readJSON(locationsFile);
    const id = Date.now().toString();
    const { title, type, link } = req.body;

    if (!title || !type)
      return res.status(400).json({ error: "title and type required" });

    const newPoint = {
      id,
      title,
      type: type.toLowerCase(),
      link: link || "",
      createdAt: nowISOString(),
    };

    locations.push(newPoint);
    writeJSON(locationsFile, locations);
    res.json(newPoint);
  } catch (err) {
    console.error("POST /api/points error:", err);
    res.status(500).json({ error: "Failed to create point" });
  }
});

// ✅ Edit an existing point
app.put("/api/points/:id", (req, res) => {
  try {
    const locations = readJSON(locationsFile);
    const id = String(req.params.id);
    const idx = locations.findIndex((l) => String(l.id) === id);
    if (idx === -1) return res.status(404).json({ error: "Point not found" });

    locations[idx] = {
      ...locations[idx],
      ...req.body,
      updatedAt: nowISOString(),
    };

    writeJSON(locationsFile, locations);
    res.json(locations[idx]);
  } catch (err) {
    console.error("PUT /api/points/:id error:", err);
    res.status(500).json({ error: "Failed to update point" });
  }
});

// ✅ Delete a point
app.delete("/api/points/:id", (req, res) => {
  try {
    const locations = readJSON(locationsFile);
    const id = String(req.params.id);
    const idx = locations.findIndex((l) => String(l.id) === id);
    if (idx === -1) return res.status(404).json({ error: "Point not found" });

    const removed = locations.splice(idx, 1);
    writeJSON(locationsFile, locations);
    res.json(removed[0]);
  } catch (err) {
    console.error("DELETE /api/points/:id error:", err);
    res.status(500).json({ error: "Failed to delete point" });
  }
});

/* ---------------- AUTOTRAK / POSITIONS ---------------- */
app.get("/api/positions", async (req, res) => {
  const username = process.env.AUTOTRAK_USERNAME;
  const password = process.env.AUTOTRAK_PASSWORD;
  const productId = process.env.AUTOTRAK_PRODUCT_ID || "51";
  const defaultRegs =
    "JY75LVGP,LF08SCGP,MF15BDGP,JR33VNGP,JP79CRGP,JN67NSGP,JN76PHGP,MJ26FSGP,JN67MXGP";
  const registrations = process.env.AUTOTRAK_REGISTRATIONS || defaultRegs;

  if (!username || !password) {
    console.warn("⚠️ Missing AUTOTRAK credentials — returning empty list.");
    return res.json([]);
  }

  try {
    const url = `https://api.autotraklive.com/vehicleposition/GetVehiclePositionsByRegistration/${registrations}?productId=${productId}`;
    console.log("🚚 Fetching live data from Autotrak:", url);

    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
      timeout: 15000,
    });

    const data = response.data || [];
    if (!Array.isArray(data)) {
      if (data && Array.isArray(data.result)) return res.json(data.result);
      return res.json([]);
    }

    res.json(data);
  } catch (err) {
    console.error("❌ Autotrak fetch error:", err?.response?.status, err?.message || err);
    res.status(500).json({
      error: "Failed to fetch Autotrak positions",
      detail: err?.message || "",
    });
  }
});

/* ---------------- START ---------------- */
app.listen(PORT, () => {
  console.log(`✅ FleetPro server listening on http://localhost:${PORT}`);
});
