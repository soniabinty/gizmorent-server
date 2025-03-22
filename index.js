const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

    // gadgets filter and search

    app.get("/gadgets/search", async (req, res) => {
      const { query, category, minPrice, maxPrice, sort } = req.query;

      const filter = {};

      // Filter by category
      if (category && category !== "All") {
        filter.category = category;
      }

      // Filter by search query
      if (query) {
        filter.$or = [
          { name: { $regex: query, $options: "i" } },
          { category: { $regex: query, $options: "i" } },
        ];
      }

      // price filter
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // sort
      let sortOption = {};
      if (sort === "HighToLow") {
        sortOption = { price: -1 };
      } else if (sort === "LowToHigh") {
        sortOption = { price: 1 };
      }

      try {
        const gadgets = await gadgetCollection
          .find(filter)
          .sort(sortOption)
          .toArray();
        res.send(gadgets);
      } catch (error) {
        res.status(500).json({ message: "Error fetching gadgets", error });
      }
    });


    // add from here

    
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
