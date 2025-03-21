const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.du8ko.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // Keep the connection open
    console.log("Connected to MongoDB!");

    const gadgetCollection = client.db("gizmorentdb").collection("gadget");

    // Add a gadget
    app.post("/gadgets", async (req, res) => {
      try {
        const newGadget = req.body;
        const result = await gadgetCollection.insertOne(newGadget);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add gadget" });
      }
    });

    // Get all gadgets
    app.get("/gadgets", async (req, res) => {
      try {
        const result = await gadgetCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch gadgets" });
      }
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Gizmorent is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
