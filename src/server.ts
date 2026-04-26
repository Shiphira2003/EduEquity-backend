import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { config } from "./config";

app.listen(config.port, () => {
    console.log(`CFG Backend running in ${config.env} mode on port ${config.port}`);
});
