import axios from "axios";

const loginUrl = "https://api.autotraklive.com/api/Login";
const credentials = {
  Username: "export@strubingbusiness",
  Password: "4s6OJK5!b5QHv",
  ProductID: 51
};

(async () => {
  try {
    const res = await axios.post(loginUrl, credentials, {
      headers: { "Content-Type": "application/json" }
    });
    console.log("✅ Login success:", res.data);
  } catch (err) {
    console.error("❌ Login failed:", err.response?.status, err.response?.data);
  }
})();
