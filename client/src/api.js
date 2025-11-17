import axios from "axios";

const api = axios.create({
  baseURL: "https://fleetpro-backend-production.up.railway.app/api"
});

export default api;
