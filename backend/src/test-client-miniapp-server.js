require("dotenv").config();

const express = require("express");
const telegramRouter = require("./routes/telegram");

const app = express();
const port = Number.parseInt(process.env.TELEGRAM_TEST_API_PORT || "3002", 10);

app.use(express.json({ limit: "2mb" }));
app.get("/health", (_req, res) => res.json({ success: true, service: "telegram-test-client" }));
app.use("/api/telegram", telegramRouter);

app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`telegram-test-client listening on 127.0.0.1:${port}\n`);
});
