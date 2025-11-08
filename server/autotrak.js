import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://api.autotraklive.com";
const PRODUCT_ID = "51";

const USERNAME = process.env.AUTOTRAK_USERNAME;
const PASSWORD = process.env.AUTOTRAK_PASSWORD;

const VEHICLES = [
  "LF08SCGP",
  "MF15BDGP",
  "JR33VNGP",
  "JP79CRGP",
  "JN67NSGP",
  "JN76PHGP",
  "MJ26FSGP",
  "JN67MXGP",
  "JY75LVGP",
];

// Step 1 – Login
async function login() {
  const loginUrl = `${BASE_URL}/api/Login`;
  console.log("🔐 Logging into Autotrak:", loginUrl);

  try {
    const res = await axios.post(loginUrl, {
      username: USERNAME,
      password: PASSWORD,
    });

    if (res.data?.token) {
      console.log("✅ Login success – token received");
      return res.data.token;
    } else {
      console.log("⚠️ Login succeeded but no token returned:", res.data);
      return null;
    }
  } catch (err) {
    console.error("❌ Login error:", err.response?.status, err.response?.data || err.message);
    return null;
  }
}

// Step 2 – Fetch live positions
export async function getVehiclePositions() {
  const token = await login();
  if (!token) {
    throw new Error("Login failed – cannot fetch live vehicle data");
  }

  const url = `${BASE_URL}/api/vehicleposition/GetVehiclePositionsByRegistration/${VEHICLES.join(",")}?productId=${PRODUCT_ID}`;
  console.log("🚚 Fetching live data from Autotrak:", url);

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    if (Array.isArray(res.data) && res.data.length > 0) {
      console.log(`✅ Received ${res.data.length} vehicles`);
      console.log("🔎 Raw API response:", JSON.stringify(res.data, null, 2));
      return res.data;
    } else {
      console.warn("⚠️ No vehicle data returned:", res.data);
      return [];
    }
  } catch (err) {
    console.error("❌ Autotrak error:", err.response?.status, err.response?.data || err.message);
    throw new Error("Autotrak live data fetch failed");
  }
}
