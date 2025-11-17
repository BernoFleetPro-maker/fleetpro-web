import axios from "axios";

const production = window.location.hostname.includes("railway");

const api = axios.create({
    baseURL: production
        ? "https://fleetpro-backend-production.up.railway.app"
        : "http://localhost:5000",
});

export default api;
