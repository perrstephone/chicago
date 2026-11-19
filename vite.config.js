import { defineConfig, loadEnv } from "vite";
import { editorsDesk } from "./server/editors-desk.js";

export default defineConfig(({ mode }) => {
  // "" prefix loads every .env variable for the server only. Only VITE_* ones ever reach the browser,
  // so ADMIN_USER / ADMIN_PASSWORD stay on this computer.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [editorsDesk({ setupUser: env.ADMIN_USER, setupPassword: env.ADMIN_PASSWORD })],
  };
});
